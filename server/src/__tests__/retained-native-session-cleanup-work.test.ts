import { notifyNativeFinalizationWork } from "../services/native-finalization-notifications.js";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { agents, companies, completionContracts, createDb, heartbeatRuns, issues, nativeRunFinalizations,
  nativeRunResults, statusDecisions, workAssessments, type Db } from "@paperclipai/db";
import { createDeliveryWorkCoordinator } from "../services/delivery-work-coordinator.js";
import { idleWorkSnapshot } from "../services/task-admission.js";
import { notifyRetainedNativeSessionCleanup, releaseRetainedNativeSessionCleanup } from "../services/retained-native-session-cleanup-notifications.js";
import { retainedNativeSessionCleanupWork } from "../services/native-runtime/retained-native-session-cleanup-work.js";
import { reconcileRetainedNativeSessionCleanups, runRetainedNativeSessionCleanup, type NativeCleanupOutcome } from "../services/native-runtime/retained-native-session-cleanup.js";
import { reconcileRetainedNativeSessionCleanup } from "../services/native-runtime/native-session-executor.js";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { resolveExternalTestDatabaseUrl } from "./helpers/external-test-database.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("retained native cleanup scheduled lifecycle", () => {
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | undefined;
  let db: ReturnType<typeof createDb>;
  let coordinator: ReturnType<typeof createDeliveryWorkCoordinator> | undefined;
  let worker: ReturnType<ReturnType<typeof retainedNativeSessionCleanupWork>["register"]> | undefined;
  const companyId = randomUUID(), agentId = randomUUID();
  const closeError = "provider_transport_failed: runner did not durably suspend before checkpoint";
  let admitted = true;
  const errors: unknown[] = [];
  async function settle(input: { runId: string; companyId: string }): Promise<NativeCleanupOutcome> {
    await db.update(nativeRunFinalizations).set({ leaseOwner: null, leaseExpiresAt: null,
      recoveryHistory: [{ kind: "native_cleanup_maintenance", phase: "settled" }] })
      .where(eq(nativeRunFinalizations.runId, input.runId));
    return { runId: input.runId, status: "settled" };
  }
  const cleanup = vi.fn(settle);
  beforeAll(async () => {
    const external = resolveExternalTestDatabaseUrl("PAPERCLIP_RETAINED_CLEANUP_TEST_DATABASE_URL");
    if (!external) temporary = await startEmbeddedPostgresTestDatabase("paperclip-retained-cleanup-");
    db = createDb(external ?? temporary!.connectionString);
    await db.insert(companies).values({ id: companyId, name: "Retained cleanup lifecycle", issuePrefix: `RC${randomUUID().slice(0, 8)}` });
    await db.insert(agents).values({ id: agentId, companyId, name: "Cleanup agent", adapterType: "codex_local" });
  }, 30_000);
  beforeEach(() => {
    admitted = true; errors.length = 0; cleanup.mockReset().mockImplementation(settle);
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], shouldAdvanceTime: true });
  });
  afterEach(async () => {
    worker?.stop(); await coordinator?.stop(); worker = undefined; coordinator = undefined;
    vi.useRealTimers(); vi.restoreAllMocks();
    await db.delete(nativeRunFinalizations).where(eq(nativeRunFinalizations.companyId, companyId));
    expect(errors).toEqual([]);
  });
  afterAll(async () => { await db?.$client.end({ timeout: 1 }); await temporary?.cleanup(); });
  async function start() {
    coordinator = createDeliveryWorkCoordinator({ owner: db, canRun: () => admitted, canReconcile: () => true,
      onError: error => errors.push(error) });
    worker = retainedNativeSessionCleanupWork(db, cleanup).register(coordinator, () => admitted);
    await worker.ready;
  }
  async function flush() {
    await vi.waitFor(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      expect(idleWorkSnapshot().active).toBe(0);
      expect(coordinator!.nextWakeAt()).toBeNull();
    }, { timeout: 15_000 });
  }
  async function quiet(ms = 120_000) {
    const previous = db.$client.options.debug;
    const queries: string[] = [];
    db.$client.options.debug = (_id, query) => { queries.push(query); };
    try { await vi.advanceTimersByTimeAsync(ms); await delay(10); expect(queries).toEqual([]); }
    finally { db.$client.options.debug = previous; }
  }
  async function commitCandidate() {
    return db.transaction(async tx => {
      await notifyNativeFinalizationWork(tx, { companyId });
      return candidate({}, tx as unknown as Db);
    });
  }
  async function candidate(
    options: {
      owner?: { companyId: string; agentId: string };
      run?: Partial<typeof heartbeatRuns.$inferInsert>;
      coordinator?: Partial<typeof nativeRunFinalizations.$inferInsert>;
      schemaStatus?: string;
      issueId?: string;
      revision?: number;
    } = {},
    writer: Db = db,
  ) {
    const owner = options.owner ?? { companyId, agentId };
    const runId = randomUUID();
    const issueId = options.issueId ?? randomUUID();
    const contractId = randomUUID();
    if (!options.issueId) await writer
      .insert(issues)
      .values({
        id: issueId,
        companyId: owner.companyId,
        title: "Retained session",
        assigneeAgentId: owner.agentId,
      });
    await writer.insert(completionContracts).values({
      id: contractId,
      companyId: owner.companyId,
      issueId,
      revision: options.revision ?? 1,
      schemaVersion: "paperclip.completion-contract.v1",
      policyVersion: "phase6-v3",
      risk: "standard",
      completionAuthority: "server_arbiter",
      incompleteCriteriaPolicy: "preserve_non_terminal",
      contractJson: {},
      canonicalSha256: runId,
      createdByActorType: "system",
      createdByActorId: "test",
    });
    await writer.insert(heartbeatRuns).values({
      id: runId,
      companyId: owner.companyId,
      agentId: owner.agentId,
      runtimeMode: "native",
      status: "succeeded",
      nativeIssueId: issueId,
      nativeSessionId: runId,
      nativePhase: "terminal_failure",
      completionContractId: contractId,
      completionContractSha256: runId,
      finishedAt: new Date(),
      errorCode: "adapter_failed",
      error: closeError,
      ...options.run,
    });
    const [result] = await writer
      .insert(nativeRunResults)
      .values({
        companyId: owner.companyId,
        issueId,
        runId,
        completionContractId: contractId,
        serverFingerprint: runId,
        canonicalSha256: runId,
        schemaStatus: options.schemaStatus ?? "accepted",
        resultJson: {},
      })
      .returning();
    const [assessment] = await writer
      .insert(workAssessments)
      .values({
        companyId: owner.companyId,
        issueId,
        runId,
        contractId,
        resultId: result!.id,
        triggerKind: "native_result",
        triggerActorCompanyId: owner.companyId,
        priorIssueStatus: "in_progress",
        priorStatusVersion: 0,
        policyVersion: "phase6-v3",
        assessmentJson: {},
        inputDigest: runId,
      })
      .returning();
    const [decision] = await writer
      .insert(statusDecisions)
      .values({
        companyId: owner.companyId,
        issueId,
        runId,
        assessmentId: assessment!.id,
        decisionVersion: options.revision ?? 1,
        policyVersion: "phase6-v3",
        fromStatus: "in_progress",
        toStatus: "in_review",
        reasonCode: "prior_status_terminal_preserved",
        decisionJson: {},
        decisionDigest: runId,
      })
      .returning();
    await writer.insert(nativeRunFinalizations).values({
      companyId: owner.companyId,
      issueId,
      runId,
      phase: "committed",
      resultId: result!.id,
      assessmentId: assessment!.id,
      decisionId: decision!.id,
      ...options.coordinator,
    });
    return runId;
  }


  it("becomes SQL-quiet with no work, then processes the first committed candidate", async () => {
    await start(); await flush(); await quiet();
    const runId = await commitCandidate();
    await flush();
    expect(cleanup).toHaveBeenCalledExactlyOnceWith({ companyId, runId });
    await quiet();
  });

  it("leaves retained unprovable history quiet through the real physical cleanup boundary", async () => {
    await candidate();
    cleanup.mockImplementation(input => reconcileRetainedNativeSessionCleanup(db, input));
    await start(); await flush();
    expect(cleanup).toHaveBeenCalledTimes(1);
    await quiet();
  });

  it.each(["session_release", "environment_release", "maintenance_settlement"] as const)(
    "waits quietly for %s and then reactivates only the affected run", async waitFor => {
      const runId = await candidate();
      cleanup.mockResolvedValueOnce({ runId, status: "deferred", waitFor });
      await start(); await flush(); await quiet();
      releaseRetainedNativeSessionCleanup(db, { companyId, runId });
      await flush();
      expect(cleanup).toHaveBeenCalledTimes(2);
      await quiet();
    },
  );

  it("reconstructs a lease deadline across restart and does no SQL before it", async () => {
    const leaseExpiresAt = new Date(Date.now() + 60_000);
    const runId = await candidate({ coordinator: { leaseOwner: "other-owner", leaseExpiresAt } });
    await start();
    expect(cleanup).not.toHaveBeenCalled();
    expect(coordinator!.nextWakeAt()).toBe(leaseExpiresAt.getTime());
    await quiet(10_000);
    worker!.stop(); await coordinator!.stop();
    await start();
    expect(coordinator!.nextWakeAt()).toBe(leaseExpiresAt.getTime());
    await quiet(10_000);
    await vi.advanceTimersByTimeAsync(40_000); await flush();
    expect(cleanup).toHaveBeenCalledExactlyOnceWith({ companyId, runId });
    await quiet();
  });

  it("retains only the concrete process-exit probe and disarms it after settlement", async () => {
    const runId = await candidate();
    cleanup.mockResolvedValueOnce({ runId, status: "deferred", waitFor: "process_exit" });
    await start();
    expect(cleanup).toHaveBeenCalledTimes(1);
    await quiet(20_000);
    await vi.advanceTimersByTimeAsync(10_000); await flush();
    expect(cleanup).toHaveBeenCalledTimes(2);
    await quiet();
  });

  it("does not run before outer commit and clears rolled-back intent", async () => {
    await start(); await flush();
    const entered = deferred(), release = deferred();
    const transaction = db.transaction(async outer => {
      await outer.transaction(async tx => {
        await notifyRetainedNativeSessionCleanup(tx, { companyId });
        await candidate({}, tx as unknown as Db);
      });
      entered.resolve(); await release.promise;
      throw new Error("rollback fixture");
    });
    const rolledBack = expect(transaction).rejects.toThrow("rollback fixture");
    await entered.promise;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cleanup).not.toHaveBeenCalled();
    release.resolve(); await rolledBack; await flush(); await quiet();
    const runId = await commitCandidate(); await flush();
    expect(cleanup).toHaveBeenCalledExactlyOnceWith({ companyId, runId });
    await quiet();
  });

  it("retains the first write during drain without passive SQL until resume", async () => {
    await start(); await flush(); admitted = false;
    const runId = await commitCandidate();
    await vi.advanceTimersByTimeAsync(1000); await delay(10);
    expect(cleanup).not.toHaveBeenCalled();
    await quiet();
    admitted = true; await vi.advanceTimersByTimeAsync(30_000); await flush();
    expect(cleanup).toHaveBeenCalledExactlyOnceWith({ companyId, runId });
    await quiet();
  });

  it("retains an operational failure across drain and retries after resume", async () => {
    await candidate(); cleanup.mockRejectedValueOnce(new Error("connection lost"));
    await start(); expect(errors).toHaveLength(1); errors.length = 0;
    admitted = false; await quiet();
    expect(cleanup).toHaveBeenCalledTimes(1);
    admitted = true; await vi.advanceTimersByTimeAsync(30_000); await flush();
    expect(cleanup).toHaveBeenCalledTimes(2);
    await quiet();
  });

  it("keeps a committed wake arriving during cleanup and never overlaps worker dispatch", async () => {
    await candidate();
    const entered = deferred(), release = deferred();
    let active = 0, maximum = 0;
    cleanup.mockImplementation(async input => {
      maximum = Math.max(maximum, ++active);
      try { entered.resolve(); await release.promise; return await settle(input); }
      finally { active--; }
    });
    const starting = start(); await entered.promise;
    await commitCandidate(); release.resolve(); await starting; await flush();
    expect(cleanup).toHaveBeenCalledTimes(2); expect(maximum).toBe(1);
    await quiet();
  });

  it("joins the original manual startup operation instead of performing cleanup twice", async () => {
    await candidate();
    const entered = deferred(), release = deferred();
    cleanup.mockImplementation(async input => { entered.resolve(); await release.promise; return settle(input); });
    const manual = reconcileRetainedNativeSessionCleanups(db, { cleanup });
    await entered.promise;
    const work = retainedNativeSessionCleanupWork(db, cleanup);
    const [entry] = await work.load();
    const joined = work.check(entry);
    try { expect(cleanup).toHaveBeenCalledTimes(1); }
    finally { release.resolve(); }
    await expect(joined).resolves.toBeNull(); await manual;
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("serializes different cleanup inspections sharing a database lane", async () => {
    const first = await candidate(), second = await candidate();
    const entered = deferred(), release = deferred();
    cleanup.mockImplementationOnce(async input => { entered.resolve(); await release.promise; return settle(input); });
    const active = runRetainedNativeSessionCleanup(db, { companyId, runId: first }, cleanup);
    await entered.promise;
    const queued = runRetainedNativeSessionCleanup(db, { companyId, runId: second }, cleanup);
    try { await delay(10); expect(cleanup).toHaveBeenCalledTimes(1); }
    finally { release.resolve(); }
    await Promise.all([active, queued]);
    expect(cleanup.mock.calls.map(([input]) => input.runId)).toEqual([first, second]);
  });

  it("waits on the original in-flight cleanup when shutdown begins", async () => {
    await candidate();
    const entered = deferred(), release = deferred();
    cleanup.mockImplementation(async input => { entered.resolve(); await release.promise; return settle(input); });
    const starting = start(); await entered.promise;
    let stopped = false;
    worker!.stop(); const stopping = coordinator!.stop().then(() => { stopped = true; });
    try { await delay(10); expect(stopped).toBe(false); }
    finally { release.resolve(); }
    await Promise.all([starting, stopping]);
    expect(stopped).toBe(true); expect(cleanup).toHaveBeenCalledTimes(1);
    releaseRetainedNativeSessionCleanup(db, { companyId });
    await quiet();
  });

  it("replaces an old lease alarm when a committed change releases it early", async () => {
    const runId = await candidate({ coordinator: { leaseOwner: "old-owner", leaseExpiresAt: new Date(Date.now() + 60_000) } });
    await start(); expect(cleanup).not.toHaveBeenCalled();
    await db.transaction(async tx => {
      await notifyNativeFinalizationWork(tx, { companyId, runId });
      await tx.update(nativeRunFinalizations).set({ leaseOwner: null, leaseExpiresAt: null }).where(eq(nativeRunFinalizations.runId, runId));
    });
    await flush(); expect(cleanup).toHaveBeenCalledExactlyOnceWith({ companyId, runId });
    await quiet();
  });

  it("cancels a saved alarm when a committed owner marks the candidate operator-required", async () => {
    const runId = await candidate({ coordinator: { leaseOwner: "old-owner", leaseExpiresAt: new Date(Date.now() + 60_000) } });
    await start();
    await db.transaction(async tx => {
      await notifyNativeFinalizationWork(tx, { companyId, runId });
      await tx.update(nativeRunFinalizations).set({ recoveryHistory: [{ kind: "native_cleanup_source_archive", phase: "operator_required" }] })
        .where(eq(nativeRunFinalizations.runId, runId));
    });
    await flush(); expect(cleanup).not.toHaveBeenCalled(); await quiet();
  });

  it("retains startup discovery during drain and reconstructs only after admission resumes", async () => {
    const runId = await candidate(); admitted = false;
    await start(); await quiet(); expect(cleanup).not.toHaveBeenCalled();
    admitted = true; await vi.advanceTimersByTimeAsync(30_000); await flush();
    expect(cleanup).toHaveBeenCalledExactlyOnceWith({ companyId, runId }); await quiet();
  });

  it("drains a backlog across discovery pages and becomes quiet with the completed history retained", async () => {
    const runIds: string[] = [];
    for (let index = 0; index < 103; index++) runIds.push(await candidate());
    await start(); await flush();
    expect(cleanup.mock.calls.map(([input]) => input.runId).sort()).toEqual(runIds.sort());
    expect(await db.select().from(nativeRunFinalizations).where(eq(nativeRunFinalizations.companyId, companyId))).toHaveLength(103);
    await quiet();
  });

  it("retries failed startup discovery without treating an unavailable database as empty", async () => {
    const runId = await candidate();
    vi.spyOn(db, "select").mockImplementationOnce(() => { throw new Error("discovery connection lost"); });
    await start(); expect(errors).toHaveLength(1); errors.length = 0;
    expect(cleanup).not.toHaveBeenCalled();
    await quiet(20_000); await vi.advanceTimersByTimeAsync(10_000); await flush();
    expect(cleanup).toHaveBeenCalledExactlyOnceWith({ companyId, runId }); await quiet();
  });
});
