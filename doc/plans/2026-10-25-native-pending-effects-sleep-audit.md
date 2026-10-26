# Native pending status-effect recovery

Status: owner/producer audit, before implementation.
Branch: `codex/sleep-47-native-pending-effects`.
Parent: #17687, `b9fe9e2e40ab48104cf18822b5302a740d1957a7`.

## Duty and existing ownership

The native finalization reconciler reads pending/failed `status_decision_effects`
for each candidate's current decision before other finalization work. When any
exist, it calls `dispatchPendingNativeStatusEffects` and skips the remaining
candidate processing for that pass. This is distinct from response presentation,
evidence reassessment, and accepted-result/workspace settlement.

`dispatchPendingNativeStatusEffects` owns the recovery transaction. It locks the
coordinator, checks the exact company/issue/run/decision binding, locks pending
rows, and validates that their materialized targets still exist. Only then does
it mark the ledger delivered, increment attempts, clear retry/error state, update
the run's delivered-effect IDs, and signal chat milestones. It does not create
those targets again and does not perform another status arbitration.

A missing target is an error. Do not turn it into successful settlement merely
to disarm a worker. Retain that error and an owned retry/recovery obligation.

## Current writers

The production `statusDecisionEffects` insert in `commitNativeStatusDecision`
creates effect targets and their ledger entries in one transaction. It explicitly
inserts `deliveryState: delivered`, `attemptCount: 1`, and `deliveredAt`. The two
production ledger update paths also settle rows to delivered: direct recovery
and the `dispatch_pending_effect` materializer. Repository searches found no
current producer inserting pending/failed ledger rows; the schema default and
historical fixtures still support those states. This is a source audit, not
permission to drop historical recovery or assume independent SQL is supported.

Accordingly, ordinary successful decision commits should not acquire a needless
pending-effects timer. Startup must reconstruct historical unresolved effects.
The next audit must identify coordinator transitions that can make historical
rows eligible again, and decide which existing mutation boundaries need signals.

## Eligibility and ordering to preserve

The existing outer candidate query requires native runtime, a non-null result,
a coordinator outside terminal_failure, a due/null nextAttemptAt, and an absent,
null-expiry, or expired coordinator lease. It also requires the issue join.
Pending effects refer to the coordinator's exact current decision. A worker must
preserve those authority constraints and distinguish a future eligibility
deadline from dormant superseded ledger history.

The periodic reconciler must not continue into other finalization work for a
candidate whose pending effects moved to the new owner. Simply deleting its
pending-effect branch would change ordering. Keep direct/manual behavior or
replace its contract explicitly. Coordinate completion with the remaining
finalization owner until that owner is separately migrated.

Open design questions before coding:

- Which historical pending records are still owed, and which are superseded?
- Which coordinator phase/decision/result/lease changes reactivate dormant work?
- How are saved coordinator retry deadlines combined with pending-effect retry
  after a target/read failure without resetting future deadlines on inspection?
- How does a worker stop or drain without losing a first dirty scope or retry?
- Which query/index bounds discovery when delivered history dominates?

Use the existing scoped deadline helper and transaction notifications if they
fit. Keep eligibility and mutation policy in native runtime. No new queue table,
provider branch, generic materialization replay, or host-sleep exemption is needed.

## Baseline and required verification

All 72 cases in `native-status-arbiter-corpus.test.ts` passed on fresh external
PostgreSQL before this slice changed source (`/tmp/sleep47-baseline.log`). The
corpus exercises crash-after-decision-commit recovery and rejects a pending
continuation whose target is absent. It also validates adjacent arbitration,
review, cancellation, and finalization behavior.

Add focused worker tests for delivered-history quiet, pending/failed startup
recovery, no duplicate targets, missing-target failure, exact binding/tenant
fences, coordinator retry/lease readiness, mutation reactivation, transaction
commit/rollback, drain/resume, concurrent state changes, shutdown, and bounded
multi-page discovery. Re-run the corpus and affected consumers after source
changes. Current tests establish only the baseline, not a migrated worker.
