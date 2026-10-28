import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { heartbeatRuns, nativeRunFinalizations } from "@paperclipai/db";
import { listQuarantinedNativeSessionCleanupRuns } from "../../vendor/paperclip-runner/index.js";
import { appendHeartbeatRunEvent } from "../heartbeat-run-events.js";

const SWEEP_LIMIT = 5;
const TERMINAL_STATUSES = ["failed", "cancelled", "interrupted", "timed_out"];

type StoppedProof = { evidence: Record<string, unknown>; retire: () => boolean } | null;

export interface StoppedNativeQuarantineSweepDeps {
  listQuarantined?: () => { companyId: string; runId: string }[];
  verifyStopped?: (db: Db, run: typeof heartbeatRuns.$inferSelect) => Promise<StoppedProof>;
  appendEvent?: typeof appendHeartbeatRunEvent;
}

/** A settled local native run whose provider close failed leaves an in-memory
 * operator-only quarantine that denies every later admission on the same
 * backend. Retire it only for terminal-failure runs with no finalization lease
 * owner, after the same stopped-conversation proof explicit continuation uses. */
export async function retireVerifiedStoppedNativeQuarantines(
  db: Db,
  deps: StoppedNativeQuarantineSweepDeps = {},
): Promise<string[]> {
  const candidates = (deps.listQuarantined ?? listQuarantinedNativeSessionCleanupRuns)();
  if (!candidates.length) return [];
  const verifyStopped = deps.verifyStopped ?? (async (database, run) => {
    const { verifyStoppedNativeSessionForContinuation } = await import("./native-session-executor.js");
    return verifyStoppedNativeSessionForContinuation(database, run);
  });
  const appendEvent = deps.appendEvent ?? appendHeartbeatRunEvent;
  const rows = await db.select({ run: heartbeatRuns })
    .from(heartbeatRuns)
    .innerJoin(nativeRunFinalizations, eq(nativeRunFinalizations.runId, heartbeatRuns.id))
    .where(and(
      inArray(heartbeatRuns.id, candidates.map(candidate => candidate.runId)),
      eq(heartbeatRuns.runtimeMode, "native"),
      inArray(heartbeatRuns.status, TERMINAL_STATUSES),
      isNotNull(heartbeatRuns.finishedAt),
      eq(nativeRunFinalizations.phase, "terminal_failure"),
      isNull(nativeRunFinalizations.leaseOwner),
    ))
    .limit(SWEEP_LIMIT);
  const retired: string[] = [];
  for (const { run } of rows) {
    if (!candidates.some(candidate => candidate.runId === run.id && candidate.companyId === run.companyId)) continue;
    const stopped = await verifyStopped(db, run);
    if (!stopped || !stopped.retire()) continue;
    retired.push(run.id);
    await appendEvent(db, {
      companyId: run.companyId, runId: run.id, agentId: run.agentId,
      eventType: "native.stopped_conversation_verified", stream: "system", level: "info",
      message: "The old runner and provider stopped. Its session cleanup quarantine was retired; later runs use a fresh session.",
      payload: stopped.evidence,
    });
  }
  return retired;
}
