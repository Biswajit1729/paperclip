import { createHash } from "node:crypto";
import { statSync, realpathSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertSameKimiPending, observeKimiLifecyclePending, readKimiLifecycleSettlement } from "./kimi-lifecycle-evidence.js";
import { dispatchKimiLifecycleAction } from "./kimi-lifecycle.js";
import { readKimiLocalProcesses, selectKimiLocalTarget, type KimiLocalProcess } from "./kimi-local-provider-fault.js";

type Row = Record<string, any>;
const caller = { type: "board", userId: "local-board", source: "local_implicit" } as const;
const cancellationRequestId = "11111111-2222-4333-8444-555555555555";
const sha = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
function fixture(remote = false) {
  const scope = { companyId: "company", issueId: "issue", runId: "run", target: "denied/target.txt", ...(remote ? { actionFile: `.paperclip-eval-action-${"a".repeat(36)}.txt` } : {}) };
  const run: Row = { id: "run", companyId: "company", nativeIssueId: "issue", runtimeMode: "native", status: "running", nativeSessionId: "session", runnerInstanceId: "runner", resultJson: {} };
  const issue: Row = { id: "issue", companyId: "company", status: "in_progress" };
  const row = (eventType: string, sourceSeq: number, payload: Row): Row => ({ companyId: "company", runId: "run", seq: sourceSeq, eventType, protocolSchemaVersion: 1,
    payload: { prpEvent: { schema: "paperclip.prp.event.v1", schemaVersion: 1, sourceKind: "runner", eventType, runId: "run", turnId: "turn", normalizedSessionId: "session",
      sourceInstanceId: "runner", sourceSeq, sourceEventId: `runner:run:${sourceSeq}`, emittedAt: "2026-10-28T00:00:00Z", payload } } });
  const tool = (executionId: string, name: string, operation: string, target: string | null, status = "running") => ({ schema: "paperclip.tool.execution.v1", executionId, transport: "builtin", name, operation, target, status });
  const request: Row = { schema: "paperclip.runtime_request.v2", type: "permission", requestKind: "permission_approval", status: "pending", requestId: "request", turnId: "turn", itemId: "permission-item",
    prompt: `Change file: ${scope.target}`, choices: [{ key: "accept", label: "Allow once" }, { key: "decline", label: "Deny" }, { key: "cancel", label: "Cancel" }],
    details: { toolCallId: "0:native-write", kind: "edit" }, origin: { adapter: "acpx-runtime-sidecar", provider: "kimi", method: "session/request_permission" } };
  const events: Row[] = remote ? [row("tool.execution.started", 1, tool("0:read", "Read", "read", scope.actionFile!)), row("tool.execution.completed", 2, tool("0:read", "Read", "read", scope.actionFile!, "completed"))] : [];
  events.push(row("tool.execution.started", events.length + 1, tool("0:native-write", "Write", "edit", null)),
    row("tool.execution.progressed", events.length + 2, tool("0:native-write", "Write", "edit", scope.target)),
    row("runtime_request.created", events.length + 3, { request }));
  const state = () => ({ run, issue, events });
  const observe = () => observeKimiLifecyclePending({ ...state(), scope });
  const settle = (branch: "stop" | "loss", cancelId = cancellationRequestId) => {
    const pending = observe();
    if (branch === "stop") {
      run.status = "cancelled";
      run.resultJson = { startupCancellation: { cancellationRequestId: cancelId, requestedBy: { type: "board", userId: "local-board" } }, nativeCancellation: {
        schema: "paperclip.native-cancellation.v1", intentId: `native-cancellation:${cancelId}`, companyId: "company", runId: "run", issueId: "issue", scope: "run",
        dispatched: true, dispatchState: "acknowledged", reasonCode: "cancellation_run_only", effects: ["release_run_resources"], intentAuditId: "intent-audit", acknowledgementAuditId: "ack-audit",
      } };
      events.push(row("runtime_request.cancelled", events.length + 1, { requestId: "request", requestKind: "permission_approval", turnId: "turn", itemId: "permission-item", reason: "turn_terminal" }));
      events.push(row("turn.cancelled", events.length + 1, { status: "cancelled", error: null }));
    } else {
      run.status = "failed"; issue.status = "blocked";
      events.push(row("runtime_request.expired", events.length + 1, { requestId: "request", requestKind: "permission_approval", requestType: "permission", turnId: "turn", itemId: "permission-item", reason: "provider_process_lost", replayAllowed: false, request }));
      events.push(row("turn.failed", events.length + 1, { error: { code: "provider_transport_lost" } }));
    }
    const dispatchMonotonicNs = process.hrtime.bigint().toString();
    return { pending, dispatchMonotonicNs, caller, cancellationRequestId: cancelId, branch };
  };
  return { scope, run, issue, events, request, row, tool, state, observe, settle };
}
const payload = (row: Row) => row.payload.prpEvent.payload;

describe("Kimi native Write lifecycle evidence", () => {
  it.each([false, true])("binds actual Write approval to its native edit execution (remote=%s)", remote => {
    const f = fixture(remote), before = f.observe(), later = f.observe();
    expect(before).toMatchObject({ toolCallId: "0:native-write", executionId: "0:native-write", normalizedSessionId: "session", sourceInstanceId: "runner" });
    expect(() => assertSameKimiPending(before, later)).not.toThrow();
  });
  it.each([
    ["another provider", (f: ReturnType<typeof fixture>) => { f.request.origin.provider = "copilot"; }],
    ["semantic permission", f => { f.request.origin.method = "semantic/tool"; }],
    ["missing safe card path", f => { f.request.prompt = "Write"; }],
    ["missing actual edit kind", f => { f.request.details.kind = "other"; }],
    ["session-wide authority", f => { f.request.choices.push({ key: "accept_for_session" }); }],
    ["missing decline", f => { f.request.choices = f.request.choices.filter((x: Row) => x.key !== "decline"); }],
    ["wrong native call", f => { f.request.details.toolCallId = "foreign"; }],
    ["different file", f => { payload(f.events[1]!).target = "elsewhere.txt"; }],
    ["native Edit substituted for Write", f => { payload(f.events[1]!).name = "Edit"; }],
    ["completed file effect", f => { f.events.push(f.row("tool.execution.completed", 4, f.tool("0:native-write", "Write", "edit", f.scope.target, "completed"))); }],
    ["extra shell", f => { f.events.unshift(f.row("tool.execution.started", 0, f.tool("shell", "Bash", "execute", null))); }],
    ["replayed start", f => { f.events.push(f.row("tool.execution.started", 4, f.tool("0:native-write", "Write", "edit", f.scope.target))); }],
    ["foreign company", f => { f.events[0]!.companyId = "foreign"; }],
    ["foreign source", f => { f.events[0]!.payload.prpEvent.sourceInstanceId = "other"; }],
    ["restored session", f => { f.run.nativeSessionId = "replacement"; }],
    ["another provider generation", f => { f.run.runnerInstanceId = "replacement"; }],
  ] satisfies Array<[string, (f: ReturnType<typeof fixture>) => void]>)("rejects %s", (_name, mutate) => {
    const f = fixture(); mutate(f); expect(f.observe).toThrow();
  });
  it.each(["wrong-path", "unclosed", "extra-write", "post-write-read"])("rejects ambiguous bootstrap %s", kind => {
    const f = fixture(true);
    if (kind === "wrong-path") payload(f.events[0]!).target = "another.txt";
    if (kind === "unclosed") f.events.splice(1, 1);
    if (kind === "extra-write") payload(f.events[0]!).operation = "edit";
    if (kind === "post-write-read") { f.events[0]!.seq = 99; }
    expect(f.observe).toThrow();
  });
  it.each(["stop", "loss"] as const)("accepts the original %s callback closure", branch => {
    const f = fixture(), binding = f.settle(branch);
    expect(readKimiLifecycleSettlement({ ...f.state(), ...binding })).toMatchObject({ branch, replayAllowed: false, completedMutation: false });
    payload(f.events.at(-2)!).requestId = "other";
    expect(() => readKimiLifecycleSettlement({ ...f.state(), ...binding })).toThrow();
  });
  it.each(["replay", "cancelled", "wrong-reason", "changed-request", "new-turn", "new-operation", "success", "Stop"])("rejects false native loss %s", kind => {
    const f = fixture(), binding = f.settle("loss"), expiry = f.events.at(-2)!;
    if (kind === "replay") payload(expiry).replayAllowed = true;
    if (kind === "cancelled") expiry.eventType = expiry.payload.prpEvent.eventType = "runtime_request.cancelled";
    if (kind === "wrong-reason") payload(expiry).reason = "durable_handoff";
    if (kind === "changed-request") payload(expiry).request = { ...f.request, prompt: "replacement" };
    if (kind === "new-turn") { f.events.at(-1)!.payload.prpEvent.turnId = "replacement"; }
    if (kind === "new-operation") f.events.push(f.row("tool.execution.started", 6, f.tool("late", "Write", "edit", f.scope.target)));
    if (kind === "success") f.run.status = "succeeded";
    if (kind === "Stop") f.run.resultJson.nativeCancellation = {};
    expect(() => readKimiLifecycleSettlement({ ...f.state(), ...binding })).toThrow();
  });
  it("refuses a changed pending callback before dispatching a Stop or fault", async () => {
    const f = fixture(); let reads = 0, actions = 0;
    await expect(dispatchKimiLifecycleAction({ scope: f.scope, caller, branch: "stop", deadlineAt: Date.now() + 1000,
      load: async () => { if (++reads === 2) f.request.requestId = "replacement"; return f.state(); }, retain: async () => {},
      act: async () => { actions++; } })).rejects.toThrow("pending callback changed");
    expect(actions).toBe(0);
  });
  it("retains and refreshes the pending observation before its only mutating action", async () => {
    const f = fixture(), order: string[] = [];
    const result = await dispatchKimiLifecycleAction({ scope: f.scope, caller, branch: "stop", deadlineAt: Date.now() + 1000,
      load: async () => { order.push("load"); return f.state(); }, retain: async () => { order.push("retain"); },
      act: async (_pending, requestId) => { order.push("action"); f.settle("stop", requestId); return { source: "public-Stop-test-double" }; } });
    expect(order.slice(0, 4)).toEqual(["load", "retain", "load", "action"]);
    expect(order.filter(x => x === "action")).toHaveLength(1);
    expect(result.settlement.branch).toBe("stop");
  });
});

function localFixture() {
  const timestamp = Date.parse("2026-10-28T00:00:00Z"), distribution = "/private/tmp/paperclip-acpx-native-fixture/distribution";
  const bootId = "12345678-1234-1234-1234-123456789abc", loader = "exact compiled guarded loader";
  const proc = (pid: number, ppid: number, executable: string, command: string): KimiLocalProcess => ({ pid, ppid, pgid: pid === 21 ? 21 : 22,
    startUs: String(timestamp * 1000 + pid), executable, executableDev: "1", executableIno: String(pid), command, cwd: "/workspace", bootId });
  const processes = [proc(21, 1, "/runner", "/runner --run-id run --lifecycle-mode per_turn"),
    proc(22, 21, "/host-node", `/host-node --eval ${loader} ${distribution} .paperclip-native-entry.cjs 0 0 commonjs [] 0`),
    proc(23, 22, `${distribution}/node/bin/node`, "kimi-code")];
  const input = { authority: { pid: 21, groupId: 21, startedAt: new Date(timestamp).toISOString(), runId: "run" },
    journal: processes.map(row => ({ pid: row.pid, parent: row.ppid, start: new Date(timestamp).toISOString() })), processes, workspacePath: "/workspace", guardLoaderSha256: sha(loader) };
  return { input, select: () => selectKimiLocalTarget(input) };
}
describe("Kimi local native child selector", () => {
  it("selects the exact pinned-path native descendant independently of its title", () => {
    const f = localFixture(); expect(f.select().target.pid).toBe(23);
    f.input.processes[2]!.command = "anything"; expect(f.select().target.pid).toBe(23);
  });
  it.each(["root", "foreign-loader", "wrong-entry", "unowned", "wrong-cwd", "boot", "cycle", "ambiguous"])("fails closed for %s", kind => {
    const f = localFixture();
    if (kind === "root") f.input.authority.runId = "other";
    if (kind === "foreign-loader") f.input.processes[1]!.command = f.input.processes[1]!.command.replace("exact", "wrong");
    if (kind === "wrong-entry") f.input.processes[1]!.command = f.input.processes[1]!.command.replace(".paperclip-native-entry.cjs", "foreign.cjs");
    if (kind === "unowned") f.input.journal.pop();
    if (kind === "wrong-cwd") f.input.processes[2]!.cwd = "/elsewhere";
    if (kind === "boot") f.input.processes[2]!.bootId = "foreign";
    if (kind === "cycle") f.input.processes[1]!.ppid = 23;
    if (kind === "ambiguous") { f.input.processes.push({ ...f.input.processes[2]!, pid: 24 }); f.input.journal.push({ ...f.input.journal[2]!, pid: 24 }); }
    expect(f.select).toThrow();
  });
  it.skipIf(process.platform !== "darwin" || process.arch !== "arm64")("reads real macOS kernel process birth and executable inode without environment inspection", () => {
    const rows = readKimiLocalProcesses([process.pid]), current = rows.find(row => row.pid === process.pid);
    expect(current?.executable).toBe(realpathSync(process.execPath));
    const stat = statSync(current!.executable);
    expect(current?.executableDev).toBe(String(stat.dev)); expect(current?.executableIno).toBe(String(stat.ino));
    expect(Math.abs(Date.now() - Number(current!.startUs) / 1000 - process.uptime() * 1000)).toBeLessThan(5000);
  });
});
