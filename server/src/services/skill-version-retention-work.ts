import path from "node:path";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import { logger } from "../middleware/logger.js";
import { registerDeadlineWork } from "./deadline-work.js";
import type { createDeliveryWorkCoordinator } from "./delivery-work-coordinator.js";
import { DELIVERY_QUEUES } from "./delivery-work-notifications.js";
import { onSkillVersionCacheChange } from "./skill-version-retention-notifications.js";
import type { skillVersionRetentionService, SkillVersionPruneResult } from "./skill-version-retention.js";

type RetentionService = ReturnType<typeof skillVersionRetentionService>;
type ActiveCompany = { id: string; cursor: SkillVersionPruneResult["cursor"]; nextRunAt: number | null };

export function registerSkillVersionRetentionWork(
  coordinator: ReturnType<typeof createDeliveryWorkCoordinator>,
  service: RetentionService,
  canRun: () => boolean,
) {
  const root = path.resolve(resolvePaperclipInstanceRoot(), "skills");
  const dirty = new Set<string>();
  const deadlines = new Map<string, number>();
  const failures = new Map<string, number>();
  let discovery: { after?: string; retryAt: number } | null = { retryAt: 0 };
  let active: ActiveCompany | null = null;
  let continuationAt = 0;
  const changed = (hints?: ReadonlySet<string>) => {
    for (const hint of hints ?? ["*"]) {
      if (hint === "*") discovery = { retryAt: 0 };
      else dirty.add(hint);
    }
  };
  const worker = registerDeadlineWork(coordinator, DELIVERY_QUEUES.skillVersionRetention, {
    canRun,
    retryMs: 30_000,
    notificationCoalesceMs: 1000,
    onSettled: changed,
    run: async signal => {
      const admitted = () => !signal.aborted && canRun();
      for (const [id, at] of deadlines) if (at <= Date.now()) { deadlines.delete(id); dirty.add(id); }
      let inspected = 0;
      let companies = 0;
      const scope = discovery;
      if (scope && scope.retryAt <= Date.now() && admitted()) {
        try {
          const rows = await service.listCompanies(scope.after);
          for (const row of rows) dirty.add(row.id);
          if (discovery === scope) discovery = rows.length === 51 ? { after: rows.at(-1)!.id, retryAt: 0 } : null;
        } catch (err) {
          if (discovery === scope) scope.retryAt = Date.now() + 30_000;
          logger.warn({ err }, "skill cache retention company discovery failed");
        }
      }
      while (companies < 50 && inspected < 50 && admitted()) {
        if (!active) {
          const id = [...dirty].find(id => (failures.get(id) ?? 0) <= Date.now());
          if (!id) break;
          dirty.delete(id);
          active = { id, cursor: null, nextRunAt: null };
          deadlines.delete(id);
        }
        const company = active;
        try {
          const result = await service.pruneCompany(company.id, {
            cursor: company.cursor, maxEntries: 50 - inspected, shouldContinue: admitted,
          });
          inspected += result.checked;
          companies++;
          if (result.nextRunAt !== null) company.nextRunAt = Math.min(company.nextRunAt ?? Infinity, result.nextRunAt);
          company.cursor = result.cursor;
          failures.delete(company.id);
          if (!admitted()) return;
          if (result.truncated) break;
          if (company.nextRunAt !== null) deadlines.set(company.id, company.nextRunAt);
          active = null;
        } catch (err) {
          dirty.add(company.id);
          failures.set(company.id, Date.now() + 30_000);
          active = null;
          companies++;
          logger.warn({ err, companyId: company.id }, "skill cache retention company inspection failed");
        }
      }
      continuationAt = Date.now() + 1000;
    },
    next: async () => {
      let next: number | null = null;
      const take = (at: number) => { next = Math.min(next ?? Infinity, at); };
      if (discovery) take(Math.max(continuationAt, discovery.retryAt));
      if (active) take(continuationAt);
      for (const id of dirty) take(Math.max(continuationAt, failures.get(id) ?? 0));
      for (const at of deadlines.values()) take(at);
      return next;
    },
  });
  const unsubscribe = onSkillVersionCacheChange((cacheRoot, companyId) => {
    if (cacheRoot !== root) return;
    dirty.add(companyId);
    worker.wake();
  });
  return { ...worker, unsubscribe, dispose: () => service.dispose() };
}
