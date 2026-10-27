# Import spool cleanup without an hourly scan

This is slice 59 of the recurring server work migration, based on slice 58
at `929c86e32e00d219b329741dd2c89c40b1a5f826`. The original inventory includes
abandoned company-transfer files among the remaining application maintenance
loops. This slice does not complete the inventory or certify other stack PRs.

## Problem and ownership

The application previously ran `sweepAbandonedImportTransferSpools` at startup
and every hour. It listed the import directory and queried every transfer with
files, including failed transfers retained for a future retry and applying
transfers owned by live work. These retained files caused SQL indefinitely.

`company-import-transfers.ts` owns filesystem layout and cleanup policy.
`company-transfer-runs.ts` owns all supported production ledger writes, including
compare-and-set cancellation. `import-spool-cleanup-work.ts` connects these
owners to the existing delivery coordinator and scoped deadline helper.
`app.ts` registers the worker and removes its local filesystem subscription at
shutdown. The coordinator owns non-overlap, retries, drain, and joining cleanup.
There is no new table, filesystem watcher, timer, or provider abstraction.

## Durable truth and deadlines

| Existing state | Obligation and next wake |
| --- | --- |
| No directory | None; no ledger read or future scan |
| Pending/running upload with files | Saved `updatedAt + 24h + 1ms`; revalidate and cancel atomically before deletion |
| Failed transfer | Retain verified files for retry; no recurring work |
| Applying transfer | Retain files for its live apply owner; no recurring work |
| Completed/cancelled transfer with files | Delete immediately; failure keeps a bounded retry |
| Directory with no ledger row | Directory mtime plus 24h, rounded to the first millisecond strictly after the cutoff |
| Database or filesystem read error | Keep discovery unresolved and retry; absence is not inferred |

The extra millisecond preserves the existing strict idle cutoff. A resumed
transfer updates its row, so the cancellation guard prevents deletion based on
a stale read. Cleanup uses cancelled, not failed: failed transfers remain
claimable for apply and cannot be used as a deletion claim. Failed files remain
retained indefinitely under the existing policy. Permission errors no longer
count as an empty directory. Only ENOENT means absence. Symlinks and non-UUID
names are not followed as import directories.

Startup still separately recovers stranded applying rows once. The deadline
worker never performs that recovery, because doing so would interrupt live
applies. This migration preserves that startup operation's existing admission
behavior; it does not expand the worker's authority to fail live runs.

## Producer and boundary audit

All production writes to `company_transfer_runs` are in its service. A local
transaction helper registers the existing database-work intent before each
update. It composes with outer transactions; savepoint release does not publish
premature cleanup. The insert allocates its UUID before registering intent in
the existing idempotency transaction. Methods covered are:

- `resumeOrCreate` when it inserts; returning an existing row makes no change.
- `recordManifest`, `start`, `attachCompany`, and `completePart` (activity deadlines).
- `claimApply`, `releaseApplyClaim`, `complete`, `fail`, and `cancel` (eligibility).
- `cancelIfIdle` (deletion claim).
- `recoverStrandedApplyingRuns` (one startup-wide invalidation).

Ordinary hints identify one run. No directory means the worker returns before
reading the ledger, so export writes and declarations without parts do not
trigger global scans or cleanup SQL. The shared ledger now pays transaction
intent overhead on these writes; notifications do not make writes free.

The filesystem owner emits process-local root/run hints after part writes,
part removal, and whole-spool removal, including partial failures. A failed
rename can leave a directory even if the subsequent ledger update never happens.
Startup scans existing directories to reconstruct that obligation. The cleanup
read selects only ID, company ID, status, and update time, not the manifest or
completed-part history. Pre-company imports and orphan directories share an
instance-level fairness group; this label is not an authorization identity.

The supported writer model is the server's existing single-process import and
apply flow. Independent SQL writers, another server sharing these directories,
and external filesystem edits have no live notification contract. Restart
reconstruction still sees persisted files. This slice does not claim otherwise.

## Lifecycle and verification

The worker retains scoped invalidations arriving during discovery or cleanup.
Drain suppresses passive SQL and filesystem discovery without consuming pending
work. A first upload during drain still reconciles on resume. Shutdown removes
the filesystem listener and joins already-running cleanup through the delivery
owner. Failed removals retain the scoped retry floor even when another write
invalidates their run. Empty, failed, and applying states disarm the worker.

A real PostgreSQL regression first reproduced an unsafe preexisting behavior:
a failed ledger read was swallowed as a missing row, and cleanup deleted the
old directory. The repaired test requires the error to propagate and the bytes
to remain. Its first setup attempt could not find a root-level tsx binary;
the repository's CLI-installed runner prepared the dedicated database instead.

All 50 tests across three complete suites pass: import worker lifecycle, import
routes, and transfer ledger. This includes real files and PostgreSQL for strict
expiry, scoped first writes, retained history, orphan reconstruction, outer
commit and rollback, apply-versus-cleanup races, permission errors, partial file
writes, concurrent wakes, retry through drain, and shutdown joining. Existing
route tests cover upload/apply concurrency and successful apply with failed file
cleanup. No tests in these three suites were skipped. Server typechecking passes.

The first lifecycle run passed 10 of 14 cases. Four fixture failures came from
fake time expiring PostgreSQL socket timers, a drain fixture disabling both
execution and transaction reconciliation, counting old filesystem spy calls,
and comparing advanced fake time against real filesystem mtimes. The fixture
now keeps database driver timers out of the simulated lifecycle, models the
production drain contract, and starts fresh observation windows. Product
assertions were retained; three additional lifecycle cases also pass.

Workspace typechecking, full build, and remote PR checks are tracked separately
in the PR. Full local `test:run` remains unverified due to the previously recorded
embedded PostgreSQL capacity limitation. Dedicated `_test` databases were used
for these complete suites. No host semaphore cleanup was repeated.

## Sleep boundary and remaining scope

This proves worker quiet and reactivation, not database or host suspension.
The existing host-sleep proof still treats company transfer rows conservatively.
The Cloud alarm contract has not been extended to import-file expiry. Internal
`nextWakeAt` alone is not proof of a persisted external alarm. Do not remove that
sleep blocker on the strength of this worker migration.

Other original inventory duties, master reconciliation, and existing stack
review/CI debts remain separate work. No stack PR is merged by this slice.
