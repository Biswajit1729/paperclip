# Committed native recovery notices: sleep audit

Date: 2026-10-26. Slice 55 starts at
`f98e6b5b57558c78ba111170ab3d8d19ff667827`,
[parent #17752](https://github.com/paperclipai/paperclip/pull/17752).
Branch: `codex/sleep-55-native-recovery-notices`. The full scope remains in the
[recurring-server migration ledger](2026-10-24-recurring-server-sleep-stack.md).

## One obligation and its owner

A native finalization may commit while its recovery notice remains active. The
old periodic finalizer replay called `resolveCommittedFinalizationRecovery` to
resolve that notice. This slice extracts that duty into `native-recovery-notices`
and schedules it from committed changes. The recovery-action service still owns
the actual resolution write and its existing notifications. Other watchdogs,
external conversation settlement, Muse reconciliation and physical resource
settlement are separate obligations.

The existing `issue_recovery_actions` rows are durable truth. No new table,
per-feature timer or provider branch is introduced. Direct/manual finalizer calls
retain notice resolution by default. The periodic path passes a narrow
`skipNativeRecoveryNotices` flag; all its other completion/resource behavior
remains enabled. A real reconciler test verifies the resource-settlement callback
still runs when notice resolution is delegated.

## Pending predicate and quiet states

A candidate binds company, issue and run across the native coordinator, heartbeat
run and issue. The coordinator must be committed and have a result. Discovery
excludes held runner ownership, pending status effects and unfinished run
projection. A correlated notice lookup requires:

- The same company, source issue and `evidence.runId`.
- Kind `active_run_watchdog` and status `active` or `escalated`.
- `wakePolicy.kind = resume_native_run`, or the existing special cause
  `native_workspace_finalization_owner_unverified`.

An exhausted owner-verification notice can still need resolution even after its
retry policy is cleared. Unrelated notices, uncommitted runs, resolved history,
and otherwise idle configuration do not arm a recurring scan. Discovery reads
IDs in keyset pages of 100 and the shared worker executes company-fair batches of
25. Real resolution failures retain shared per-entry backoff, starting at 30
seconds and bounded at five minutes. A successful attempt with remaining work
retains a scoped 30-second retry. Startup reconstructs durable unfinished notices.

The owner first checks for a matching notice to avoid taking lifecycle locks on
the normal already-settled path. That read is an optimization, not authority.
Actual resolution locks coordinator, issue, run, then matching actions, following
native recovery's existing order. It rechecks the current committed coordinator,
run binding and physical ownership. The background caller also checks effect and
projection settlement under those locks. The existing action service performs
the resolution inside that transaction.

## Why the action must be read again

`upsertSourceScoped` can reuse an active action ID and change its run, cause,
fingerprint or policy. Resolving a captured ID alone can erase a newer incident.
The owner selects matching actions only after acquiring lifecycle locks and locks
them before calling the resolution service. The regression holds the run row lock,
starts resolution, changes the notice through the real upsert service, and then
releases the lock. The new notice stays active. A separate four-writer regression
observes exactly one recovery-action UPDATE.

## Producer and boundary audit

| Producer | Wake contract |
| --- | --- |
| Recovery-action insert, supersession, in-place update and budget exhaustion | Scoped notice hint before the existing transaction write. This includes changes to kind or wake policy alone, not just run/cause changes. |
| Recovery-action resolution | Signal only after a matching pending row is found and before the write. An empty resolution call must not wake this worker. |
| Native decision/finalization and pending-effect settlement | Existing finalization notification fanout now includes notices. The committed transaction remains authoritative. |
| Run projection and heartbeat lifecycle status writers | Scoped signal before the write; finishing projection or releasing an ownership hold can make a notice actionable. |
| Relevant issue changes | Existing issue transaction sends an issue-scoped hint. |
| Worktree execution activation | Global reconstruction hint through the existing settings transaction. |
| Recovery route reopening a resolved action | Explicit issue-scoped hint in the reopening transaction. |

`native-workspace-export-retry` already uses the finalization fanout when it changes
the action to `resume_native_run`; its coordinator becomes `result_accepted`, so
notice resolution waits for the later commit. Native workspace owner recovery
likewise queues result finalization; the subsequent commit supplies the activation.

Other direct action writers were reviewed. Legacy execution admission and
historical backfill create different causes without a native-resume policy.
Backfill, system recovery, workspace owner progress and queue continuation writes
preserve the top-level run/cause/kind/status eligibility while adding evidence.
The wake-queue adapter adds failure-block evidence. Explicit continuation creates
resolved authorization receipts or resolves previous actions. Safe replacement,
workspace reconstruction/export recovery and execution-recovery resolution remove
active obligations. Their existing queued candidate is rechecked and disarmed;
they cannot create new eligible notice work. Recovery-service monitor/deadline and
board-disposition writes do not introduce the matching native policy. New eligible
notice creation remains with the instrumented action service.

All producer hints use the existing database intent and outer transaction protocol.
Nested savepoint release is not commit. Unknown outcomes stay with that shared
protocol. Process-local signals cover instrumented writers in this process;
independent SQL writers and replicas without supported ingress are not newly
supported. No database LISTEN connection is added.

The notification boundary explicitly copies only company, issue and run IDs. A
structurally compatible caller can carry additional internal fields; serializing
its entire object is not safe. A real finalization regression exposed this during
implementation when a caller's database object caused circular JSON serialization.
The corrected hint uses the same narrow payload contract as adjacent workers.

## Lifecycle and verification

Public heartbeat registration preserves task drain, restore and worktree execution
suppression. Settings activation reconstructs work. The coordinator retains a
first write during drain and a failed retry through drain/restart, stops future
subscription work on shutdown and joins active resolution. A new startup discovers
notices written while stopped.

At this checkpoint, **102 tests pass**: 22 new worker/owner cases and 80 startup
cases. Coverage includes startup, zero idle SQL, resolved history, real first and
late producers, outer commit/rollback, finalizer commit, policy/kind-only changes,
supersession, escalated owner notices, concurrent resolution, action reuse while
waiting for a real row lock, no-op resolution, pending effects, projection,
ownership release, suppression/activation, drain/retry/restart, shutdown and
retained periodic resource settlement.

Preserved failures:

- Before producer wiring, six tests produced three failures: late notice, outer
  commit and later finalizer commit did not wake the worker. The other three passed.
- The first wiring run failed all six notice tests while all 80 startup cases
  passed. A stronger fixture assertion exposed `side_effect_planning_failed` with
  circular JSON serialization. The hint now copies its three supported IDs. All
  initial and expanded cases pass with the real finalizer.

Local logs: `/tmp/sleep55-initial-red.log`, `/tmp/sleep55-producers-green.log`
(the failed intermediate run), `/tmp/sleep55-producer-diagnostic.log`,
`/tmp/sleep55-lifecycle.log` (96 passes), and `/tmp/sleep55-final-lifecycle.log`
(102 passes). Six complete affected suites also pass: 340 cases across native finalization
recovery, finalizer telemetry, recovery actions, the status arbiter corpus,
result-commit work and run projection. Total: **442 passing local cases**.
Workspace typechecking passes. Evidence is in `/tmp/sleep55-affected.log` and
`/tmp/sleep55-types.log`. Build, publication and exact-head CI/review remain
pending at this checkpoint. The full local suite is not claimed: this host's
embedded PostgreSQL startup previously exhausted semaphore capacity. No further
shared OS cleanup was performed; fresh-host CI is required for full acceptance.

## Remaining work

Master was refreshed; `origin/master` was subsequently observed at `125ddcabe5`.
Full-stack integration of later master changes and fresh gates remains required.
The older failed gates and eight-worker restore/worktree suppression audit remain
open. All other duties in the ledger remain in scope. This establishes worker
behavior, not deployed database suspension, host sleep or fleet savings. The stack
is unmerged, and this request does not authorize merging it.
