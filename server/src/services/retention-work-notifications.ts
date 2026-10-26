import { notifyToolReviewChange } from "./tool-review-work-notifications.js";
import type { Db } from "@paperclipai/db";
import type { AttentionSourceKind } from "@paperclipai/shared";
import { DELIVERY_QUEUES, notifyDeliveryWork } from "./delivery-work-notifications.js";

export async function notifyRetentionWork(transaction: object, kind: AttentionSourceKind) {
  if (kind === "approval") await notifyDeliveryWork(transaction, DELIVERY_QUEUES.approvalRetention);
}

export function writeApprovalChange<T>(db: Db, companyId: string, write: (transaction: Db) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await notifyRetentionWork(tx, "approval");
    // Formal decisions also release parked tool reviews. Share the existing
    // approval write transaction rather than nesting another facade wrapper.
    await notifyToolReviewChange(tx, companyId);
    return write(tx as unknown as Db);
  });
}
