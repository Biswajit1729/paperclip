# Retained native-session cleanup: sleep migration audit

Parent: slice 50, #17709 at `9a9e4262bb9beb39d67d26320c14e99651b6d6bd`.
Branch: `codex/sleep-51-retained-native-session-cleanup`.
Inspected master: `1fbbef45a8d399771add7a27a04b12f3a20e264c`.

## Obligation and ownership

A finished native run with an accepted result can retain an exact local checkpoint
following the specific durable-suspend close failure. Cleanup may settle that
checkpoint only after its existing artifact, journal, identity, lease and physical
owner proofs succeed. A terminal run alone grants no cleanup authority. Failed
maintenance with uncertain provider ownership stays quarantined for inspection.

The old orphan pass calls a joined, per-database discovery sweep on every pass;
startup native recovery calls it too. Its cursor wraps after the last row, so an
ineligible retained history is inspected repeatedly. The sweep takes at most five
candidates (normally one). It keeps one pending promise per database and continues
past a failed candidate. Heartbeat tracks the attempt in its active execution
promises and joins retained runner maintenance callbacks before releasing shutdown
ownership. Preserve these lifecycle guarantees when moving to the shared scheduler.

The discovery and scheduling owner is now
`server/src/services/native-runtime/retained-native-session-cleanup.ts`.
`native-finalization-reconciler.ts` retains its export for compatibility; heartbeat
imports the cohesive owner directly. Provider-specific exact-state cleanup remains
in `native-session-executor.ts`, which already owns the physical session and its
admission rules. No provider protocol belongs in index.ts or the generic scheduler.

## Current implementation checkpoint

- Extracted existing bounded, joined discovery without changing its behavior.
- Added company/run/task/agent-scoped, keyset-paged candidate discovery. It returns
  existing lease metadata. Scheduled reconstruction can include future leases;
  ordinary sweep callers still exclude an unexpired claim.
- Candidate discovery still excludes nonterminal runs, unaccepted results,
  uncommitted assessments/decisions, saved finalization retry work, recorded runner
  epochs, operator-required source archives and ambiguous maintenance history.
- The exact legacy two-entry pre-ownership maintenance exception remains unchanged.
- A separate shared-scheduler worker now consumes scoped candidates and typed
  outcomes. Its lease deadline comes from durable state; a concrete unowned PID
  gets a scoped 30-second absence probe. Session/environment/maintenance waits
  need release notifications; ineligible history has no periodic fallback.
- The existing finalization notification fanout includes cleanup. There is also
  a per-database local release subscription boundary. Local producer coverage
  remains incomplete and the worker is not registered in production startup.
- No new table, migration, independent timer or provider operation is added.
- **Periodic cleanup remains enabled. Worker fixtures prove quiet for their named
  conditions; this checkpoint does not establish production or instance quiet.**

## Reactivation and outcome audit still required

| Condition or producer | Existing owner / evidence | Required handling before periodic removal |
| --- | --- | --- |
| Accepted result, committed decision, terminal projection or recovered close failure | Finalizer, status committer, executor; existing native-finalization notification fanout | Audit every writer, register cleanup intent in the owning transaction, and test real commit/rollback |
| Coordinator claim expires or clears | Native finalization row | Reconstruct its actual lease deadline; recheck claim ownership at execution; wake on early release |
| Active/pending-cleanup environment lease releases | Environment runtime, workspace settlement and cleanup writers | Audit release/deletion writers, not only pending-cleanup notifications; wake affected runs after commit |
| Process identity is cleared after verified stop | `native-local-process-stop.ts`, recovery and executor | Retain server-authored stop evidence and same-transaction notification; absence alone never authorizes replay |
| Same session is active, initializing or warm | Executor-owned maps and release/close paths | Use local completion/release signals with company/agent or narrower scope; a different run can own the same session |
| Prior retained callback is still running | Runner maintenance operation registry and drain function | Preserve original promise ownership and reactivate after settlement; a timeout is not proof the callback stopped |
| Relevant PID is still live without a controllable local owner | Exact cleanup's process check | Decide the explicit scoped probe contract; if needed, retain only a concrete unresolved obligation, with stop condition and documented sleep impact |
| Database failure or NOWAIT contention before claim | Executor now propagates operational failures; real lock regression passes | Shared worker must retain recovery and reconstruct durable state, especially after an unknown commit; it must not blindly replay physical effects |
| Invalid/foreign/changed journal, contract, provider state or artifacts | Existing exact-state verifier | Preserve refusal and original evidence; no automatic provider launch or broad retry of unknown outcomes |
| Cleanup already attempted with unknown outcome | Durable epoch/maintenance/archive history | Keep quarantine and existing operator-required policy, with no new automatic retry |

The original `not_eligible` outcome conflated transient local ownership, database
errors and permanent physical refusal. The operation now returns a typed deferred
outcome identifying process exit, session release, environment release, retained
maintenance settlement or a real coordinator lease expiry. The lease outcome
carries the saved expiry. Operational database/commit/unexpected I/O errors propagate;
malformed stored input, malformed JSON and missing/unsafe/changed proof artifacts
remain ineligible. Post-claim failures still retain the existing operator-required
quarantine policy. No new physical retry is authorized by this outcome contract.

The shared worker consumes this contract, but is not enabled in startup yet.
Before enabling it, complete the actual release producers for each waiting outcome.
It must not drop deferred work without the corresponding release notification or
concrete probe/deadline, and must not retry every ineligible retained history. A valid PID whose absence
cannot be proven remains deferred and cannot grant cleanup authority. The supported
process-exit observation and local session-release contracts remain to implement.

The implementation uses the existing scoped deadline worker for reconstruction,
coalescing, fair bounded dispatch, retries and drain retention. Eligibility and
execution remain with the native cleanup owner. Duplicate startup/manual/scheduled
attempts join their original per-run promise; different cleanup inspections share
one per-database FIFO lane. Production wiring must provide a cleanup callback that
retains ownership through the original physical callbacks, including ones that
outlive a bounded maintenance timeout. Tests currently prove the promise-joining
boundary; heartbeat's retained-callback drain still needs integration.
Preserve startup/manual recovery compatibility while removing only this duty from
the periodic orphan pass after coverage is complete.

Process-local transaction notifications cover supported in-process writers only.
No independent SQL-writer or multi-replica notification transport is being added.
Cloud alarm coverage and sleep eligibility remain unchanged and conservative.

## Evidence

All commands ran in the dedicated stack worktree; no source edits occurred while
local acceptance processes were running. External test databases are dedicated
scratch databases, avoiding the separately diagnosed embedded-PostgreSQL host
semaphore limit. No shared OS semaphore was removed.

- Before extraction: all 32 existing `native-finalization-recovery.test.ts` cases
  pass. `/tmp/sleep51-before.log` and `.status` (0).
- After extraction: the same 32 pass against a second fresh database.
  `/tmp/sleep51-after.log` and `.status` (0).
- All 72 retained native cleanup activation cases pass, including exact original
  evidence, foreign/live owners, archive/claim commit failures, stalled commits,
  lease loss, changed artifacts, quarantine and stopped-identity proof. Other
  executor tests were intentionally not selected (733 skipped).
  `/tmp/sleep51-physical.log` and `.status` (0).
- Scoped discovery adds three database tests: future lease reconstruction without
  early legacy execution; company/run/task/agent isolation with a real second
  tenant; bounded keyset traversal excluding already-attempted maintenance.
  All 35 finalization/discovery cases pass on a third fresh database.
  `/tmp/sleep51-discovery.log` and `.status` (0).
- Server typecheck passes after extraction and after scoped discovery.
  `/tmp/sleep51-types.log` and `/tmp/sleep51-discovery-types.log`, both status 0.

These are 107 distinct selected passing cases on the final source (35 discovery/
finalization and 72 physical-operation cases; the physical owner was unchanged
by the subsequent discovery extension). This is not full-suite acceptance,
worker lifecycle proof, deployed sleep proof or PR readiness.

## Remaining acceptance

- [x] Explicit transient/dormant/terminal cleanup outcomes and operational failures.
- [ ] Full producer audit and real commit/rollback/reactivation tests.
- [ ] Local session-release and retained-callback completion ownership.
- [ ] Shared worker startup, first producer, retry, changes during sweep, drain,
      resume and shutdown; prove SQL/network quiet with retained history.
- [ ] Discovery/backlog cost and fairness under realistic retained history.
- [ ] Startup/periodic wiring and removal of this duty from the orphan pass.
- [ ] Applicable broader verification, complete PR template, CI and 5/5 review.

All other duties in the recurring-server stack remain in scope. No merge is
requested or authorized by this migration checkpoint.


## Outcome contract checkpoint

The retained cleanup owner now distinguishes waiting, refusal and operational
failure. This is a prerequisite to scheduling; periodic discovery is still enabled.
The legacy sweep continues to isolate and log a failed candidate, advance its cursor,
and release its joined owner. Shared scheduling and producer coverage remain pending.

Regression evidence:

- Three injected transaction failures (disconnection, nested NOWAIT, missing commit
  acknowledgement) and the existing rolled-back source-claim commit failure all
  incorrectly returned `not_eligible` before repair. Four expected failures in
  `/tmp/sleep51-outcome-before.log` / `.status` (1); 73 other selected cases passed.
- The first real lock invocation reused a database with company prefix `NCS` and
  failed fixture setup with unique violation 23505. All 36 tests were skipped;
  this was not product evidence. `/tmp/sleep51-lock-before.log` / `.status` (1).
- On a fresh dedicated database the real competing run-row lock reproduced the
  incorrect ineligible outcome. `/tmp/sleep51-lock-before-fresh.log` / `.status`
  (1), one failed regression and 35 deliberately unselected cases.
- After preserving operational errors, all 77 cleanup-operation cases and all
  36 database discovery/finalization cases passed. Logs: `/tmp/sleep51-outcome-after`
  and `/tmp/sleep51-lock-after`, each `.log` and `.status` (0).
- Six further regressions reproduced incorrectly discarded waiting states: live
  run/process ownership, live provider process, coordinator lease, active environment
  lease and busy legacy maintenance. `/tmp/sleep51-deferred-before.log` / `.status`
  (1), six failed and 74 passing selected cases.
- The deferred outcome repair passes all 80 cleanup-operation cases. A typecheck
  caught the new malformed-input fixture casting its V1 field to the broader input
  union; correcting only that fixture's cast restored server typecheck. Preserve
  `/tmp/sleep51-outcomes-types.log` / `.status` (1) and the corrected
  `/tmp/sleep51-outcomes-types-final.log` / `.status` (0).
- Broader executor verification passes 798 cases, with the 15 embedded-database
  remote warm-ownership cases deliberately excluded for the existing host resource
  limit. `/tmp/sleep51-executor-consumers.log` / `.status` (0). The full 36-case
  database suite also passes on a fresh database after the outcome changes:
  `/tmp/sleep51-discovery-final.log` / `.status` (0). Total: 834 distinct cases.
- The final strengthened physical tests verify a deferred run can settle after
  its run process, coordinator lease, environment lease or retained maintenance
  blocker clears, including release of temporary local scope reservations.
  All 80 selected cases pass again: `/tmp/sleep51-reactivation.log` / `.status` (0).
  Provider-PID deferral is covered, but its exit-driven reactivation and local
  session-owner notification still require integration tests with the worker.
- Final server typecheck passes after the strengthened reactivation assertions:
  `/tmp/sleep51-reactivation-types.log` / `.status` (0).

No source edits occurred during the cited local acceptance processes. No Cloud
alarm coverage, sleep eligibility, quarantine policy or provider protocol changed.
All other stack duties and older acceptance gaps remain open.


## Shared worker checkpoint

New owner: `native-runtime/retained-native-session-cleanup-work.ts`.
Notification boundary: `retained-native-session-cleanup-notifications.ts`.
The public finalization notification helper now wakes this queue in the same
transaction as its other finalization duties. Provider mechanics stay in the
executor. The scheduler receives only candidate identity, normalized outcome and
next deadline; no provider selection was added to shared scheduling.

- Discovery reconstructs scoped candidates in 100-row keyset pages and includes
  future coordinator leases. Execution checks the current row before dispatch.
- Worker batches contain one physical cleanup. Duplicate attempts join one promise;
  different runs serialize through the same database lane. This preserves bounded
  inspection and avoids mistaking another cleanup's brief session reservation for
  a long-lived owner requiring a future release event.
- A coordinator lease uses its saved expiry. `process_exit` retains one 30-second
  probe for that concrete candidate. This exception is for a retained process
  lacking a local exit callback, not idle-history polling; every attempt rechecks
  all authority and physical evidence. It stops when the candidate settles,
  becomes ineligible/operator-required, is deleted, or changes to an event wait.
- Other deferred outcomes drop their scheduled entry until an owner release or
  committed mutation reactivates discovery. **Those production release producers
  must be installed and tested before periodic discovery is disabled.**
- Local release subscriptions are scoped to the database owner and are explicitly
  removed on shutdown. Coordinator shutdown waits for its joined operation.
- No startup registration or periodic skip flag has been added yet. Cloud alarm
  coverage and conservative sleep blockers remain unchanged.

Evidence on this source checkpoint:

- Initial worker tests: 12 passed, `/tmp/sleep51-worker-first.log` / `.status` (0).
- Switching the first post-idle writer to the existing finalization notification
  helper reproduced a missed cleanup wake: `/tmp/sleep51-finalization-signal-before.log`
  / `.status` (1), one failed regression with 16 cases deliberately unselected.
  Adding cleanup to that existing fanout repaired it. No new transaction wrapper
  was introduced.
- The expanded selection passes 18 cases, then 19 after adding a 103-item backlog.
  `/tmp/sleep51-worker-second.log` and `/tmp/sleep51-worker-final.log`, status 0.
  The final suite covers empty-to-active-to-quiet, real physical refusal with
  retained history, named release signals, restart reconstruction, exact lease
  expiry, early release, cancellation, concrete process probing, outer rollback,
  first write during drain, failed work across drain, paused startup, discovery
  failure, a committed wake during cleanup, duplicate joining, serialization,
  shutdown, and completed history across discovery pages.
- The release-signal tests exercise the notification boundary, not all real session,
  environment and maintenance producers. The main first-writer test exercises
  the existing finalization notification helper inside a real transaction, but
  the complete domain-writer audit is still pending.
- Existing manual/startup cleanup and finalization: all 36 cases pass on a fresh
  database, `/tmp/sleep51-worker-legacy.log` / `.status` (0).
- Existing reassessment worker: all 37 lifecycle/producer cases pass on a separate
  fresh database after extending finalization fanout,
  `/tmp/sleep51-worker-reassessment.log` / `.status` (0).
- Server typecheck passes: `/tmp/sleep51-worker-types-final.log` / `.status` (0).
  Total current selection: 92 passing cases. Earlier physical-operation and broader
  executor results remain recorded above; they are not presented as rerun here.

The 103-item test proves paged reconstruction, actual bounded draining and SQL
quiet. It is not the outstanding large-history/candidate cost qualification.
Remaining work includes every actual producer/release path, operational ownership
through retained callbacks, startup integration, periodic removal, full PR checks
and the rest of the recurring-server stack. No new PR or merge is claimed.


## Durable owner release checkpoint

The environment service owns lease release and its existing transaction wrapper.
It now signals the affected run before single/run-wide release commits. Metadata
updates and still-pending cleanup do not activate retained-session cleanup. The
run-wide API resolves company scope from its authoritative run rather than an
unscoped notification. It has no production call sites in the inspected checkout;
its public service behavior remains covered.

Three direct settlement owners also bypass ordinary lease release: stop-only
cleanup, workspace-export-resume settlement, and confirmed sandbox absence. Each
now registers the same scoped intent before the status write. The first two reuse
their transaction; absence settlement uses a short transaction that composes with
a caller-owned transaction. No provider I/O enters those transactions. Existing
receipt validation, ownership and compare-and-set predicates are unchanged.
Verified settled-process release signals before clearing its mutable identity.

The environment writer audit found no production raw-SQL lease updates/deletes
or direct lease deletes in server/src. Other direct writers either retain/add
active or pending-cleanup ownership, change metadata/lease policy, or retire an
already nonblocking lease. In particular, environment-task-runtime completion
only changes retained -> released; retained is already excluded by this cleanup's
active/pending-cleanup predicate. Reusable replacement also starts from released
or retained. These transitions do not unblock this worker. This inventory does
not finish the separate run/finalization writer or local-owner audit.

Evidence:

- `/tmp/sleep51-env-before.log` / `.status` (1): both real single and run-wide
  release fail to reactivate cleanup. `/tmp/sleep51-env-after.log` / `.status`
  (0): all 21 lifecycle cases pass after repair.
- `/tmp/sleep51-process-before.log` / `.status` (1): verified process release
  fails to reactivate before the existing process probe. The process stop check
  is controlled in this integration test; database, receipt writer and service
  transactions are real.
- `/tmp/sleep51-release-after.log` / `.status` (1): the initial process rollback
  test failed to await the coordinator's rollback reconciliation before opening
  the next transaction, then contaminated the following deadline assertion.
  The corrected barrier waits for that reconciliation and verifies the persisted
  original PID. `/tmp/sleep51-release-final.log` / `.status` (0): 23 cases pass.
- `/tmp/sleep51-settlement-before.log` / `.status` (1): all three direct settlement
  producers reproduce the missing wake after commit. The absence test supplies
  already verified typed proof at the settlement boundary; it does not claim
  Cloud receipt signature/provider qualification.
- `/tmp/sleep51-settlement-after.log` / `.status` (0): all 26 lifecycle cases pass.
  These prove outer rollback, no delivery before outer commit, release activation,
  successful settlement and subsequent SQL quiet. Failed cleanup, metadata-only
  updates and stale attempt IDs do not prematurely release the wait.
- `/tmp/sleep51-env-consumer.log` / `.status` (0): all 51 existing environment
  service cases pass on a fresh isolated database.
- `/tmp/sleep51-settlement-consumers.log` / `.status` (0): all 131 existing legacy
  restore/native failed-workspace recovery cases pass.
- `/tmp/sleep51-settlement-types.log` / `.status` (0): server typecheck passes.

This checkpoint covers 208 selected cases. Actual process exit and physical
cleanup safety tests from previous checkpoints remain distinct evidence. Session
owner release, maintenance completion, full run/finalization producer coverage,
physical callback ownership, startup wiring, large-history cost, periodic removal,
publication and full PR acceptance are still open. No polling removal is claimed.


## Local session-owner release checkpoint

The executor now signals company/agent scope after its execution scope and
startup ownership settle, and after backend initialization relinquishes its claim.
An older retained run can share the physical session with a newer run, so a
run-only hint would miss supported waiters. Durable candidate discovery and all
physical authority checks still determine whether cleanup can proceed.

Warm-session removal is centralized in `forgetWarmNativeSession`. It checks the
expected entry identity, removes that entry, then invokes its captured release
callback. All existing retirement paths use this owner boundary, including idle
expiry, explicit shutdown, configuration/instruction changes and quarantine.
Existing failed-close retention rules remain; a late close cannot delete a newer
entry. The callback holds the database scope without adding database fields to
the warm-session record or teaching the scheduler provider behavior. Cleanup's
own temporary reservation release deliberately does not emit this hint, avoiding
self-reactivation on every inspection of retained history.

Three real executor lifecycle regressions first failed with zero release hints:
both startup cancellation variants and warm idle retirement. The strengthened
warm test holds its original close promise unresolved and proves no release hint
until that promise settles. These tests use the existing controlled executor/DB
fixtures. They test actual owner paths; the separate PostgreSQL worker suite
proves the notification-to-reconciliation lifecycle. They are not a single live
provider-to-database end-to-end qualification.

- `/tmp/sleep51-local-release-before.log` / `.status` (1): 3 expected failures,
  810 deliberately unselected cases.
- `/tmp/sleep51-local-release-after.log` / `.status` (0): 798 executor cases pass,
  15 embedded-PostgreSQL remote warm ownership cases excluded because of the
  previously diagnosed host semaphore limitation.
- `/tmp/sleep51-local-release-types.log` / `.status` (0): server types pass.
- `/tmp/sleep51-local-release-worker.log` / `.status` (0): 26 real-database worker
  lifecycle cases pass after local producer wiring.
- `/tmp/sleep51-local-release-final.log` / `.status` (0): final 798-case executor
  rerun passes after removing duplicate entry guards from callers. The same 15
  embedded-database cases remain excluded, not reported as passing.

Next: retained maintenance still has a separate lifetime. Runner tracks active
roots plus original bounded callbacks, but exposes only idle inspection and an
all-roots drain. A timed-out callback can still own its root. The scheduler needs
an owned completion signal for that concrete wait; heartbeat's existing outer
sweep drain must move inside the common physical-operation lifetime so scheduled,
manual and shutdown callers join the original work. Do not clear that obligation
on timeout or add a recurring maintenance-state poll. Runner must expose its own
completion contract; it must not import server notification policy.

Remaining finalization writer audit, maintenance ownership, initialization-path
reactivation proof, startup integration, large-history cost, periodic removal,
publication, and complete PR gates still stand. This slice remains unpublished;
periodic cleanup remains enabled and the full stack remains unmerged.
