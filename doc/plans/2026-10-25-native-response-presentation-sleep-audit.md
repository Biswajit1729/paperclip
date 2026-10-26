# Native accepted-response presentation recovery

Status: worker and owner guards implemented locally; producer audit and startup/periodic integration incomplete.
Branch: `codex/sleep-48-native-response-presentation`.
Parent: [#17690](https://github.com/paperclipai/paperclip/pull/17690),
`56c3601ea605b333141e86e0a810ed790fb6ce48`.

## Reason for work

A native run can have an accepted, committed result but no saved public reply.
The finalization reconciler calls `repairCommittedNativeChatResponse` before
skipping superseded status decisions. A later task decision must not erase an
already accepted, still-authorized response. This work neither re-executes the
provider nor changes issue disposition. It is separate from governed-review
presentation, evidence reassessment, and result/workspace settlement.

The current helper covers three variants of the same accepted-response duty:
a saved same-agent/monitor continuation summary, an internal task's exact final
assistant message, and an authorized external response-wake summary. Governed
review responses are explicitly excluded and retain their own stricter owner.
Do not merge the review response migration into this slice merely because both
helpers live in the finalizer.

## Existing authority and mutation boundary

`repairCommittedNativeChatResponse` locks issue, run, and coordinator in that
order. It requires native runtime; succeeded, failed, or timed_out with finishedAt;
a committed coordinator with result/assessment/decision and a null leaseOwner.
It refuses to replace a selected comment, including a deleted selected answer.
It checks the accepted result's digest using either the coordinator format or
the older authenticated control-plane format, retaining its bounded journal
source lookup. It excludes externalChatReviewPresentation decisions.

A lease that expired but still has an owner is not permission to publish: the
helper requires actual release. Do not reuse the pending-effects lease rule.
The outer periodic candidate query additionally respects saved nextAttemptAt.
A future worker must preserve that fence where applicable and wake on release.

Internal completion needs an exact final assistant event for the accepted turn,
current internal-write authorization, and permission to create a new completion
comment. Continuation summaries check provider-owned interactions. External
response-wake summaries require the live registered chat authority, exact durable
source provenance, and current presentation authorization. The chat owner validates
source edits/deletion, membership, endpoint state/generation, consumed failure
lanes, and ambiguous delivery. None of this policy belongs in a generic scheduler.

The comment and presentationDecision are written in the same transaction, through
the existing comment/publication owner. Notification follows durable commit.
Recovery must not revive private provider narration, duplicate a target, publish
under another source, or reinterpret the saved result using new task settings.

## Contract gap to resolve before retiring polling

The helper currently returns false for several distinct outcomes: already settled,
structurally ineligible, authority unavailable/revoked, and transient SQL/lock or
materialization failure. It logs most errors then returns false. A worker cannot
use that boolean as a pending-work predicate: dropping false loses retryable
responses, while retrying every false rescans ineligible history indefinitely.

Keep the current boolean caller contract where needed, but expose the smallest
owner-level result/error contract that distinguishes dormant history from concrete
retry debt. Do not translate all authorization failures into retry forever. The
registered authority lives in durable-chat-wakeup.ts and is installed by
chat-channels/failed-run-retry.ts. Missing registration and later registration need
an explicit lifecycle wake path, separate from committed database mutations.

Audit and test the candidate predicate before introducing a worker. Startup scans
must filter selected answers, irrelevant result kinds, review-owned responses,
and other passive history. Full authorization stays in the locked owner; SQL
prefiltering is not a new publication authorization mechanism. Measure actual query
plans with substantial completed history before claiming bounded discovery.

## Producer audit still required

- Native coordinator decision commit, persisted-attention replay, and ownership
  release; result/assessment/decision binding changes.
- Run terminalization and accepted-turn event persistence, including late journal
  arrival and direct recovery writers. Avoid waking on every unrelated progress
  event merely because it shares the journal.
- Presentation selection/materialization and existing-comment suppression. A
  deleted selected answer remains settled rather than becoming repair debt.
- Issue conversation/context changes and skipIssueComment behavior.
- Exact chat source, action/admission, publication, endpoint generation/status,
  principal/membership, continuation provenance, and ambiguous-delivery resolution.
  Separate mutations that only revoke work from supported reactivation paths.
- Live chat-authority registration/replacement/shutdown; subscription ownership.
- Startup, first write during drain, retry during drain, resume, and shutdown.

Use existing durable records, scoped transaction signals, and the shared scheduler.
No new response queue table or permissive publication fallback is justified.
Independent SQL/multi-process writes remain outside the existing local signal
contract unless explicitly integrated; preserve the documented limitation.

## Baseline evidence

On the unchanged parent source, a fresh external PostgreSQL selection passed
33 accepted-response cases in chat-channels.integration.test.ts. The remaining
1,551 cases in that file were not selected, not claimed passed. The selection
covers duplicate/concurrent repair, source/authority changes, digest changes,
private disposition, cross-company/run binding, live heartbeat fences, the older
port-bound digest, GitHub internal prose/attachments, failure-lane replacement,
provider-dispatch reauthorization, selected/deleted answers, and contention.
Log: `/tmp/sleep48-chat-baseline.log`. Database:
`paperclip_sleep48_chat_baseline_20261025_test`.

The monitor-continuation and control-plane-port suites currently require embedded
PostgreSQL directly. Qualify a validated external-test path if needed before using
their results on this host; do not count skipped or initialization-failed suites.
No sleep or migrated-worker behavior is established by this baseline.

## Initial owner-contract change

`recoverCommittedNativeChatResponse` now exposes the existing transaction and
returns false for settled/ineligible/authorization-denied state, while propagating
operational failures. The existing `repairCommittedNativeChatResponse` wrapper
retains logging and false-on-error behavior for current callers. Authority checks,
lock order, target materialization, and commit signaling remain in the same owner.
The commit signal itself contains subscriber errors, so the wrapper does not hide
a previously propagated publication error.

The same 33-case real-PostgreSQL selection passes after this change, with added
assertions that the new entry point rejects under actual source-action lock
contention and returns false for the existing authorization/binding fences. The
server typecheck passes (`/tmp/sleep48-contract-typecheck.log`). Worker discovery,
producer notifications, startup wiring, and periodic removal are not implemented.

## Existing notification boundary to reuse

The current `notifyChatRunMilestones` boundary already covers 102 production call
sites and fans out lineage/authority changes to native progress, inbound notices,
confirmations, and GitHub work. Its scope is company plus optional issue because
source changes can authorize descendants. Audit its coverage for this duty before
adding caller wrappers. It already reaches status-decision settlement and run
projection, but raw coordinator-store/session release and accepted-turn journal
writers need individual inspection. Reuse is not proof that all producers exist.


## Local worker and locked scheduling fences

The local worker now discovers exact run/coordinator/result/decision bindings,
filters selected answers and structurally irrelevant results, and dispatches
through `recoverCommittedNativeChatResponse`. It does not own publication policy.
`onlyWhenDue` rechecks the saved retry and outstanding status effects while the
existing coordinator lock is held. Existing explicit callers retain their old
behavior. A future retry is retained even if it becomes due between the locked
check and the follow-up read; its next attempt is immediate rather than discarded.

Operational errors remain retryable through the shared coordinator. A structurally
eligible but unauthorized row becomes dormant until an eligibility mutation or
live authority registration invalidates its scope. Selected comments, including
deleted selections, remain excluded. No provider rerun or new work table is added.

The existing milestone notification boundary now includes the response topic.
Hints explicitly select company and issue IDs: structural TypeScript callers may
pass larger objects, so serializing the whole argument is not safe. The first
integration run exposed that mistake as circular-object serialization during
status materialization; it was corrected before the passing runs below.

Two narrow lifecycle capabilities support the new consumer:

- `registerScopedDeadlineWork.invalidate` marks reconstruction dirty before waking.
  A plain wake is insufficient after a prior dormant result removed its entry.
  Existing consumers keep the same registration and scheduling behavior.
- The committed-response authority owner exposes registration notifications.
  Registering/replacing the actual chat service reactivates dormant responses.
  The worker's `stop` removes this subscription; the delivery coordinator still
  owns worker cancellation and awaiting in-flight work. Repeated unsubscription
  cannot delete a later listener set. The authority remains scoped to the exact Db.

No startup registration or periodic skip is wired yet. The old recovery path is
still present. Full producer coverage, internal/continuation variants, recovery
failure/drain tests, and repeated large-scope mutation cost remain acceptance work.
Current discovery pages by run ID but reconstructs all matching pages in one
load; its resource bound under a large unresolved/dormant backlog needs proof
before activation. Do not describe the worker as a completed migration yet.

## Query-plan and migration evidence

The actual discovery query was captured from the driver. On a disposable database
with 10,000 additional selected runs, results, assessments, decisions, and
coordinators, it initially scanned completed history (22.656 ms). A partial
unpresented-run index alone still chose the wrong join order (16.532 ms).
Expression statistics for the selected-comment predicate allowed PostgreSQL to
start from the one unpresented run (0.091 ms).

Generated migration `0400_futuristic_earthquake.sql` creates the partial index
concurrently, adds idempotent expression statistics, and analyzes the table.
The existing top-level migration runner owns concurrent-index replay/repair.
Snapshot retention contains exactly 0396–0400. Fresh migration, journal replay,
direct SQL replay, ready/valid index flags, and statistics presence passed.

Rechecking the actual migration's objects (after removing experimental objects)
used the driver's real global, company, and issue-scoped queries. Global discovery
found one candidate in 0.078 ms; history-only company/issue scopes returned none
in 0.024/0.019 ms without sequential scans. These are query-plan fixtures, not
latency or fleet-sleep claims. Large unselected ineligible histories and repeated
configuration signals still need separate qualification.

Evidence: `/tmp/sleep48-query.json`, `/tmp/sleep48-query-plan.sql`,
`/tmp/sleep48-query-plan.log`, `/tmp/sleep48-query-statistics.log`,
`/tmp/sleep48-production-plan.log`, `/tmp/sleep48-migration-verify.log`.

## Current verification and preserved failures

The expanded final selection passed 45 cases in two files: 33 existing accepted-
response cases, ten new worker/owner cases, and two authority lifecycle cases.
The 1,551 unselected chat cases are not claimed passed. Server typecheck passed.
The worker cases establish startup recovery, selected-history quiet over former
poll periods, real chat-service authority restoration, outer commit/rollback,
first notification during drain, SQL-free drain waiting, resume, saved future
retry, pending/failed status-effect ordering, and an elapsed-deadline race.

The elapsed-deadline test failed before its fix: the worker returned null even
though the locked owner had deferred the response. It now retains the due entry
and the next attempt publishes exactly once. Log:
`/tmp/sleep48-elapsed-deadline-before.log`.

Earlier worker runs exposed the hint serialization defect (nine fixture failures),
then two test-observation mistakes. A timer created before fake-time installation
was not advanced by the fake clock; the test now installs time before registration.
A null next deadline can occur while a sweep is in flight; commit assertions now
wait for the persisted publication, zero tracked activity, and no next deadline
jointly. The original logs remain `/tmp/sleep48-worker-tests.log`,
`/tmp/sleep48-worker-tests-v2.log`, `/tmp/sleep48-drain-isolated.log`, and
`/tmp/sleep48-worker-tests-v3.log`. The corrected initial selection passed eleven
cases in `/tmp/sleep48-worker-tests-v4.log`; the final expanded result is
`/tmp/sleep48-acceptance-v2.log` with server types in
`/tmp/sleep48-acceptance-typecheck-v2.log`.

No slice 48 PR, full workspace acceptance, remote CI/review, or provider sleep
qualification is claimed by these local results. The earlier stack gates and
remaining recurring-server duties are unchanged.
