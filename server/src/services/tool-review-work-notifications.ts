import type { Db } from "@paperclipai/db";
import { DELIVERY_QUEUES, notifyDeliveryWork } from "./delivery-work-notifications.js";

export function notifyToolReviewChange(transaction: object, companyId: string) {
  return notifyDeliveryWork(transaction, DELIVERY_QUEUES.toolReviewExpiry, companyId);
}

export function writeToolReviewChange<T>(db: Db, companyId: string, write: (transaction: Db) => Promise<T>): Promise<T> {
  return db.transaction(async transaction => {
    await notifyToolReviewChange(transaction, companyId);
    return write(transaction as unknown as Db);
  });
}
