# Approved tool-action recovery

Approved tool actions recover at startup and after committed review changes.
The aggregate maintenance tick no longer scans approved requests. The existing
request and invocation rows remain authoritative; this change adds no queue table.

## Work and quiet states

The gateway owns the approved-work predicate. A signed agent action with
`executionOnApprove: true` owes execution through the normal approval path.
A legacy signed action without that flag remains deliberately inert. A Test-tab
approval can owe execution even when no agent run exists. Recovery uses the saved
origin and current authorization/target checks; the scheduler sees only whether
another attempt is needed.

Startup discovers companies with saved approved requests. Committed review
signals carry the affected company ID; subsequent discovery and recovery reads
filter by that company. The shared scoped worker coalesces changes and dispatches
one company per pass with a one-second minimum spacing. A company writing reviews
does not scan or lock another company's approved backlog.

Recovery pages that company's approved requests in ID order using a partial index. It does not
let a full batch of unavailable approvals starve later work. A failed read or
unresolved executable approval retains a 30-second retry. New writes preserve
that company's retry deadline, while other companies can run independently.
A company pass still drains all its pages; this change does not cap provider
calls within that pass or alter the provider's existing execution timeout. Once a pass leaves no
such obligation, there is no recurring approved-recovery query. An empty system,
configured idle tools, completed history, and deliberately inert approvals are
quiet after reconciliation.

## Producer and transaction ownership

The existing tool-review notification boundary now signals both pending expiry
and approved recovery. This covers human review transactions, gateway approval
and accepted-interaction inference, administrative interaction resolution, review
queue invalidation, and the gateway's approval claims and managed-argument
invalidation. The notification is awaited before SQL in the existing transaction;
caller-owned outer transactions retain commit/rollback ownership.

A pending-only change can cause one empty company-scoped discovery read. It does not
create a periodic scan. No per-route recovery bookkeeping or database listener
is added. Signals use the existing database owner's single-active-writer model.
Independent SQL writers or another process need a separate notification contract.

## Single execution and outcome ownership

Agent actions retain their existing approved-to-executing claim. Test-tab
foreground approval and recovery now share an equivalent claim before provider
dispatch. The invocation then starts only if the request still holds that claim.
Provider calls and target/policy lookup remain outside SQL transactions.

The Test-tab invocation outcome and terminal request status commit together.
Claim timestamps fence late settlement. A later audit failure cannot overwrite
an already committed outcome. Recovery repairs legacy approved Test-tab requests
from a saved terminal invocation without decoding old arguments or calling the
provider. A legacy executing invocation moves to the existing interrupted-work
path; it is not dispatched again.

If the provider may have run but its result cannot be persisted, the executing
claim remains authoritative. The existing stale-execution recovery quarantines
unknown outcomes. This slice does not promise exactly-once external effects or
replay an uncertain provider call.

## Lifecycle and remaining duties

The shared deadline worker coalesces notifications, preserves changes during a
pass, and retains skipped work across idle drain/resume. Startup reconstructs
saved approvals. Company deletion invalidates cached recovery and retries through
the same transactional notification boundary. Shutdown stops its coordinator registration. With heartbeat
scheduling disabled, startup keeps the existing one-off recovery behavior.

Pending expiry is owned by the preceding slice. Interrupted execution and
interaction projection repair remain in the old sweep until their own migrations.
The public combined sweep retains all duties for manual/recovery callers.
No Cloud eligibility or external-wake proof changes here; worker quiet does not
establish deployed database or host suspension.

## Verification

Real PostgreSQL service/startup tests cover producer commit and rollback,
startup reconstruction, empty/configured/history quiet states, concrete retries,
first-write drain/resume, legacy inert approvals, and multi-page recovery.
Controlled Test-tab provider tests cover both foreground/recovery race winners,
completed legacy outcomes, interrupted legacy calls, target changes, and a failed
atomic outcome write followed by quarantine without another provider call.

The service/startup selection passes 123 tests. The existing gateway acceptance
suite passes 92 tests. The strengthened paging and outcome-failure cases pass
again after their final edits. Workspace typecheck and build pass. Full CI and
review remain separate PR gates; no real external provider was invoked by these
fixtures.

Review found that a one-shot success-write failure could fall into the provider
error handler and save a false failure on its second attempt. The added sequence-
based PostgreSQL fault reproduces that bug before the fix. Provider execution,
pre-dispatch validation, and outcome persistence now have separate error
boundaries. Both persistent and one-shot result-write failures retain the claim
for quarantine without repeating the call. The complete 123-test selection and
92 gateway acceptance cases pass after the repair, as do typecheck and build.

The existing tool-access service regression now expects a completed Test-tab
request to be executed and verifies exactly one provider call before asking for
a new approval. Its full 469-test suite passes. The initial local command skipped
its database cases; the suite now honors its supplied disposable database through
the standard test-database guard independently of embedded Postgres support.

Company-scoping regression: a real signed/reviewed action in company A previously
caused an unfiltered approved-request SELECT over company B's inert legacy action.
The captured-SQL test fails before this repair and passes with scoped reads. Added
lifecycle cases check retry preservation across committed writes, independent
company progress, and disarming after the real company-deletion producer. These
checks supplement the earlier execution, transaction, and paging evidence above.

After company scoping, the complete gateway-service and startup selection passes
149 tests against a disposable PostgreSQL database, and server typecheck passes.
Stack integration, workspace checks, and fresh remote CI remain separate gates.

## Preparation failures retain an approved Test-tab action

A real PostgreSQL policy-read timeout reproduced a permanent-failure bug after
claiming a Test-tab action: the provider had never been called, but both request
and invocation were saved as failed, so approved recovery could not retry them.

The preparation boundary now distinguishes explicit validation/access rejections
from unexpected dependency errors and transient HTTP errors. The existing
`tool-approval-execution` owner releases only its exact claim: invocation and request
are locked in the established order, their link/company/claim timestamp must
match, and the invocation must still await approval with no recorded start.
The request returns to `approved` with a transaction-aware notification. Signed
arguments and the human approval remain unchanged; the error propagates so the
existing recovery worker retains its retry obligation.

This boundary ends before `runTestToolInvocation`. Provider dispatch and outcome
persistence keep their existing conservative no-replay behavior. A changed claim,
started invocation or prior-dispatch evidence cannot be released by this path.
If the requeue transaction itself fails, the error propagates and no terminal
failure is fabricated; existing interrupted-execution reconciliation remains the
fallback. This change does not infer replay safety from a failed requeue.

Before the fix, both foreground and recovery timeout regressions failed. They
now observe the committed claim under a real PostgreSQL table lock, wait for
`55P03`, verify unchanged approval and no provider call, then prove automatic
recovery invokes the provider once and becomes quiet. Additional real-row cases
cover changed ownership, mismatched invocation, a started call, prior-dispatch
history, and outer-transaction rollback. A released claim cannot start execution.
All 117 gateway-service cases pass on the owning slice, including existing target
invalidation, provider-outcome persistence failures and unknown-outcome no-replay
cases. Integrated consumer checks, workspace verification and remote PR gates
must still be recorded after propagation.


## Agent-origin preparation and dispatch ownership

Agent-origin approvals use the same pre-dispatch retry contract as Test-tab
approvals. Previously, a policy or identity dependency failure after claiming an
approved action permanently failed it; earlier issue/signing failures could
leave the claim executing. Preparation now has one owning error boundary around
issue, signature, identity, target, policy, managed-argument, and content checks.
Validation and nontransient access rejections retain their terminal handling.
Unexpected dependency failures and transient HTTP errors release only the exact,
still-undispatched claim to the existing approved queue and publish its existing
transactional work signal. No table, maintenance scan, or retry wrapper per
producer is added.

`tool-approval-execution.ts` owns the shared claim token, release, and dispatch
transition. Its Test-tab claim/outcome functions remain specific to that consumer.
Both origins use the same invocation-then-request locks and verify invocation,
company, request linkage, claim timestamp, awaiting-approval state, and absence
of an earlier start before dispatch. An agent that loses its claim during
preparation cannot call the provider or overwrite its successor. The Test-tab
unapproved direct-call path retains its original behavior.

Only preparation is retryable here. Recording the invocation start, provider
execution, and outcome persistence remain outside that catch. A provider error,
unknown outcome, or failed durable release does not establish replay safety.
Existing interruption handling remains the conservative fallback. Closed-issue
expiry, signature/target invalidation, identity authority, and policy rejection
remain enforced, including the final issue check before recording dispatch.

Real PostgreSQL lock-timeout cases cover foreground approval and recovery:
observe the committed executing claim, block the policy read, then require the
same signed request to remain approved with no invocation start and zero provider
calls. Recovery after releasing the table lock executes once and becomes quiet.
A separate contention case replaces the claim while preparation is blocked and
proves the old owner cannot dispatch; the surviving approval later executes once.
A provider-error case proves that an already-started call is not requeued as a
preparation failure. The existing Test-tab timeout and ownership cases exercise
the other consumer of the shared boundary.
