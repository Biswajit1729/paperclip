# Native accepted-response presentation recovery

Status: source and baseline audit; no worker migration yet.
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
