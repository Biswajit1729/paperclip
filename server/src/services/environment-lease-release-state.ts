import { and, eq, or, sql } from "drizzle-orm";
import { environmentLeases, type Db } from "@paperclipai/db";
import type { ProviderResourceDisposition } from "./environment-runtime.js";
import { ENVIRONMENT_CLEANUP_RETRY_MS, pendingCleanupDeadlineSql } from "./environment-cleanup-state.js";

/** The release owner also accepts its stop/retention handoffs. Ordinary
 * pending cleanup belongs to the cleanup worker; retained success is history. */
export function pendingRunLeaseReleaseCondition(destroy: boolean) {
  return or(eq(environmentLeases.status, "active"),
    and(eq(environmentLeases.status, "pending_cleanup"),
      sql`(${environmentLeases.metadata} ? 'nativeWorkspaceExportResume' or ${environmentLeases.metadata} ? 'sandboxStopAndRetain')`),
    destroy ? and(eq(environmentLeases.status, "retained"), eq(environmentLeases.cleanupStatus, "failed")) : undefined);
}

export async function nextRunLeaseReleaseAt(db: Db, companyId: string, runId: string,
  disposition: ProviderResourceDisposition): Promise<number | null> {
  const [row] = await db.select({ due: sql<string | null>`min(case
    when ${environmentLeases.status} = 'pending_cleanup' then greatest(
      extract(epoch from ${environmentLeases.updatedAt}) * 1000 + ${ENVIRONMENT_CLEANUP_RETRY_MS},
      ${pendingCleanupDeadlineSql()}) else 0 end)` }).from(environmentLeases)
    .where(and(eq(environmentLeases.companyId, companyId), eq(environmentLeases.heartbeatRunId, runId),
      pendingRunLeaseReleaseCondition(disposition === "destroy")));
  return row?.due == null ? null : Number(row.due);
}
