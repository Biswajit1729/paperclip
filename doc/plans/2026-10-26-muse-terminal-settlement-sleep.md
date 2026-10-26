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
The native finalizer's periodic Muse callback remains enabled until all producer
and lifecycle integration below is complete.

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

Settlement retains the existing admission-guard/binding lock order and processes
at most 100 assignments per binding transaction. It does not rewrite unchanged
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

## Required work before periodic delegation or PR acceptance

- [x] Reproduce active-assignment polling, missing finish notification, and history
  rewrite against the old implementation.
- [x] Add owner predicate, bounded settlement, unchanged-history avoidance, and
  actual finish/result notification.
- [x] Extend the existing worker with scoped hints and concrete-debt retries.
- [x] Preserve and test current qualification, OAuth, startup, retry, drain/resume,
  and idle maintenance behavior (14 lifecycle tests).
- [ ] Complete the producer audit: native run terminal/projection writes, late
  operation results, rejected or unknown sends, controller attach/revoke,
  replacement/revocation, and hold/attestation transitions.
- [ ] Wire terminal run/projection notifications through existing owner contracts.
  Keep Muse tables and profiles out of generic heartbeat policy.
- [ ] Wire the existing restore/worktree suppression check into terminal work,
  preserving qualification and authority duties; reactivate on settings changes.
- [ ] Add real worker/broker integration for both result/run orderings, original
  revoked/replaced bindings, independent worker/native-effect holds, and scope
  isolation. Do not assume that a late result can restore already-fenced authority.
- [ ] Add a regression proving historical terminal reconciliation cannot fence
  successor work, plus retained-history/no-configuration SQL quiet and first
  relevant producer reactivation.
- [ ] Verify outer commit/rollback, concurrent hints during a sweep, failed scoped
  retry through drain, startup reconstruction, pagination, and joined shutdown.
- [ ] Delegate both periodic native-finalizer callback branches while preserving
  default live/manual callbacks and unrelated resource settlement.
- [ ] Run broader affected tests, required checks, PR review, and fresh-head CI.

## Verification record and limits

The new owner regressions now pass, and all 14 maintenance lifecycle tests and
server typecheck pass. The old maintenance test that expected a running assignment
to poll was revised to use actual terminal settlement debt; its real pending
predicate now disarms when that debt resolves. All 256 Muse control-plane tests pass, including existing transport authority,
operation replay, and independent-hold behavior. The broker tests use real PostgreSQL and transport authority with
synthetic provider receipts; they do not qualify a live Muse worker.

No source callback has yet been removed from periodic recovery. Missing producer
integration must not be hidden by a passing local worker test. This slice does not
relax Cloud sleep safety, export a new external alarm, measure host suspension,
or establish cost savings. Manual uncertainty remains visible and authoritative.
