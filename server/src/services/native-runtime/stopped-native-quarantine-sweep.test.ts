import { describe, expect, it, vi } from "vitest";
import { retireVerifiedStoppedNativeQuarantines } from "./stopped-native-quarantine-sweep.js";

function dbReturning(rows: Array<Record<string, unknown>>) {
  const limit = vi.fn(async () => rows.map(run => ({ run })));
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  const select = vi.fn(() => ({ from }));
  return { db: { select } as any, select, limit };
}

const run = { id: "run-1", companyId: "company-1", agentId: "agent-1", runtimeMode: "native", status: "failed" };

describe("retireVerifiedStoppedNativeQuarantines", () => {
  it("does not query when nothing is quarantined", async () => {
    const { db, select } = dbReturning([run]);
    const verifyStopped = vi.fn();
    expect(await retireVerifiedStoppedNativeQuarantines(db, { listQuarantined: () => [], verifyStopped })).toEqual([]);
    expect(select).not.toHaveBeenCalled();
    expect(verifyStopped).not.toHaveBeenCalled();
  });

  it("retires the exact owner after a stopped-conversation proof and records the evidence", async () => {
    const { db, limit } = dbReturning([run]);
    const retire = vi.fn(() => true);
    const appendEvent = vi.fn(async () => ({}) as any);
    const retired = await retireVerifiedStoppedNativeQuarantines(db, {
      listQuarantined: () => [{ companyId: "company-1", runId: "run-1" }],
      verifyStopped: async () => ({ evidence: { runId: "run-1" }, retire }),
      appendEvent,
    });
    expect(retired).toEqual(["run-1"]);
    expect(limit).toHaveBeenCalledWith(5);
    expect(retire).toHaveBeenCalledOnce();
    expect(appendEvent).toHaveBeenCalledWith(db, expect.objectContaining({
      runId: "run-1", companyId: "company-1", eventType: "native.stopped_conversation_verified", payload: { runId: "run-1" },
    }));
  });

  it("keeps the quarantine when the stop cannot be proven", async () => {
    const { db } = dbReturning([run]);
    const appendEvent = vi.fn();
    const retired = await retireVerifiedStoppedNativeQuarantines(db, {
      listQuarantined: () => [{ companyId: "company-1", runId: "run-1" }],
      verifyStopped: async () => null,
      appendEvent,
    });
    expect(retired).toEqual([]);
    expect(appendEvent).not.toHaveBeenCalled();
  });

  it("keeps the quarantine when the proof changed before retirement", async () => {
    const { db } = dbReturning([run]);
    const appendEvent = vi.fn();
    const retired = await retireVerifiedStoppedNativeQuarantines(db, {
      listQuarantined: () => [{ companyId: "company-1", runId: "run-1" }],
      verifyStopped: async () => ({ evidence: {}, retire: () => false }),
      appendEvent,
    });
    expect(retired).toEqual([]);
    expect(appendEvent).not.toHaveBeenCalled();
  });

  it("ignores rows whose company does not match the quarantined owner", async () => {
    const { db } = dbReturning([{ ...run, companyId: "company-2" }]);
    const verifyStopped = vi.fn();
    const retired = await retireVerifiedStoppedNativeQuarantines(db, {
      listQuarantined: () => [{ companyId: "company-1", runId: "run-1" }],
      verifyStopped,
    });
    expect(retired).toEqual([]);
    expect(verifyStopped).not.toHaveBeenCalled();
  });
});
