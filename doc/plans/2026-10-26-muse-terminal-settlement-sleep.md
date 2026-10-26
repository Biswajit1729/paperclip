# Muse terminal assignment settlement: sleep migration

Status: slice 57 in progress, stacked on external conversation settlement #17772
at `4d1bc93840ae4bd238814d73249325246f69d76e`. This document is an implementation
and verification record, not a claim that the migration or deployed sleep is done.

## Obligation and owner

Muse's external-agent module owns assignments, operation receipts, binding
generations, and worker/native-effect holds. Terminal run projection does not
by itself establish that a private worker stopped or that an unknown effect
completed. Existing rows remain durable truth; no new table is required.

The existing Muse maintenance worker also owns qualification deadlines, OAuth
authority reconciliation, and receiver lifecycle. Extend that worker through the
shared delivery coordinator. Do not add a competing timer or terminal worker.
The periodic native-finalizer path now delegates this duty to that worker.
Live heartbeat and default manual finalization retain their existing callbacks.

## Initial evidence and changes

Three regressions failed before implementation:

1. A running accepted assignment armed the maintenance worker every five seconds.
2. A real committed Muse finish receipt emitted no maintenance notification.
3. Repeating terminal reconciliation rewrote settled assignment history, observed
   through the PostgreSQL row version even though the visible values were equal.

The owner now supplies one actionable-terminal predicate for discovery and locked
settlement. It includes a terminal live assignment requiring fencing, an accepted
settled result whose finalization timestamp differs from the run, and an
unreleased hold on which the owner still owes safe release or fencing. A fenced
private-worker hold awaiting external evidence is not automatic retry debt.
Null timestamps do not become invented completion times. New evidence can make
that row actionable later.

Discovery joins the recorded binding ID/generation, company, agent, and run.
Revoked bindings are included when they still contain actionable work. New
pairing creates a new binding row/generation; current agent configuration does
not replace a prior assignment's execution contract.

Settlement retains the existing admission-guard/binding lock order. Maintenance
processes at most 100 assignments per binding transaction; explicit manual
reconciliation retains its unbounded default. It does not rewrite unchanged
finalization timestamps. Terminal reconciliation fences the specific assignment;
explicit connection revocation keeps its binding-wide fence. This prevents a
historical result from fencing unrelated successor work.

Committed native operation results notify the existing maintenance topic before
the receipt/assignment/hold writes. Replay of an already-saved identical outcome
remains a no-op. This is an owner-local protocol change, not provider parsing in
shared startup or heartbeat code.

Maintenance retains scoped hints across failed sweeps and drain. Scoped terminal
hints inspect the affected run/binding/company; global startup and authority
signals retain their existing qualification/OAuth work. Concrete debt remaining
after a bounded batch earns another retry. Running assignments and completed
history do not. Passive pending checks use memory, and qualification deadlines
remain actual persisted deadlines.

## Implementation and acceptance checklist

- [x] Reproduce active-assignment polling, missing finish notification, and history
  rewrite against the old implementation.
- [x] Add owner predicate, bounded settlement, unchanged-history avoidance, and
  actual finish/result notification.
- [x] Extend the existing worker with scoped hints and concrete-debt retries.
- [x] Preserve and test current qualification, OAuth, startup, retry, drain/resume,
  and idle maintenance behavior (14 lifecycle tests).
- [x] Complete the producer audit: native run terminal/projection writes, late
  operation results, rejected or unknown sends, controller attach/revoke,
  replacement/revocation, and hold/attestation transitions.
- [x] Wire terminal run/projection notifications through existing owner contracts.
  Keep Muse tables and profiles out of generic heartbeat policy.
- [x] Wire the existing restore/worktree suppression check into terminal work,
  preserving qualification and authority duties; reactivate on settings changes.
- [x] Add real worker/broker integration for both result/run orderings, original
  revoked/replaced bindings, independent worker/native-effect holds, and scope
  isolation. Do not assume that a late result can restore already-fenced authority.
- [x] Add a regression proving historical terminal reconciliation cannot fence
  successor work, plus retained-history/no-configuration SQL quiet and first
  relevant producer reactivation.
- [x] Verify outer commit/rollback, concurrent hints during a sweep, failed scoped
  retry through drain, startup reconstruction, pagination, and joined shutdown.
- [x] Delegate both periodic native-finalizer callback branches while preserving
  default live/manual callbacks and unrelated resource settlement.
- [ ] Run broader affected tests, required checks, PR review, and fresh-head CI.

## Producer and boundary audit

All notifications register intent before the write in the existing transaction.
No caller owns a new recovery wrapper or a table. The external-agent public
module supplies the notification contract; Muse owns its durable predicates.

| Producer | Existing transaction and new wake | Scope / boundary |
| --- | --- | --- |
| Run lifecycle | Native terminal status and cancellation/failure helpers | Recorded company and run |
| Native committed projection | Actual repair CAS, after finding a repairable row | Recorded company and run; no hint for unchanged projection |
| Native finalization | Existing finalization fanout, live committed projection, exhausted/blocked finalization | Company/run/issue identifiers only |
| Native recovery/execution | Stranded failure, restart failure, executor terminal failure, cancelled continuation | Existing native ownership checks stay in force |
| Execution-control recovery | Terminal failure after its ownership checks | Recorded company and run |
| Stale-run recovery and watchdog | Eligible run terminalization / resolved-source fold | Existing CAS and runtime-settlement guards stay in force |
| Queue/run dispatch | Stale retry, discarded queued comment, superseded handoff, stopped recovery, and reassigned issue cancellation | Existing transaction; exact affected run |
| Muse native result | `port.settle` before receipt, assignment, and independent hold writes | Original binding; identical stored outcome returns before notification |
| Muse send failure | Rejected send gets a transaction; unknown-send uses the existing admission guard and binding lock | Exact original binding; actual CAS still decides whether to reopen an effect hold |
| New Muse assignment | Existing dispatch transaction | Binding-scoped, rather than all-binding scan |
| Qualification, pairing, revoke, OAuth | Existing authority transaction | Explicit `*` survives coalescing with scoped writes in the same outer transaction |
| Worktree execution setting | Existing settings transaction | Global reconstruction after reactivation |

Controller attach runs under execution admission and the binding lock, with
controller ownership on a running run. Its pending-to-unknown transition keeps
an unresolved operation unresolved. A later terminal writer creates the
settlement wake; attach does not create a new terminal-work clock. Operator
attestation and revocation own their direct hold changes. A fenced worker waiting
for private stop evidence remains visible but is not an automatic retry debt.
Legacy-only status recovery and nonterminal progress/usage/error metadata writes
do not create this terminal obligation.

The notification serializer explicitly copies four IDs. TypeScript structural
callers can pass a larger object, including a database handle; serializing the
whole object broke real finalization with a circular-JSON error. The actual
native-finalizer regression caught this integration defect before publication.

## Verification record and limits

At the integrated source checkpoint, 433 cases pass across six suites: 17 new
real broker/worker lifecycle cases, 256 Muse control-plane cases, 14 existing
maintenance cases, 28 native recovery-notice/finalizer cases, 82 startup cases,
and 36 native-finalization recovery cases. Workspace typechecking passes.
Build and remote CI/review acceptance remain pending.

The 17 lifecycle cases cover configured-idle SQL silence, the actual terminal
writer and committed projection, outer commit/rollback, first wake during drain,
real worktree/restore suppression, settings activation, scoped isolation, mixed
global/scoped writes, failure/restart recovery, concurrent hints, joined shutdown,
late native-result versus private-worker uncertainty, revoked original binding,
historical failed work versus a successor, and 101 saved assignments. The last
case also proves explicit manual reconciliation retains its unbounded default.
Four real-finalizer cases verify both newly committed and already committed
branches with delegation on/off, and preserve resource settlement callbacks.

Failure evidence is retained in local logs:

- `sleep57-lifecycle-first.log`: the fixture left its independent active-transport
  replay poller attached. Closing that transport before measuring this worker
  made the eight original lifecycle cases pass. The transport poller is a
  separate duty, not silently removed or excluded from SQL observation.
- `sleep57-lifecycle-expanded.log`: the failure/drain assertion checked the idle
  hold before the coordinator's next reconciliation. Advancing that existing
  recovery deadline correctly tests release and SQL silence during drain.
- `sleep57-delegation-red.log`: real finalization exposed the broad serializer.
- `sleep57-delegation-red-after-scope-fix.log`: the two delegated cases failed
  because periodic callbacks still ran; the two default cases passed.
- `sleep57-affected-full.log`: five suites / 397 cases passed. The sixth suite
  failed setup because a reused database contained its fixed IDs. A fresh,
  migrated dedicated database passed all 36 cases (`sleep57-finalization-fresh.log`).
- `sleep57-workspace-types.log`: workspace typecheck passed.

Tests use real PostgreSQL and transport authority with synthetic provider
receipts. They do not qualify a live Muse worker. The broader local full-suite
limitation from embedded PostgreSQL semaphore capacity remains; these runs use
separate databases on the already running test server. No additional IPC cleanup
was performed or authorized.

Only the periodic external-assignment callback is delegated. Shared resource
callbacks, live heartbeat settlement, and default manual settlement remain.
The worker uses existing durable rows and process-local transaction signals;
startup reconstructs missed work. It does not add cross-replica SQL ingress.
Cloud's unsupported-work sleep blockers and external-alarm admission contract
remain unchanged. This slice establishes local worker quiet, not deployed host
suspension, database suspension, or measured cost savings.

## Qualification deadline precedence

When a bounded settlement pass leaves assignments outstanding, maintenance now
registers the earlier of its five-second settlement retry and the saved
qualification expiry. Neither obligation can hide the other. A regression with
real qualification and assignment rows first reproduced a one-second expiry
being delayed to the settlement retry. It now proves the exact expiry is
registered and enforced while assignment debt remains, then disarms after
settlement with no recurring SQL. All 15 maintenance lifecycle cases passed.
Integrated typecheck, build, and remote checks remain required.
