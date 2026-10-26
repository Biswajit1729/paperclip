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
- No new table, migration, scheduled worker, timer, or provider operation is added.
- **Periodic cleanup remains enabled. This checkpoint does not establish quiet.**

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

The shared worker still needs to consume this contract. It must not drop deferred
work without the corresponding release notification or concrete probe/deadline,
and must not retry every ineligible retained history. A valid PID whose absence
cannot be proven remains deferred and cannot grant cleanup authority. The supported
process-exit observation and local session-release contracts remain to implement.

Use the existing scoped deadline worker for reconstruction, coalescing, fair
bounded dispatch, retries and drain retention. Keep eligibility and execution in
the native cleanup owner. The new worker must join an already-running legacy
startup/manual attempt and retain shutdown ownership of physical callbacks.
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

- [ ] Explicit transient/dormant/terminal cleanup outcomes and operational failures.
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
