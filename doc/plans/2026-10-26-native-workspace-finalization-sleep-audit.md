# Native workspace finalization sleep audit

Slice 52. Parent: [#17717](https://github.com/paperclipai/paperclip/pull/17717)
at `d0036fce3e039e91ab2bf2602e3e6a87a4476491`.
Branch: `codex/sleep-52-native-workspace-finalization`.
Inspected remote master: `a1f77821b9cd5c9c846fdf7a0fa5cc620ad2b6bb`.
This is a stacked branch, not a claim that current master has been integrated.

## The obligation

An accepted native result can still owe workspace copy-back or validation. The
existing native result, finalization coordinator, workspace-operation receipts,
and physical-owner receipt are its durable evidence. This change adds no table.
An accepted result does not prove copy-back, result projection, or resource release
finished. This slice migrates copy-back/validation only. The remaining result
commit/projection and resource-settlement duties retain their current recovery.

The normal orphan pass used to re-enter workspace finalization on each scan.
The enabled server now registers a scoped deadline worker and skips that physical
operation in its periodic orphan pass. Explicit and startup reconciliation keep
the existing direct API. The remaining reconciler still scans for its other duties;
this slice alone does not make the whole orphan pass quiet.

## Boundary decisions

- `native-workspace-finalizer.ts` owns workspace execution and its existing failure
  classification. Both direct reconciliation and scheduled execution use that policy.
- The ownership service retains its dedicated advisory lock, physical callback join,
  exact durable receipt, same-boot join evidence, and current-task checks. No elapsed
  timeout grants permission to overwrite another owner's files.
- The platform-proof boundary now distinguishes verified evidence, pending evidence,
  and unsupported configuration. Only verified signed evidence permits takeover.
  The worker does not interpret a Railway response or implement signature policy.
- Acquisition refusal identifies an active local owner, an external/busy owner,
  pending platform proof, operator-required proof, or a changed task/owner binding.
  This prevents a universal retry for all refusals.
- Local owner completion is a hint to read the saved obligation. It also fires
  after the original callback joins when clearing its receipt fails. Different DB
  objects without that completion subscription retain a scoped busy-owner retry.
- Heartbeat supplies physical-operation tracking. Index only registers, gates, and
  stops the worker. Shutdown stops the coordinator and joins the physical callback.

## Trigger and deadline inventory

| Obligation / transition | Producer or durable source | Wake and stop condition |
| --- | --- | --- |
| First accepted result | `PaperclipControlPlanePort.completeRun` | Intent in the result's transaction; outer commit wakes, rollback creates no work |
| Saved retry or finalization transition | Existing native-finalization notification fanout, coordinator and finalizer writers | Reconstruct `nextAttemptAt`; do not advance it on inspection |
| Finalization lease | Existing coordinator row | Wait for the saved expiry; execution re-reads it before copy-back |
| Workspace-operation progress/completion | Workspace recorder's `workspace_finalize` writes | Same-transaction scoped notification; any successful barrier disarms this worker |
| Retained workspace repair completes | `workspace-recovery.ts` writes a success barrier directly | Same-transaction notification removes an obsolete copy-back obligation |
| Local writer still owns copy-back | Ownership service's exact run/token and DB owner | Completion hint; no SQL/network timer while that local callback is active |
| Busy lock without a subscribed local owner | Physical ownership acquisition | Scoped 30-second check while this concrete export remains unresolved |
| Supported Cloud stop evidence remains pending | Authenticated platform proof request | Scoped 30-second retry; success still checks the exact task/run/result/owner before copying |
| Unsupported, malformed, or unverifiable owner | Existing board recovery action | Remain fenced and quiet; no fallback poll awaiting operator action |
| Operator confirms the exact owner stopped | `resumeNativeWorkspaceAfterOwnerStop` | Intent before clearing the receipt in its existing transaction; resume without another provider turn |
| Task changes during proof; later returns to eligible state | Existing issue update owner | Refuse stale copy-back; a scoped issue mutation notification permits a fresh check |
| Startup/resume | Existing result/coordinator/operation records | Keyset pages of 100; one physical operation per fair dispatch batch |

Completed barriers, terminal-failure coordinators, rejected/unbound results, and
absent work do not create recurring deadlines. An unresolved export can still
require recovery and prevent host sleep; it is not silently discarded for quiet.
Startup reconstruction may inspect an operator-required record once. Retained
history with a completed barrier is excluded by SQL.

Supported writers are the same-process application services using the existing
transaction-notification boundary. This does not add cross-replica notification
transport or support independent SQL writers. Environment/configuration changes
that enable Cloud verification require the existing restart/configuration lifecycle.
External alarm coverage and conservative host-sleep safety are unchanged.

## Verification checkpoint

The new platform contract was reproduced red before implementation. The five
platform-proof cases then passed. Complete affected ownership, retained recovery,
and board-action suites passed 206 cases at the first contract checkpoint.

The worker lifecycle suite now passes 12 cases against a disposable PostgreSQL
server, using the real result producer, recorder, owner lock, and operator API:

- Empty → real accepted result → successful barrier → retained history → restart.
- No SQL across multiple old poll periods when empty, completed, locally owned,
  operator-required, or waiting on a changed binding.
- Real result writes inside an outer commit and rollback.
- Startup and first-result writes during drain, followed by admission reopening.
- Reconstruction and enforcement of a saved retry deadline.
- Local owner release and shutdown joining a deliberately held physical callback.
- Operator confirmation after quiet; pending Cloud evidence followed by verified proof.
- Task restoration through the normal issue service after a stale-binding refusal.
- Real validation failure, persisted retry, and successful validation after repair.

Preserved test failures: the first two drain cases used a nonexistent test-harness
`coordinator.resume()` method; the test now reopens admission and advances the
existing scheduler. The first failed-validation assertion checked the next deadline
before the retry-write notification settled; it now waits for notification processing
and still asserts the exact saved deadline. Neither required weakening a product guard.

Server types passed at the initial worker checkpoint. The final complete affected
suites, workspace types/build, full test command, PR checks and current-head review
remain to be recorded before acceptance. No deployed app/database suspension or
fleet cost reduction has been measured.

## Remaining work outside this slice

The next two owners are accepted-result commit/projection and finalization resource
settlement. Existing cleanup paths swallow some release errors; a workspace success
barrier must not be used to declare that cleanup settled. Retained workspaces, native
status wakes, process/session recovery, scheduling, maintenance, and the older stack
review failures remain in the main stack ledger. No stack PR is merged by this work.
