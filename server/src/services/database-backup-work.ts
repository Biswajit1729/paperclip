import type { createDeliveryWorkCoordinator } from "./delivery-work-coordinator.js";
import { DELIVERY_QUEUES } from "./delivery-work-notifications.js";

/** Backups are a configured periodic obligation, not an empty-queue scan. */
export function registerDatabaseBackupWork(
  coordinator: ReturnType<typeof createDeliveryWorkCoordinator>,
  options: { intervalMs: number; run: () => Promise<unknown> },
) {
  const { intervalMs } = options;
  // Preserve the existing startup-relative cadence. The pre-sleep wake marker
  // is handled by the backup owner before registration, including its retry.
  let nextAt = Date.now() + intervalMs;
  return coordinator.register(DELIVERY_QUEUES.databaseBackups, {
    retryMs: intervalMs,
    pausePassiveMaintenance: true,
    hasPending: async () => false,
    nextRunAt: () => nextAt,
    run: async () => {
      if (Date.now() < nextAt) return;
      try {
        await options.run();
      } finally {
        // A slow attempt, paused instance, or failure must not replay every
        // missed interval. Retain the original phase and the next future slot.
        nextAt += Math.max(1, Math.floor((Date.now() - nextAt) / intervalMs) + 1) * intervalMs;
      }
    },
  });
}
