# Native environment settlement without idle polling

## Scope and owner

Slice 58 of the recurring-server sleep stack. Parent: slice 57, PR #17793,
`be8f3284c2c8a05903f2eca000ad86d046780fec`. This slice moves only the environment
lease portion of native finalization recovery out of the recurring run reaper.
Runtime-service release, agent status projection, workspace descriptor cleanup,
active-transport replay, and the remaining reaper duties stay separate.

The prior `settleRecoveredNativeWorkspace` callback did three jobs whenever the
native finalizer replayed committed results. Even historical runs with no leases
caused environment discovery and stop-receipt reads. The callback still serves
live/manual recovery. Periodic replay now delegates its environment portion to
one shared-coordinator worker. The other two callbacks retain their behavior.

`run-control.releaseEnvironmentLeasesForRun` owns terminal resource policy and
warm-session stop checks. `environment-runtime.releaseRunLeases` owns exact lease
and provider operations. The worker invokes those owners; it does not interpret
provider receipts, select another provider, infer a stopped process from a terminal
status, or implement teardown. The release predicate is extracted without changing
its existing states. No schema, migration, independent timer, or job table is added.

## Existing truth and deadlines

A candidate has all of the following:

- A native run bound to the same company and issue as its finalization.
- An accepted result bound to that exact run, company, issue, and finalization.
- A terminal run status. Running/unknown execution ownership is excluded.
- Either a committed finalization, or an exhausted workspace-finalization failure
  identified by its existing `workspaceFinalizeAttempt` receipt.
- At least one lease still accepted by the release owner: active; a stop/export
  handoff in `pending_cleanup`; or failed retained cleanup when the recorded
  disposition calls for destruction.

Released/expired/failed lease history and retained success do not keep this
worker scheduled. An unrelated pending-cleanup row belongs to the existing
cleanup worker. A retained failed lease does not earn destruction when the native
run's recorded disposition calls for retention. Disposition still comes from the
saved native workspace reference and export-retry evidence. Failed-turn warm
retention is normalized by the existing run-control owner.

Stop/export handoffs keep the existing saved cleanup claim/retry deadline and
five-minute spacing. An attempted release that leaves real debt keeps a
30-second minimum retry. Exceptions use the shared coordinator's bounded backoff.
A release call returning successfully does not prove success: the existing API
logs per-lease failures. The worker re-reads lease truth before disarming.

Discovery is paginated by run ID. Scoped hints are coalesced and fair dispatch
uses the existing scoped deadline worker. Current run status is checked again
before an automatic release; the original release owner retains its own guards.

## Producer and transaction audit

| Producer | Existing boundary / new hint |
| --- | --- |
| Accepted result, committed finalization, workspace failure | Existing `notifyNativeFinalizationWork` fanout |
| Run projection and metadata repair | Projection's owning transaction before its write |
| Terminal run lifecycle | Existing lifecycle transaction before status changes |
| Finalizer's direct projection path | Existing finalizer transaction |
| Restart/control recovery terminal writers | Existing terminal-write transactions |
| Lease acquisition and same-run reacquisition | Acquisition transaction; the simple insert now has the same transaction boundary |
| Lease release, cleanup handoff, metadata update, retry receipt | Existing environment-cleanup notification boundary |
| Worktree execution setting | Existing settings transaction, global reactivation hint |
| Startup/restart | Reconstruct from existing records without requiring a remembered hint |

Hints serialize only the company/run/issue identifiers. They are awaited before
writes, and the shared database signal protocol owns outer transactions,
savepoints, rollback, and uncertain commit outcomes. No per-call recovery counter
is threaded through routes. No private Muse contract is used for environment work.
The supported writer model remains the server's instrumented writers. Independent
SQL writers or unrelated replicas do not acquire a new ingress guarantee here.

Warm-session or workspace guards can defer an attempt. While the exact lease
still needs release, its scoped retry remains. A completed lease, changed owner,
or a no-longer-terminal run removes the entry on reconciliation. Concrete retry
work may still prevent host sleep; that is not idle-history polling.

## Lifecycle and boundaries

Startup registration uses the heartbeat facade's restore/worktree suppression
and task-drain checks. The app also gates warm standby, shutdown, and scheduler
enablement. Shared coordinator admission preserves dirty scopes across drain,
coalesces writes during execution, and joins worker shutdown. Settings changes
reactivate work that was suppressed rather than leaving a passive scan running.

The environment-cleanup fanout is a shared change because lease writes can create
or discharge native settlement debt. With no eligible native run, it produces
one empty reconciliation and no recurring work. The generic cleanup worker,
provider claim fences, workspace preservation, retained-session cleanup, and
remote stop acknowledgment retain their owners.

## Verification record

- 17 new real-PostgreSQL lifecycle cases pass through the public heartbeat facade,
  real native result/finalizer writers, and the existing environment runtime.
  Controlled local-driver operations stand in for provider effects.
- Cases cover empty/retained history, first acquisition after finalization,
  finalizer-produced release, restart, outer commit/rollback, swallowed release
  failures, writes during an active release, drain/resume with zero SQL,
  running/unverified owners, exact company scope, pending cleanup deadlines,
  worktree/restore suppression, settings reactivation, keep-running retention,
  exhausted workspace failure, and partial periodic delegation.
- The combined run passed 127 tests: 17 new cases, 28 existing native notice and
  finalizer integration cases, and 82 startup cases.
- 85 existing run-control, heartbeat recovery, and environment-cleanup tests also
  pass. The affected total is 212. Final workspace checks are recorded in the PR.
- The first test setup failed because migrations already create the unique local
  environment. The fixture now uses that existing environment. The subsequent
  lifecycle runs passed; no production change was made to bypass the constraint.

The dedicated test databases use the existing local PostgreSQL server. No further
OS semaphore cleanup was performed. The full local suite still requires its
previously recorded environment capacity constraints to be resolved; CI supplies
full-suite acceptance. A green targeted run does not close the whole stack.

## Remaining acceptance and limitations

Remote checks, Greptile review, full-stack master propagation, and older stack
review/gate debts remain separately tracked. The latest observed `origin/master`
was `8c702d59dbc45ea5d491379b11b4883c17caebab`; this slice stays on its stacked
parent. No merge authority is assumed.

No deployed provider teardown, database suspension, external Cloud alarm coverage,
or fleet cost reduction is claimed. Future deadlines still need their existing
external-wake/blocker contract before a host can sleep. The next distinct duties
in this callback are runtime-service lease settlement and agent terminal-status
projection; descriptor filesystem cleanup is another separate owner.
