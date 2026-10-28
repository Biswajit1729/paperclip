import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activityLog, companies, createDb, issueComments, issueReferenceMentions, issues } from "@paperclipai/db";
import { completeIssueCommentReceipt } from "../services/issue-comment-receipt.js";
import { issueReferenceService } from "../services/issue-references.js";
import { getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";

const support = await getEmbeddedPostgresTestSupport();
const describePostgres = support.supported ? describe : describe.skip;

describePostgres("accepted comment finalization", () => {
  let db: ReturnType<typeof createDb>;
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  beforeAll(async () => {
    database = await startEmbeddedPostgresTestDatabase("paperclip-comment-receipt-");
    db = createDb(database.connectionString);
  }, 30_000);
  afterAll(async () => {
    await db?.$client.end({ timeout: 5 });
    await database?.cleanup();
  });

  it("rolls back partial references and repairs them once across concurrent retries", async () => {
    const companyId = randomUUID(), issueId = randomUUID(), targetId = randomUUID(), commentId = randomUUID();
    const prefix = `RCP${companyId.slice(0, 6).toUpperCase()}`;
    await db.insert(companies).values({ id: companyId, name: "Comment receipt recovery", issuePrefix: prefix });
    await db.insert(issues).values([
      { id: issueId, companyId, title: "Completed task", status: "done", identifier: `${prefix}-1`, issueNumber: 1 },
      { id: targetId, companyId, title: "Referenced task", identifier: `${prefix}-2`, issueNumber: 2 },
    ]);
    await db.insert(issueComments).values({
      id: commentId, companyId, issueId, authorType: "user", authorUserId: "local-board",
      clientRequestId: randomUUID(), body: `See ${prefix}-2`,
    });
    const refs = issueReferenceService(db);
    let fail = true;
    const interrupted = {
      ...refs,
      syncComment: async (...args: Parameters<typeof refs.syncComment>) => {
        await refs.syncComment(...args);
        if (fail) throw new Error("Reference write interrupted before activity");
      },
    };
    const input = {
      companyId, issueId, commentId,
      activity: () => ({ companyId, actorType: "user" as const, actorId: "local-board", action: "issue.comment_added",
        entityType: "issue", entityId: issueId, details: { commentId } }),
    };
    await expect(completeIssueCommentReceipt(db, interrupted, input)).rejects.toThrow("Reference write interrupted");
    expect(await db.select().from(issueReferenceMentions).where(eq(issueReferenceMentions.sourceRecordId, commentId))).toHaveLength(0);
    expect(await db.select().from(activityLog).where(eq(activityLog.companyId, companyId))).toHaveLength(0);
    fail = false;
    await Promise.all(Array.from({ length: 3 }, () => completeIssueCommentReceipt(db, interrupted, input)));
    expect(await db.select().from(issueReferenceMentions).where(and(
      eq(issueReferenceMentions.sourceRecordId, commentId), eq(issueReferenceMentions.targetIssueId, targetId),
    ))).toHaveLength(1);
    expect(await db.select().from(activityLog).where(eq(activityLog.companyId, companyId))).toHaveLength(1);
    await db.delete(issueReferenceMentions).where(eq(issueReferenceMentions.sourceRecordId, commentId));
    await completeIssueCommentReceipt(db, refs, input);
    expect(await db.select().from(issueReferenceMentions).where(eq(issueReferenceMentions.sourceRecordId, commentId))).toHaveLength(1);
    expect(await db.select().from(activityLog).where(eq(activityLog.companyId, companyId))).toHaveLength(1);
    expect((await db.select().from(issues).where(eq(issues.id, issueId)))[0].status).toBe("done");
    await expect(completeIssueCommentReceipt(db, refs, { ...input, companyId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    expect(await db.select().from(activityLog).where(eq(activityLog.companyId, companyId))).toHaveLength(1);
  }, 30_000);
});
