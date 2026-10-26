# Native status reassessment without idle polling

Native status reassessment uses committed changes and the shared delivery
scheduler. It no longer runs on every periodic orphan-recovery pass.

## What creates work

Existing native result, assessment, decision, task and review rows remain the
source of truth. No new queue table or database migration is required.

| Change | Existing producer boundary |
| --- | --- |
| Work-product creation, update, import, removal, attachment or trusted promotion | Work-product/task services and the promotion transaction |
| Task status/version, assignment, execution state or blocker configuration | Task mutation transaction |
| Direct claim release, terminal/stale lock cleanup, queue release, recovery or tree restoration | Existing task-scoped claim mutation transaction |
| Automatic review retirement | Automatic completion review owner |
| Approval/link or interaction outcome, including OAuth card creation/reopening | Approval/review-state notification boundaries |
| Accepted/rejected control-plane run evidence | Run-event append transaction |
| Workspace barrier or physical ownership settlement | Workspace operation, finalizer and verified recovery owners |
| Coordinator claim/retry, effect settlement or run projection | Native finalization and run-milestone boundaries |

These signals request inspection. They do not grant permission to complete a
task. Discovery retains the three existing conditions: changed work-product
history, changed authoritative task status/version, or a retired selected
completion review. The owner still classifies the selected result and appends
assessments and decisions through the existing status committer.

A settled worker makes no recurring queries. Insufficient evidence is dormant.
Real contention or operational failure keeps a retry. A saved retry or lease
expiry keeps its actual future deadline. Startup reconstructs candidates in
100-row pages; the coordinator processes bounded batches and retains changes
through drain/resume and concurrent dispatch. Shutdown uses its existing owner.

## Authority and separate responsibilities

Scheduled commit checks the selected source, current task/run, retry and lease,
pending effects and native process ownership inside the status transaction.
Retired-review completion also checks the latest contract, workspace barrier,
physical workspace ownership, governance and dependencies. Evidence is
reclassified under source locks. Contention defers instead of blocking an idle
worker indefinitely or committing stale completion.

The legacy reconciler retains explicit recovery and a one-time startup pass.
Its periodic call skips reassessment but preserves the superseded historical
source guard before independent workspace recovery. Workspace/result settlement,
retained session cleanup, native wake delivery and generic orphan recovery are
separate duties; their recurring scans have not been removed by this slice.

Case-handoff delivery and lease changes do not improve evidence: every persisted
non-cancelled state already counts as accepted. Cancellation is negative evidence
and is fenced by the source lock at scheduled commit. Creation generates the
handoff identity inside its transaction before returning it. No reassessment wake
is added to every lease renewal. Target-agent status is also not a classification
trigger: attention validation checks existence, not whether an agent is invokable.
Creating an agent does not satisfy result criteria or verification. Missing
arbitrary target identities have no row to lock; this change does not provide a
general predicate-lock guarantee for independent identity insertion.

Pending child completion is a guard and a fresh parent-turn obligation. It is not
silently consumed by completing the old result. New contracts supersede the old
result's eligibility; creating one does not revive that old result. Direct SQL
writers and independent replicas do not receive process-local notifications.
The supported producer model remains the active server and integrated transaction
owners; this change does not add a distributed notification transport.

## Evidence and limits

The corpus/startup/lifecycle selection passes 246 tests; the existing native
finalization and retained-cleanup consumers pass 32 tests. Workspace typecheck
and build pass. A review-driven repair adds six real claim-release regressions; the repaired
selection passes 978 lifecycle and consumer cases, with 15 embedded-DB runtime
cases excluded for the host limitation below. Ordinary release preserves its new
assignment authority instead of automatically completing the old review.
Earlier producer suites exercise commit/rollback, first real
writes, failures, dormant history, saved deadlines and authority races.

A 10,000-task selected-history fixture returns no company candidates in about
35 ms locally. A 10,000-item real backlog takes 101 queries and about 1.56 seconds
to reconstruct. The coordinator retains outstanding entries; total memory is
proportional to the backlog. A permanent 103-item lifecycle case verifies actual
settlement across batches and SQL quiet afterward. Discovery stops between pages
when drained or aborted; it does not cancel an already-running SQL statement.

Full local-suite acceptance is not yet established. Embedded PostgreSQL cannot
bootstrap because the host has exhausted System V semaphores. A direct disposable
initdb probe reproduces the error before application tests execute. Dedicated
PostgreSQL 17 tests above pass. Remote CI and review must pass on the PR head.

The [audit](plans/2026-10-26-native-status-reassessment-sleep-audit.md) records
before-fix failures, repairs, producer evidence, benchmarks and retained limitations.
The [stack ledger](plans/2026-10-24-recurring-server-sleep-stack.md) tracks other
duties. Worker quiet does not establish database suspension, Cloud alarm coverage,
host sleep or fleet cost savings.
