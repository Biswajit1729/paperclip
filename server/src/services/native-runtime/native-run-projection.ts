import { pendingNativeStatusEffectsCondition } from "./native-pending-effect-work.js";
import { notifyNativeRunProjection } from "../native-run-projection-notifications.js";
import { randomUUID } from "node:crypto";
import { and, eq, exists, inArray, isNotNull, isNull, not, or, sql, type SQL } from "drizzle-orm";
import { heartbeatRuns, nativeRunFinalizations, nativeRunResults, type Db } from "@paperclipai/db";
import { notifyRetainedNativeSessionCleanup } from "../retained-native-session-cleanup-notifications.js";
import { notifyInstructionCollection } from "../instruction-collection-notifications.js";
import { notifyCancelledWorkspacePreservation } from "../cancelled-workspace-preservation-notifications.js";
import { notifyUnsafeWorkspaceExportRunChange } from "../unsafe-workspace-export-notifications.js";
import { DELIVERY_QUEUES, notifyDeliveryWork } from "../delivery-work-notifications.js";
import { notifyExecutionRunWork } from "../execution-control-notifications.js";
import { notifyChatRunMilestones } from "../chat-run-milestone-notifications.js";
import { emitAgentTaskRun } from "../agent-task-run-telemetry.js";
import { isNewTerminalRunFailure, reportRunFailure } from "../run-failure-report.js";
import { nativeRunnerOwnershipNotHeldCondition } from "./native-runner-ownership.js";

/** Server-owned terminal conversion used by live finalization and read models. */
export function projectNativeTerminalRunStatus(
  terminalState: "succeeded" | "failed" | "cancelled" | "active",
) {
  return terminalState === "active" ? ("running" as const) : terminalState;
}

/** Shared by discovery and the final projection CAS. A terminal record alone
 * is not pending work; only the existing repairable mismatch counts. */
export function nativeRunProjectionNeedsRepair(projectedStatus: "succeeded" | "failed" | "cancelled" | SQL) {
  return and(
    eq(heartbeatRuns.runtimeMode, "native"),
    or(
      inArray(heartbeatRuns.status, ["queued", "running", "failed"]),
      and(
        eq(heartbeatRuns.status, "succeeded"),
        or(
          isNotNull(heartbeatRuns.error),
          isNotNull(heartbeatRuns.errorCode),
          isNull(heartbeatRuns.finishedAt),
          sql`${heartbeatRuns.nativePhase} is distinct from 'committed'`,
          sql`${heartbeatRuns.resultJson}->>'finalizationPhase' is distinct from 'committed'`,
          sql`${heartbeatRuns.resultJson}->>'nextAttemptAt' is not null`,
          sql`${heartbeatRuns.resultJson}->>'failureCode' is not null`,
          sql`${heartbeatRuns.resultJson}->>'originalFailureCode' is not null`,
        ),
      ),
    ),
    // Reconciliation revisits committed results periodically. Only repair
    // a changed projection; rewriting an unchanged failed run would mint a
    // fresh status delivery (and failure toast) on every sweep. Check the
    // current row so concurrent replays cannot both queue the same repair.
    or(
      sql`${heartbeatRuns.status} is distinct from ${projectedStatus}`,
      isNull(heartbeatRuns.finishedAt),
      sql`${heartbeatRuns.nativePhase} is distinct from 'committed'`,
      sql`${heartbeatRuns.resultJson}->>'finalizationPhase' is distinct from 'committed'`,
      sql`${heartbeatRuns.resultJson}->>'nextAttemptAt' is not null`,
      sql`${heartbeatRuns.resultJson}->>'failureCode' is not null`,
      sql`${heartbeatRuns.resultJson}->>'originalFailureCode' is not null`,
      and(sql`${projectedStatus} = 'succeeded'`, or(isNotNull(heartbeatRuns.error), isNotNull(heartbeatRuns.errorCode))),
    ),
    nativeRunnerOwnershipNotHeldCondition(),
  );
}

/** Correlates the outer run/coordinator to its accepted result without reading
 * result payloads or issuing a separate query for each retained coordinator. */
export function pendingNativeRunProjectionCondition(db: Db) {
  const status = sql<string>`${nativeRunResults.resultJson}->'terminal'->>'runTerminalState'`;
  return exists(db.select({ id: nativeRunResults.id }).from(nativeRunResults).where(and(
    eq(nativeRunResults.id, nativeRunFinalizations.resultId),
    eq(nativeRunResults.runId, nativeRunFinalizations.runId),
    eq(nativeRunResults.companyId, nativeRunFinalizations.companyId),
    eq(nativeRunResults.issueId, nativeRunFinalizations.issueId),
    eq(nativeRunResults.schemaStatus, "accepted"),
    inArray(status, ["succeeded", "failed", "cancelled"]),
    nativeRunProjectionNeedsRepair(status),
  )));
}

export function recoveredExecutionFailureMetadata() {
  // Read the row being updated so a concurrent cleanup diagnostic is retained.
  return sql`case when ${heartbeatRuns.error} is not null or ${heartbeatRuns.errorCode} is not null
    then jsonb_build_object('recoveredExecutionFailure', jsonb_build_object(
      'schema', 'paperclip.recovered_execution_failure.v1',
      'errorCode', ${heartbeatRuns.errorCode}, 'error', ${heartbeatRuns.error},
      'observedAt', ${heartbeatRuns.updatedAt}
    )) else '{}'::jsonb end`;
}

export async function projectCommittedRun(input: {
  db: Db;
  onlyWhenEffectsSettled?: boolean;
  run: Pick<typeof heartbeatRuns.$inferSelect, "id" | "companyId" | "status" | "finishedAt" | "runtimeMode" | "nativePhase" | "nativeIssueId" | "contextSnapshot">;
  coordinator: Pick<typeof nativeRunFinalizations.$inferSelect, "resultId" | "issueId">;
}) {
  if (!input.coordinator.resultId) return;
  const resultRow = await input.db
    .select({ terminalState: sql<string>`${nativeRunResults.resultJson}->'terminal'->>'runTerminalState'` })
    .from(nativeRunResults)
    .where(
      and(
        eq(nativeRunResults.id, input.coordinator.resultId),
        eq(nativeRunResults.runId, input.run.id),
        eq(nativeRunResults.companyId, input.run.companyId),
        eq(nativeRunResults.issueId, input.coordinator.issueId),
        eq(nativeRunResults.schemaStatus, "accepted"),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
  const terminalState = resultRow?.terminalState;
  if (!["succeeded", "failed", "cancelled"].includes(String(terminalState))) {
    throw new Error("native_finalization_invalid");
  }
  const projectedStatus = terminalState as "succeeded" | "failed" | "cancelled";
  const needsRepair = and(eq(heartbeatRuns.id, input.run.id), eq(heartbeatRuns.companyId, input.run.companyId),
    eq(heartbeatRuns.nativeIssueId, input.coordinator.issueId), nativeRunProjectionNeedsRepair(projectedStatus),
    exists(input.db.select({ runId: nativeRunFinalizations.runId }).from(nativeRunFinalizations).where(and(
      eq(nativeRunFinalizations.runId, input.run.id), eq(nativeRunFinalizations.companyId, input.run.companyId),
      eq(nativeRunFinalizations.issueId, input.coordinator.issueId), eq(nativeRunFinalizations.resultId, input.coordinator.resultId),
      eq(nativeRunFinalizations.phase, "committed"),
      input.onlyWhenEffectsSettled ? not(pendingNativeStatusEffectsCondition(input.db)) : undefined,
    ))));
  const now = new Date();
  const projected = await input.db.transaction(async transaction => {
    const tx = transaction as unknown as Db;
    const [before] = await tx.select({ status: heartbeatRuns.status, runtimeMode: heartbeatRuns.runtimeMode,
      nativePhase: heartbeatRuns.nativePhase, finishedAt: heartbeatRuns.finishedAt })
      .from(heartbeatRuns).where(needsRepair).for("update").limit(1);
    if (!before) return null;
    await notifyNativeRunProjection(tx, { companyId: input.run.companyId, runId: input.run.id });
    await notifyRetainedNativeSessionCleanup(tx, { companyId: input.run.companyId, runId: input.run.id });
    await notifyInstructionCollection(tx, { companyId: input.run.companyId, runId: input.run.id });
    await notifyCancelledWorkspacePreservation(tx, { companyId: input.run.companyId, runId: input.run.id });
    await notifyUnsafeWorkspaceExportRunChange(tx, input.run);
    await notifyDeliveryWork(tx, DELIVERY_QUEUES.accounting, input.run.companyId);
    await notifyExecutionRunWork(tx);
    await notifyChatRunMilestones(tx, { companyId: input.run.companyId, issueId: input.coordinator.issueId });
    const [after] = await tx
      .update(heartbeatRuns)
      .set({
        executionStatusDeliveryId: randomUUID(),
        status: projectedStatus,
        finishedAt: before.finishedAt ?? now,
        nativePhase: "committed",
        nativePhaseUpdatedAt: now,
        ...(terminalState === "succeeded"
          ? {
              error: null,
              errorCode: null,
              // Capture the row being updated, not the earlier admission read:
              // cleanup may have recorded a new diagnostic in the meantime.
              // Other result metadata and all physical-owner evidence stay put.
              resultJson: sql`coalesce(${heartbeatRuns.resultJson}, '{}'::jsonb)
                || ${recoveredExecutionFailureMetadata()}
                || jsonb_build_object('finalizationPhase', 'committed', 'failureCode', null, 'originalFailureCode', null, 'nextAttemptAt', null)`,
            }
          : { resultJson: sql`coalesce(${heartbeatRuns.resultJson}, '{}'::jsonb) || jsonb_build_object('finalizationPhase', 'committed', 'failureCode', null, 'originalFailureCode', null, 'nextAttemptAt', null)` }),
        updatedAt: now,
      })
      .where(needsRepair)
      .returning();
    return after ? { before, after } : null;
  });
  // Metadata repairs can preserve the terminal status. Only a genuine status
  // transition should emit another terminal event. A failed run that leaves a
  // pending retry still needs its first failure report.
  if (projected && projected.after.status !== projected.before.status) {
    await emitAgentTaskRun(input.db, projected.after);
    void reportRunFailure(input.db, projected.after);
  } else if (projected && isNewTerminalRunFailure(projected.before, projected.after)) {
    void reportRunFailure(input.db, projected.after);
  }
}
