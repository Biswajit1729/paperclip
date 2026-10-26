import { describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { authorizeCommittedChatResponse, onCommittedChatResponseAuthorityRegistered, registerCommittedChatResponseAuthority } from "../services/durable-chat-wakeup.js";

describe("committed response authority lifecycle", () => {
  it("reactivates only its database and unsubscribes without removing a replacement listener", () => {
    const db = {} as Db, otherDb = {} as Db;
    const first = vi.fn(), second = vi.fn(), other = vi.fn();
    const disposeFirst = onCommittedChatResponseAuthorityRegistered(db, first);
    const disposeOther = onCommittedChatResponseAuthorityRegistered(otherDb, other);
    const removeAuthority = registerCommittedChatResponseAuthority(db, async () => {});
    expect(first).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    disposeFirst();
    const disposeSecond = onCommittedChatResponseAuthorityRegistered(db, second);
    disposeFirst();
    const removeReplacement = registerCommittedChatResponseAuthority(db, async () => {});
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    removeAuthority();
    expect(second).toHaveBeenCalledTimes(1);
    disposeSecond(); disposeOther(); removeReplacement();
    const removeLast = registerCommittedChatResponseAuthority(db, async () => {});
    expect(second).toHaveBeenCalledTimes(1);
    removeLast();
  });

  it("retains the replacement authority when the old service shuts down", async () => {
    const db = {} as Db;
    const first = vi.fn(async () => {}), second = vi.fn(async () => {});
    const removeFirst = registerCommittedChatResponseAuthority(db, first);
    const removeSecond = registerCommittedChatResponseAuthority(db, second);
    try {
      removeFirst();
      const input = { companyId: "company", issueId: "issue", agentId: "agent", runId: "run", resultId: "result" };
      await authorizeCommittedChatResponse(db, db, input);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledExactlyOnceWith(db, input);
    } finally { removeSecond(); }
  });
});
