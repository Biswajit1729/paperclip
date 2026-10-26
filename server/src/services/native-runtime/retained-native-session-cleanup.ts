import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { heartbeatRuns, nativeRunFinalizations, nativeRunResults, type Db } from "@paperclipai/db";
import { nativeRunnerOwnershipNotHeldCondition } from "./native-runner-ownership.js";

export type RetainedNativeSessionCleanupScope = {
  companyId: string;
  runId?: string;
  issueId?: string;
  agentId?: string;
};

/** Discovery grants no physical cleanup authority. Scheduled callers include
 * leased candidates so a future lease deadline cannot disappear during startup
 * reconstruction; execution still rechecks the lease and exact physical state. */
export function findRetainedNativeSessionCleanupCandidates(db: Db, options: {
  scope?: RetainedNativeSessionCleanupScope;
  after?: string;
  limit: number;
  includeLeased?: boolean;
}) {
  return db
    .select({
      runId: heartbeatRuns.id,
      companyId: heartbeatRuns.companyId,
      issueId: nativeRunFinalizations.issueId,
      agentId: heartbeatRuns.agentId,
      leaseOwner: nativeRunFinalizations.leaseOwner,
      leaseExpiresAt: nativeRunFinalizations.leaseExpiresAt,
    })
    .from(heartbeatRuns)
    .innerJoin(
      nativeRunFinalizations,
      and(
        eq(nativeRunFinalizations.runId, heartbeatRuns.id),
        eq(nativeRunFinalizations.companyId, heartbeatRuns.companyId),
        eq(nativeRunFinalizations.issueId, heartbeatRuns.nativeIssueId),
      ),
    )
    .innerJoin(
      nativeRunResults,
      and(
        eq(nativeRunResults.id, nativeRunFinalizations.resultId),
        eq(nativeRunResults.runId, heartbeatRuns.id),
        eq(nativeRunResults.companyId, heartbeatRuns.companyId),
        eq(nativeRunResults.issueId, heartbeatRuns.nativeIssueId),
      ),
    )
    .where(
      and(
        eq(heartbeatRuns.runtimeMode, "native"),
        inArray(heartbeatRuns.status, ["succeeded", "failed"]),
        isNotNull(heartbeatRuns.finishedAt),
        nativeRunnerOwnershipNotHeldCondition(),
        eq(nativeRunFinalizations.phase, "committed"),
        eq(nativeRunResults.schemaStatus, "accepted"),
        isNotNull(nativeRunFinalizations.assessmentId),
        isNotNull(nativeRunFinalizations.decisionId),
        isNull(nativeRunFinalizations.nextAttemptAt),
        options.includeLeased ? undefined : or(
          isNull(nativeRunFinalizations.leaseOwner),
          isNull(nativeRunFinalizations.leaseExpiresAt),
          lte(nativeRunFinalizations.leaseExpiresAt, sql`now()`),
        ),
        // The accepted-result projector preserves a recovered close failure
        // privately after clearing the visible successful run's stale error.
        sql`coalesce(${heartbeatRuns.errorCode}, ${heartbeatRuns.resultJson}->'recoveredExecutionFailure'->>'errorCode') in ('adapter_failed', 'provider_transport_failed')`,
        sql`coalesce(${heartbeatRuns.error}, ${heartbeatRuns.resultJson}->'recoveredExecutionFailure'->>'error') = 'provider_transport_failed: runner did not durably suspend before checkpoint'`,
        sql`not (${nativeRunFinalizations.recoveryHistory} @> '[{"kind":"native_cleanup_runner_epoch"}]'::jsonb)`,
        sql`not (${nativeRunFinalizations.recoveryHistory} @> '[{"kind":"native_cleanup_source_archive","phase":"operator_required"}]'::jsonb)`,
        // One legacy pre-ownership attempt may be inspected by the closed,
        // artifact-pinned no-launch verifier. Discovery grants no authority
        // to reuse its directory or start a provider. New recorded epochs,
        // staged attempts and ambiguous histories never enter this lane.
        sql`(
          select coalesce(
            jsonb_array_length(history.entries) = 0 or (
              jsonb_array_length(history.entries) = 2
              and history.entries->0->>'version' = '1'
              and history.entries->1->>'version' = '1'
              and history.entries->0->>'phase' = 'started'
              and history.entries->1->>'phase' = 'operator_required'
              and history.entries->1->>'code' = 'native_cleanup_maintenance_unproven'
              and history.entries->0->>'requestId' like 'native-cleanup:%'
              and history.entries->0->>'requestId' = history.entries->1->>'requestId'
              and history.entries->0->>'sourceFingerprint' ~ '^[a-f0-9]{64}$'
            ), false
          )
          from (
            select coalesce(jsonb_agg(entry.value order by entry.ordinal), '[]'::jsonb) as entries
            from jsonb_array_elements(${nativeRunFinalizations.recoveryHistory})
              with ordinality as entry(value, ordinal)
            where entry.value->>'kind' = 'native_cleanup_maintenance'
          ) history
        )`,
        options.scope ? and(
          eq(heartbeatRuns.companyId, options.scope.companyId),
          options.scope.runId ? eq(heartbeatRuns.id, options.scope.runId) : undefined,
          options.scope.issueId ? eq(nativeRunFinalizations.issueId, options.scope.issueId) : undefined,
          options.scope.agentId ? eq(heartbeatRuns.agentId, options.scope.agentId) : undefined,
        ) : undefined,
        options.after ? gt(heartbeatRuns.id, options.after) : undefined,
      ),
    )
    .orderBy(asc(heartbeatRuns.id))
    .limit(options.limit);
}

export type NativeCleanupOutcome = {
  runId: string;
  status: "settled" | "not_eligible" | "operator_required";
} | {
  runId: string;
  status: "deferred";
  waitFor: "process_exit" | "session_release" | "environment_release" | "maintenance_settlement";
} | {
  runId: string;
  status: "deferred";
  waitFor: "lease_expiry";
  retryAt: Date;
};
type NativeCleanupSweep = {
  cursor: string | null;
  pending: Promise<NativeCleanupOutcome[]> | null;
};
const nativeCleanupSweeps = new WeakMap<Db, NativeCleanupSweep>();

/** Candidate discovery is not cleanup authority. The exact-state operation
 * claims its own durable lease and rechecks every physical owner. Keep this
 * lane joined and bounded, and advance even past ineligible candidates so one
 * damaged checkpoint cannot starve another company's recoverable session. */
export function reconcileRetainedNativeSessionCleanups(
  db: Db,
  options: {
    cleanup: (input: {
      companyId: string;
      runId: string;
    }) => Promise<NativeCleanupOutcome>;
    onError?: (error: unknown, runId: string) => void;
    limit?: number;
  },
): Promise<NativeCleanupOutcome[]> {
  let sweep = nativeCleanupSweeps.get(db);
  if (!sweep) {
    sweep = { cursor: null, pending: null };
    nativeCleanupSweeps.set(db, sweep);
  }
  if (sweep.pending) return sweep.pending;
  const owned = sweep;
  const limit = Number.isInteger(options.limit)
    ? Math.max(1, Math.min(5, options.limit!))
    : 1;
  const operation = async () => {
    const selectCandidates = (cursor: string | null) =>
      findRetainedNativeSessionCleanupCandidates(db, { after: cursor ?? undefined, limit });
    let candidates = await selectCandidates(owned.cursor);
    if (candidates.length === 0 && owned.cursor !== null) {
      owned.cursor = null;
      candidates = await selectCandidates(null);
    }
    const outcomes: NativeCleanupOutcome[] = [];
    for (const candidate of candidates) {
      owned.cursor = candidate.runId;
      try {
        outcomes.push(await options.cleanup({ companyId: candidate.companyId, runId: candidate.runId }));
      } catch (error) {
        options.onError?.(error, candidate.runId);
      }
    }
    return outcomes;
  };
  // Deferring the query one microtask installs the joined owner before any
  // asynchronous work begins. Cleanup never creates a heartbeat or wake.
  const pending = Promise.resolve()
    .then(operation)
    .finally(() => {
      if (owned.pending === pending) owned.pending = null;
    });
  owned.pending = pending;
  return pending;
}

