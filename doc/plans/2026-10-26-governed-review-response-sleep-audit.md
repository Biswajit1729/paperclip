# Governed-review response recovery: sleep migration audit

Status: owner and producer audit only; no worker or periodic removal implemented.
Inspected parent: `c4beddad1e` (slice 48, draft PR #17696).

## One reason for work

A native run can commit a successful response while the task remains in review
under an earlier server-created completion-review gate. Its saved response and
selected files still need one authorized comment/publication. Current periodic
native finalization reconciliation repairs that presentation even when no source
changes. This slice owns only that owed presentation, not review resolution,
status reassessment, provider execution, or pending status-effect delivery.

The durable sources already exist: native_run_finalizations, native_run_results,
work_assessments, status_decisions, heartbeat_runs, and the original
issue_thread_interactions review gate. No new queue table is needed.

## Existing owner and contracts

- `native-chat-review-presentation.ts` owns proof preparation, restoration,
  current authorization, contention handling, and the materialized receipt.
- `native-run-finalizer.ts` owns `materializeCommittedReviewResponse` and
  `repairCommittedNativeReviewResponse`. The former currently catches operational
  failures and returns no outcome. A scheduled consumer needs a narrow raw
  outcome/error contract; retain current behavior for existing foreground callers.
- `issues.ts` addComment owns the issue transaction, nonblocking reauthorization,
  selected-file attachment, comment deduplication, and publication intent.
  Recovery must continue through it, never insert a parallel comment/outbox path.
- `native-finalization-reconciler.ts` repairs governed presentation before the
  superseded-status early return. A later task decision must not erase an older,
  still-authorized response. The already-committed branch of `finalizeNativeRun`
  also restores/materializes it; periodic migration must address both entrances.
- Fresh finalization still presents immediately. Explicit/startup recovery retains
  its behavior unless the scheduler owns that call explicitly.

Receipt semantics: `hasMaterializedNativeReviewResponse` recognizes an agent
comment for the exact company/task/run with the presentation authorization reason
and matching current decision proof. Soft-deleted comments remain receipts.
Restoration already avoids rewriting identical metadata or signaling another
wake. Preserve those properties.

## Current authority that must remain in the owner

Authorization checks committed coordinator/result/assessment/decision bindings;
applied governed_response_waiting decision; successful run without held native
ownership; in_review task assigned to the same agent; unchanged response context;
agent not paused/terminated/pending approval; and current external destination
and principal authority. Runtime health status error alone does not revoke an
already completed response.

The proof requires an accepted yielded response_wake result and matching server
assessment, successful terminal evidence, no attention requests, and a nonempty
summary/idempotency key. Its prior pending review gate must be server-created,
older than this run, from another source run, correctly bound to the native
completion-review revision and delivered bind_reviewer effect. The hashes bind
semantic result, gate policy, context, and summary. Competing pending interactions,
pending/revision_requested linked approvals, or a run-owned provider prompt can
prevent presentation. These checks are publication authority, not scheduler policy.

## Planned worker boundary

Use the existing scoped deadline helper and delivery coordinator. Discover only
structurally eligible committed governed responses without a materialized receipt;
revalidate exact durable state and current authorization through the owner before
presentation. Failed I/O/contention retains retry ownership. Settled or currently
unauthorized rows become dormant until a relevant source change. Preserve saved
coordinator retry deadlines, active claims, drain/resume, and shutdown.

Before implementation, establish the scheduled owner guard under its existing
lock: a previously discovered row must not bypass a newly acquired finalization
claim or a moved-later retry deadline. Keep issue/coordinator/run lock ordering
compatible with addComment's nonblocking recheck. Do not conflate authorization
denial with operational errors. Preserve deleted receipts and idempotent replay.

Measure discovery with selected history and a large unpresented backlog. Slice
48 showed why per-page limits do not make a company-wide reconstruction cheap.
Normal run writes must retain task/run scope; broad reloads are reserved for
changes whose authority can actually affect the broader scope.

## Producer audit still required before retiring the backstop

Already identified reusable boundaries:

- Finalization/result/decision/effect settlement: native-finalization-notifications
  and the existing milestone boundary. Existing review proof restoration signals
  only a real metadata change.
- Run status, ownership release, task status/assignment, conversation lineage,
  endpoint/principal configuration, publication outcomes, and agent resume:
  inspect existing milestone/finalization producers and extend one owning boundary
  per dependency. Do not scatter caller recovery wrappers.
- Publication changes already use notifyChatPublicationWork with task scope only
  when prompt authority or delivery outcome changes; transport lease bookkeeping
  intentionally does not invalidate presentation.

Concrete gaps found in this audit:

- `writeApprovalChange` currently signals approval retention and queue seeding,
  not governed-response recovery. Resolving or unlinking a competing linked
  approval can make an existing proof eligible. Audit approve/reject/revise,
  resubmit, link/unlink, bulk linking, retention, and alternative writers. Prefer
  an approval identity/task scope over company-wide reconstruction.
- The proof rejects *any* competing pending interaction, while current milestone
  notifications often apply only to questions and confirmations. Resolving a
  connection intent or another kind may restore eligibility. Inventory common
  interaction mutation owners and direct cleanup/recovery writers before choosing
  a notification hook; do not assume confirmation coverage is sufficient.
- Run-owned prompt publication states can retain or release the response slot.
  Confirm every relevant publication transition reaches the existing task-scoped
  publication boundary.

This is not a completed producer audit. Other supported writers and late authority
restoration must be traced before removing periodic governed-review repair.

## Acceptance requirements

Reuse the genuine native review fixture in chat-channels.integration.test.ts,
which creates the server review through native finalization and records selected
files. Establish a baseline before editing the owner. Cover:

- Startup reconstructs a missing response and creates one comment/publication with
  the selected files; duplicate/concurrent recovery is idempotent.
- Existing and soft-deleted receipts produce no recurring SQL; unchanged proof
  restoration does not repeatedly rewrite or wake itself.
- Task-wide lineage, late producer commits, and outer transaction rollback/commit
  retain their existing authority boundaries.
- Actual approval resolution/unlink and competing-interaction settlement reactivate
  dormant work without restart. Unrelated run/task mutations do not reload it.
- Agent/principal/endpoint revocation or changed gate blocks publication; supported
  restoration reactivates it. Transport reauthorization still blocks stale files.
- Saved future deadlines, moved deadlines, claims, real lock contention, operational
  retry, first wake during drain, failure before drain, resume, and shutdown retain
  concrete recovery obligations without passive SQL.
- Both periodic entrances defer only this duty; fresh finalization and other
  recovery reasons retain their behavior.

No deployment, database suspension, Cloud alarm coverage, or cost-savings claim
follows from this migration. The full original stack remains in scope.
