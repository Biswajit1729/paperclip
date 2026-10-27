import path from "node:path";
import type { Db } from "@paperclipai/db";
import type { createDeliveryWorkCoordinator } from "./delivery-work-coordinator.js";
import { DELIVERY_QUEUES } from "./delivery-work-notifications.js";
import { registerScopedDeadlineWork } from "./scoped-deadline-work.js";
import { importTransferSpoolDeadline, isImportTransferRunId, listImportTransferSpools,
  onImportTransferSpoolChange, readImportTransferSpool, settleImportTransferSpool } from "./company-import-transfers.js";

type Entry = { id: string; companyId: string; dueAt: number };

export function registerImportSpoolCleanupWork(db: Db, coordinator: ReturnType<typeof createDeliveryWorkCoordinator>,
  spoolRoot: string, canRun: () => boolean) {
  const root = path.resolve(spoolRoot);
  async function read(id: string): Promise<Entry | null> {
    const spool = await readImportTransferSpool(db, root, id);
    if (!spool) return null;
    const dueAt = importTransferSpoolDeadline(spool);
    // Imports precede company creation; this label is only a fair-batch group,
    // never an authorization scope. Orphans share the instance cleanup group.
    return dueAt === null ? null : { id, companyId: spool.run?.companyId ?? "import-spools-without-company", dueAt };
  }
  const worker = registerScopedDeadlineWork(coordinator, {
    queue: DELIVERY_QUEUES.importSpoolCleanup,
    decodeScope: (hint: string) => {
      if (hint === "*") return undefined;
      if (!isImportTransferRunId(hint)) throw new Error("Invalid import spool scope");
      return hint;
    },
    matches: (entry: Entry, scope?: string) => !scope || entry.id === scope,
    load: async (scope, signal) => {
      const entries: Entry[] = [];
      for (const id of scope ? [scope] : await listImportTransferSpools(root)) {
        if (signal?.aborted || !canRun()) throw new Error("Import spool discovery paused");
        const entry = await read(id);
        if (entry) entries.push(entry);
      }
      return entries;
    },
    check: async (entry, signal) => {
      if (signal?.aborted || !canRun()) throw new Error("Import spool cleanup paused");
      await settleImportTransferSpool(db, root, entry.id);
      return read(entry.id);
    },
  }, canRun);
  const unsubscribe = onImportTransferSpoolChange((changedRoot, runId) => {
    if (changedRoot === root) worker.invalidate(runId);
  });
  return { ...worker, unsubscribe };
}
