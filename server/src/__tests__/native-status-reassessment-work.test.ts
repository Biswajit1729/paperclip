import express from "express";
import request from "supertest";
import { LOW_TRUST_REVIEW_PRESET } from "@paperclipai/shared";
import { issueRoutes } from "../routes/issues.js";
import { errorHandler } from "../middleware/index.js";
import { workProductService } from "../services/work-products.js";
import { issueService } from "../services/issues.js";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { agents, companies, completionContracts, createDb, heartbeatRuns, issues, issueWorkProducts,
  nativeRunFinalizations, nativeRunResults, statusDecisions, workAssessments, workspaceOperations } from "@paperclipai/db";
import { createDeliveryWorkCoordinator } from "../services/delivery-work-coordinator.js";
import { idleWorkSnapshot } from "../services/task-admission.js";
import { nativeStatusReassessmentWork } from "../services/native-runtime/native-status-reassessment-work.js";
import { dismissAutomaticCompletionReviews } from "../services/native-runtime/automatic-completion-reviews.js";
import { commitNativeStatusDecision } from "../services/native-runtime/status-decision-committer.js";
import { NATIVE_STATUS_ARBITER_POLICY_VERSION } from "../services/native-runtime/status-arbiter.js";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { resolveExternalTestDatabaseUrl } from "./helpers/external-test-database.js";

describe("native reassessment worker lifecycle", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | undefined;
  let db: ReturnType<typeof createDb>;
  let coordinator: ReturnType<typeof createDeliveryWorkCoordinator> | undefined;
  const companyId = randomUUID(), agentId = randomUUID();
  let admitted = true;
  const errors: unknown[] = [];
  beforeAll(async () => {
    const external = resolveExternalTestDatabaseUrl("PAPERCLIP_STATUS_REASSESSMENT_TEST_DATABASE_URL");
    if (!external) temporary = await startEmbeddedPostgresTestDatabase("paperclip-status-reassessment-");
    db = createDb(external ?? temporary!.connectionString);
    await db.insert(companies).values({ id: companyId, name: "Reassessment lifecycle", issuePrefix: `RS${randomUUID().slice(0, 8)}` });
    await db.insert(agents).values({ id: agentId, companyId, name: "Reassessment agent", adapterType: "codex_local", status: "idle" });
  }, 30_000);
  afterAll(async () => { await db?.$client.end({ timeout: 1 }); await temporary?.cleanup(); });
  beforeEach(() => {
    admitted = true; errors.length = 0;
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], shouldAdvanceTime: true });
  });
  afterEach(async () => {
    await coordinator?.stop(); coordinator = undefined;
    vi.useRealTimers(); vi.restoreAllMocks();
    expect(errors).toEqual([]);
  });
  async function start() {
    coordinator = createDeliveryWorkCoordinator({ owner: db, canRun: () => admitted, canReconcile: () => admitted,
      onError: error => errors.push(error) });
    await nativeStatusReassessmentWork(db).register(coordinator, () => admitted).ready;
  }
  async function flush() {
    await vi.waitFor(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      expect(idleWorkSnapshot().active).toBe(0);
      expect(coordinator!.nextWakeAt()).toBeNull();
    }, { timeout: 15_000 });
  }
  async function quiet() {
    const original = db.$client.options.debug;
    const queries: string[] = [];
    db.$client.options.debug = (_id, query) => { queries.push(query); };
    try {
      await vi.advanceTimersByTimeAsync(120_000);
      await delay(10);
      expect(queries).toEqual([]);
    } finally { db.$client.options.debug = original; }
  }
  async function status(issueId: string) {
    return (await db.select({ status: issues.status }).from(issues).where(eq(issues.id, issueId)))[0].status;
  }
  async function seedReview() {
    const issueId = randomUUID(), runId = randomUUID(), resultId = randomUUID(), contractId = randomUUID();
    const assessmentId = randomUUID(), workProductId = randomUUID();
    await db.insert(issues).values({ id: issueId, companyId, title: "Persisted native result", status: "in_progress", assigneeAgentId: agentId });
    await db.insert(heartbeatRuns).values({ id: runId, companyId, agentId, status: "succeeded", runtimeMode: "native",
      nativeIssueId: issueId, completionContractId: contractId, contextSnapshot: { issueId }, finishedAt: new Date() });
    await db.insert(completionContracts).values({ id: contractId, companyId, issueId, revision: 1,
      schemaVersion: "paperclip.completion-contract.v1", policyVersion: "phase6-v1", risk: "low",
      completionAuthority: "agent_claim_policy", incompleteCriteriaPolicy: "preserve_non_terminal",
      contractJson: { revision: "test-v1", criteria: [{ id: "objective", requirement: "Verified artifact" }] },
      canonicalSha256: contractId, createdByActorType: "system", createdByActorId: "reassessment-test" });
    await db.insert(nativeRunResults).values({ id: resultId, companyId, issueId, runId, completionContractId: contractId,
      serverFingerprint: resultId, schemaStatus: "accepted", canonicalSha256: resultId,
      resultJson: { result: { reportedWorkDisposition: "done", summary: "Completed", attentionRequests: [],
        completionClaim: { contractRevision: "test-v1", objectiveSatisfied: true, remainingWork: [],
          criteria: [{ criterionId: "objective", status: "satisfied", evidenceRefs: [`work_product:${workProductId}`] }] },
        verification: [{ commandOrCheck: "artifact", status: "passed", artifactRef: `work_product:${workProductId}` }],
      }, terminal: { runTerminalState: "succeeded" } } });
    await db.insert(issueWorkProducts).values({ id: workProductId, companyId, issueId, type: "artifact", provider: "paperclip",
      title: "Verified artifact", status: "ready_for_review", reviewState: "approved",
      createdAt: new Date(Date.now() - 1000), updatedAt: new Date(Date.now() - 1000) });
    await db.insert(workAssessments).values({ id: assessmentId, companyId, issueId, runId, contractId, resultId,
      triggerKind: "native_result", triggerActorCompanyId: companyId, priorIssueStatus: "in_progress", priorStatusVersion: 0,
      policyVersion: NATIVE_STATUS_ARBITER_POLICY_VERSION, inputDigest: assessmentId,
      assessmentJson: { reportedDisposition: "needs_review", attentionRequests: [], allCriteriaSatisfied: false } });
    await db.insert(nativeRunFinalizations).values({ runId, companyId, issueId, phase: "assessing", resultId, assessmentId });
    const committed = await commitNativeStatusDecision({ db, companyId, issueId, runId, assessmentId,
      priorStatus: "in_progress", priorStatusVersion: 0, priorDecisionId: null,
      decision: { policyVersion: NATIVE_STATUS_ARBITER_POLICY_VERSION, statusAction: "in_review", toStatus: "in_review",
        reasonCode: "completion_claim_incomplete", unblockDescriptor: null,
        effects: [{ kind: "bind_reviewer", ownerUserId: null,
          prompt: "Review the persisted native-run evidence and confirm whether this issue may be completed." }] } });
    await db.insert(workspaceOperations).values({ companyId, heartbeatRunId: runId, issueId, phase: "workspace_finalize",
      status: "succeeded", exitCode: 0, cwd: process.cwd(), finishedAt: new Date() });
    return { issueId, runId, workProductId, decisionId: committed.decision.id };
  }

  it.each(["update", "create", "primary replacement", "import", "attachment", "source promotion"] as const)("wakes from the real work-product %s writer", async writer => {
    const seeded = await seedReview();
    if (writer === "update") await db.update(issueWorkProducts).set({ reviewState: "none" }).where(eq(issueWorkProducts.id, seeded.workProductId));
    if (writer === "create") await db.delete(issueWorkProducts).where(eq(issueWorkProducts.id, seeded.workProductId));
    if (writer === "source promotion") await db.update(issueWorkProducts).set({ sourceTrust: {
      preset: LOW_TRUST_REVIEW_PRESET, disposition: "quarantined", sourceIssueId: seeded.issueId,
      sourceRunId: seeded.runId, sourceAgentId: agentId,
    } }).where(eq(issueWorkProducts.id, seeded.workProductId));
    await start(); await flush(); await quiet();
    expect(await status(seeded.issueId)).toBe("in_review");
    const products = workProductService(db);
    if (writer === "update") await products.update(seeded.workProductId, { reviewState: "approved" });
    if (writer === "create" || writer === "primary replacement") await products.createForIssue(seeded.issueId, companyId, {
      ...(writer === "create" ? { id: seeded.workProductId } : {}),
      type: "artifact", provider: "paperclip", title: "Verified artifact", status: "approved", reviewState: "approved",
      isPrimary: writer === "primary replacement",
    });
    if (writer === "import") await products.createManyForImport([{ companyId, issueId: seeded.issueId, projectId: null,
      type: "artifact", provider: "paperclip", externalId: null, title: "Imported evidence", url: null, status: "approved",
      reviewState: "approved", isPrimary: false, healthStatus: "unknown", summary: null, metadata: null,
      executionWorkspaceId: null, runtimeServiceId: null, createdByRunId: null, sourceTrust: null }]);
    if (writer === "attachment") await issueService(db).createAttachment({ issueId: seeded.issueId, provider: "local_disk",
      objectKey: randomUUID(), contentType: "text/plain", byteSize: 4, sha256: "a".repeat(64), originalFilename: "result.txt",
      createdByAgentId: agentId, createdByRunId: seeded.runId });
    if (writer === "source promotion") {
      const app = express(); app.use(express.json());
      app.use((req, _res, next) => {
        req.actor = { type: "board", userId: "board-user", companyIds: [companyId],
          memberships: [{ companyId, membershipRole: "operator", status: "active" }],
          isInstanceAdmin: true, source: "local_implicit" }; next();
      });
      app.use("/api", issueRoutes(db, {} as any)); app.use(errorHandler);
      const promoted = await request(app).post(`/api/issues/${seeded.issueId}/low-trust/promotions`).send({
        sourceArtifactKind: "work_product", sourceArtifactId: seeded.workProductId,
        title: "Reviewed artifact", summary: "Reviewed completion evidence",
      });
      expect(promoted.status, JSON.stringify(promoted.body)).toBe(201);
    }
    await flush();
    expect(await status(seeded.issueId)).toBe("done");
    expect(await db.select().from(statusDecisions).where(eq(statusDecisions.issueId, seeded.issueId))).toHaveLength(2);
    await quiet();
  });

  it("waits for an outer work-product transaction and ignores rollback", async () => {
    const seeded = await seedReview();
    await db.update(issueWorkProducts).set({ reviewState: "none" }).where(eq(issueWorkProducts.id, seeded.workProductId));
    await start(); await flush(); await quiet();
    await expect(db.transaction(async tx => {
      await workProductService(tx as unknown as typeof db).update(seeded.workProductId, { reviewState: "approved" });
      await vi.advanceTimersByTimeAsync(1000);
      expect(await status(seeded.issueId)).toBe("in_review");
      throw new Error("rollback evidence approval");
    })).rejects.toThrow("rollback evidence approval");
    await flush(); await quiet();
    expect(await status(seeded.issueId)).toBe("in_review");
    await db.transaction(async tx => {
      await workProductService(tx as unknown as typeof db).update(seeded.workProductId, { reviewState: "approved" });
      await vi.advanceTimersByTimeAsync(1000);
      expect(await status(seeded.issueId)).toBe("in_review");
    });
    await flush();
    expect(await status(seeded.issueId)).toBe("done");
    await quiet();
  });

  it.each(["status", "blocked reassertion", "assignment"] as const)("reassesses a real task %s mutation after quiet", async mutation => {
    const seeded = await seedReview();
    if (mutation === "blocked reassertion") await issueService(db).update(seeded.issueId, { status: "blocked" });
    await start(); await flush(); await quiet();
    const before = await db.select().from(statusDecisions).where(eq(statusDecisions.issueId, seeded.issueId));
    await issueService(db).update(seeded.issueId, mutation === "assignment" ? { assigneeAgentId: null } : { status: "blocked" });
    await flush();
    const after = await db.select().from(statusDecisions).where(eq(statusDecisions.issueId, seeded.issueId));
    expect(after).toHaveLength(before.length + 1);
    expect(await status(seeded.issueId)).toBe(mutation === "assignment" ? "in_review" : "blocked");
    const [current] = await db.select().from(nativeRunFinalizations).where(eq(nativeRunFinalizations.runId, seeded.runId));
    const [assessment] = await db.select().from(workAssessments).where(eq(workAssessments.id, current.assessmentId!));
    const [issue] = await db.select().from(issues).where(eq(issues.id, seeded.issueId));
    expect(assessment.priorStatusVersion).toBe(issue.statusVersion);
    await quiet();
  });

  it("retains the first review-retirement wake through idle drain", async () => {
    const seeded = await seedReview();
    await start(); await flush(); await quiet();
    admitted = false;
    await dismissAutomaticCompletionReviews(db, seeded.issueId);
    await quiet();
    expect(await status(seeded.issueId)).toBe("in_review");
    admitted = true;
    await vi.advanceTimersByTimeAsync(30_000); await flush();
    expect(await status(seeded.issueId)).toBe("done");
    await quiet();
  });

  it("reconstructs the saved retry after shutdown and never dispatches it early", async () => {
    const seeded = await seedReview();
    await dismissAutomaticCompletionReviews(db, seeded.issueId);
    const future = new Date(Date.now() + 60_000);
    await db.update(nativeRunFinalizations).set({ nextAttemptAt: future }).where(eq(nativeRunFinalizations.runId, seeded.runId));
    await start();
    expect(coordinator!.nextWakeAt()).toBe(future.getTime());
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await status(seeded.issueId)).toBe("in_review");
    await coordinator!.stop(); coordinator = undefined;
    await start();
    expect(coordinator!.nextWakeAt()).toBe(future.getTime());
    await vi.advanceTimersByTimeAsync(Math.max(0, future.getTime() - Date.now())); await flush();
    expect(await status(seeded.issueId)).toBe("done");
    expect(await db.select().from(statusDecisions).where(eq(statusDecisions.issueId, seeded.issueId))).toHaveLength(2);
    await quiet();
  });

  it("wakes from real review retirement after idle and becomes SQL quiet with completed history", async () => {
    const seeded = await seedReview();
    await start(); await flush(); await quiet();
    expect(await status(seeded.issueId)).toBe("in_review");
    await dismissAutomaticCompletionReviews(db, seeded.issueId);
    await flush();
    expect(await status(seeded.issueId)).toBe("done");
    expect(await db.select().from(statusDecisions).where(eq(statusDecisions.issueId, seeded.issueId))).toHaveLength(2);
    await quiet();
  });
});
