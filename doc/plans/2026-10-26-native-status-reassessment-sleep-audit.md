# Native status reassessment sleep audit

Parent: governed-review response recovery, draft #17702 at `be6ca6151b`.
This audit starts the next reason in the recurring-server migration stack.
Parent CI remains in progress; Greptile is 5/5 with no unresolved threads.

## Obligation and ownership

After a native result is assessed, changed durable facts can require a new status
assessment and decision. The current native-finalization reconciler discovers
that change by revisiting committed runs, including its rotating settled-history
page. Response publication and pending-effect delivery have separate owners in
the preceding slices. Workspace/result settlement and retained session cleanup
remain separate duties and must not disappear with this migration.

The existing reassessment block has three activation conditions:

- A work product was created or updated after the selected assessment. The
  classifier must actually establish newly satisfied criteria and verification
  before this condition changes task disposition.
- The authoritative task status/version differs from the previous assessment,
  after accounting for the selected decision's projected version and preserve
  semantics. A superseding decision can make the old run ineligible.
- The selected automatic review has been retired. Reassessment then checks the
  latest contract, current task/run, pending child completion, dependencies,
  governance and any later workspace-finalization barrier.

These are triggers for the same append-only status reassessment operation.
Keep classification and status arbitration with native runtime. Keep task locks,
version comparison, current authority and effect creation in the status-decision
committer. Do not put evidence parsing or policy branches in startup or the shared
scheduler. Do not use the combined reconciler as a worker callback: that would
also run unrelated response, workspace and retention work.

## Existing facts and guards

The coordinator binds run, task, selected result, assessment and decision. The
assessment retains prior task status/version/decision and its input digest. The
result and contract are selected by matching company/task/run identities. The
committer appends the new decision and guards concurrent task changes. A
NativeStatusRaceError currently defers to later reconciliation; the new worker
must retain or receive the corresponding wake instead of silently losing it.

The outer candidate scan respects next_attempt_at and live finalization leases.
The extracted owner must recheck these under its transaction/claim boundary;
a stale scheduler entry cannot bypass a newly acquired lease or delayed retry.
The worker must distinguish dormant changed evidence that is still insufficient
from retryable I/O or contention. Existing durable rows remain truth; no new queue
table is justified by this timer migration.

## Producer audit to complete

Work-product writers found in current source:

- work-products.ts: create, update, primary replacement, batch import and removal.
  Current notifications cover pull-request retention/approval work only.
- issues.ts: attachment work-product insertion.
- routes/issues.ts: trusted-source promotion changes an existing product and
  inserts its promoted product inside an owned transaction.
- native-runtime/chat-attachment-reuse.ts and native-runner-file-handoff.ts:
  direct metadata/title updates on existing products.

The classifier reads more than work products: case handoffs, accepted/rejected
control-plane run events, linked approvals, resolved interactions and attachments.
Determine which mutations activate existing reassessment behavior and preserve
that contract. Do not assume that work-product notifications cover all evidence
or introduce inferred completion merely because a source row changed.

Also audit task status/version producers; decision/effect settlement; automatic
review retirement; latest-contract changes; workspace barrier settlement; child
completion; dependency/blocker changes; agent/task authority and process claims.
Use the existing mutation/transaction owners. Reuse task/run-scoped notification
boundaries where their semantics match. Broad configuration changes may justify
broader scopes; ordinary writes must not reload every company run.

## Acceptance before periodic removal

- Extract and exercise the actual reassessment owner without invoking other
  native recovery duties. Preserve fresh finalization and explicit recovery.
- Reproduce each missing producer wake before wiring it. Cover alternate writers,
  nested outer commit/rollback and relevant uncertainty settlement.
- Verify superseding decisions, changed versions, current contract, ownership,
  governance, pending children and workspace barriers with real DB state.
- Prove no duplicate decisions/effects under competing recovery and producer
  changes during a sweep. A rejected or no-longer-current assessment cannot
  authorize completion.
- Prove no recurring SQL for configured-idle and retained settled history,
  including changed but insufficient evidence. Verify genuine deadlines,
  failures, startup/resume, drain and shutdown.
- Measure selected-history and outstanding-backlog discovery before wiring it.
  Bound individual queries and support interruption; disclose total reconstruction
  cost and retain exact scope on ordinary changes.
- Register through existing maintenance lifecycle, disable only this periodic
  duty, run relevant consumers and required checks, then obtain latest-head CI
  and review acceptance on its own stacked PR.

This is an audit, not an implemented migration. No polling entrance is removed
by this document. No Cloud alarm coverage or host sleep eligibility changes.


## Owner extraction checkpoint

The status-authority corpus passes all 94 cases before extraction on a fresh
PostgreSQL database. Reassessment now lives in native-status-reassessment.ts;
its pure arbitration policy lives in native-reconciliation-status.ts. Existing
imports through the reconciler remain compatible. The combined reconciler
delegates to the extracted owner and retains all periodic behavior for now.
It avoids the legacy review-response lookup when that repair is disabled.

The extracted owner distinguishes unchanged, superseded, deferred and committed
outcomes. Operational errors still propagate; the existing status-race behavior
remains deferred. All 94 status-authority cases and 187 governed-response cases
pass after extraction, as does server typecheck. Evidence: /tmp/sleep50-baseline.log,
/tmp/sleep50-extract-corpus.log, /tmp/sleep50-extract-responses.log and
/tmp/sleep50-extract-types.log. Each corpus run uses a fresh database because its
company prefixes persist beyond the suite.

The scheduler entry point is not ready yet. The status committer locks the
coordinator before the task and publishes activity after its own transaction.
Wrapping it in a new outer transaction would publish before that outer commit;
do not do that. Add any scheduled source/lease/deadline guard at the committer's
existing transaction boundary, and exercise competing source/claim changes there.
The new worker must reload source facts and preserve deferred races/retries; it
must not treat an extracted snapshot-based helper as fresh scheduling authority.
Producer notifications, discovery cost, lifecycle tests and periodic removal
remain outstanding. No slice 50 PR has been published.

## Scheduled commit guard

Scheduled reassessment now opts into a source guard inside the existing status
committer transaction. After coordinator/task locking it compares the selected
phase/result/assessment/decision, respects a future retry and live or unknown
lease, locks and checks native run ownership, and defers while the old decision
has pending or failed effects. Explicit callers retain their existing behavior.
The lock order remains coordinator, task, then run. Publications still occur only
after the committer's transaction commits.

The first seven-case reproduction had five behavioral failures and two invalid
fixtures: clearing the assessment/result without clearing dependent references
violated schema constraints before reaching the committer. Corrected fixtures
plus pending-effect and ownership races failed all nine before the guard: eight
incorrect commits and one attempted commit rejected by the result constraint.
After the guard, all 103 status-authority corpus cases and server typecheck pass.
Every deferred case preserves the competing state and successfully commits once
that state is released. Logs: /tmp/sleep50-guard-before.log,
/tmp/sleep50-guard-before2.log, /tmp/sleep50-guard-after.log,
/tmp/sleep50-guard-types.log; statuses are saved beside the test logs.

This is not worker acceptance. Candidate selection, dormant-versus-retry outcome
handling, producer coverage, lifecycle/cost tests and periodic removal remain.
No slice 50 PR has been published and no additional polling has been removed.

## Scoped worker and first producer

A local, not-yet-registered worker now discovers the three existing activation
conditions with company/task/run/agent scopes and 100-row keyset pages. Candidate
SQL excludes superseded decisions, held native ownership, unknown finalization
leases and old pending effects. It is discovery, not mutation authority: check
reloads the source and the committer still applies the locked guard. Future retry
and live lease deadlines retain their maximum. A commit race requests a retry;
unchanged evidence or a dormant review prerequisite does not keep recurring work
scheduled. The shared scoped-deadline helper owns coalescing, fairness, admission
and retry bookkeeping. No new queue table is added.

Nine initial discovery/owner tests pass for retired reviews, changed evidence,
authoritative task changes, future retries/leases, insufficient evidence,
ownership exclusions and pre-aborted discovery. A tenth regression exposed a
newly saved five-second deadline being pushed out to generic 30-second backoff.
The worker now returns that saved future deadline exactly; backoff applies only
when the source is still immediately eligible after a commit race. The complete
113-case status corpus and server types pass. Evidence:
/tmp/sleep50-worker-first.log, /tmp/sleep50-deadline-before.log,
/tmp/sleep50-worker-after.log and /tmp/sleep50-worker-after-types.log.

An isolated lifecycle test reproduced a real missed wake: after the worker went
quiet, automatic review retirement left the task in review. Retirement now
signals the exact task/run inside its existing transaction, before changing the
card. The common native-finalization signal also includes reassessment, retaining
its supplied scope. All three lifecycle tests pass: real retirement after idle,
first retirement during drain followed by resume, and a saved future retry across
shutdown/restart without early dispatch. Driver-level SQL capture verifies no SQL
across two former polling minutes after completion or while drain is paused.
The existing governed-response suite passes all 187 cases after the shared
notification change. Logs: /tmp/sleep50-lifecycle-before.log,
/tmp/sleep50-lifecycle-after.log, /tmp/sleep50-lifecycle-types.log and
/tmp/sleep50-worker-responses.log.

Initial read-only query measurement reused slice 49's 10,000 cloned history rows.
Those copies share a task and their decisions are superseded for reassessment;
this is not proof of 10,000 independently selected current assessments or an
outstanding reassessment backlog. Startup returned 62 candidates from other
retained history in one query (305 ms cold wall time; warm EXPLAIN execution about
47 ms). Company/task scopes returned none in 34/20 ms, exact run in 2.6 ms.
Plans and logs: /tmp/sleep50-query-{startup,company,issue,run}.plan and
/tmp/sleep50-query-plan.log. Selected-current history, backlog cost and cancellation
between pages still need measurement before enabling the worker.

Remaining work is substantial: work-product and alternate writers, task changes,
classifier inputs while a retired review is dormant, current-contract/workspace/
governance and ownership transitions, further transaction/lifecycle cases,
startup registration and periodic removal. Existing retirement prerequisite reads
precede the committer; audit their serialization with producer owners before
claiming concurrent authority coverage. In particular, completion-contract
creation uses its own advisory lock rather than the status committer's issue
lock. This checkpoint is not a claim that every business-fact race is covered.
The existing periodic reassessment path remains active and slice 50 has no PR.

Final current-source local rerun passes 116 tests across the status corpus and
isolated worker lifecycle files (/tmp/sleep50-final-local.log). Together with the
187 governed-response cases this is 303 distinct passing cases, not whole-workspace
or remote PR acceptance. The last server typecheck also passes.

## Work-product and task producer checkpoint

Six real writer regressions failed before notifications: artifact update, create,
primary replacement, import, attachment creation, and nested transaction commit.
Their existing write transactions now signal task-scoped reassessment before the
mutation. Import coalesces its scopes per task. Updates signal both old and new
scope if their supported patch moves a product. Removal also signals its old task.
Attachment creation signals before asset/attachment/product writes, including
attachment evidence without a registered run. Native file handoff and attachment
reuse call that service inside their tool-authority transaction; their subsequent
same-transaction title/metadata edits share its outer settlement. Those fields
are not classifier evidence, so no second recovery wrapper was added there.
The low-trust promotion route signals inside its own atomic source/product write.
A real HTTP promotion now also proves completion through the registered worker.

Three further regressions failed for task status changes, assignment changes,
and reasserting blocked state. The task mutation owner now signals relevant
status/version, execution, assignment and blocker writes. The regression checks
that the new assessment reflects the task's actual version and does not overwrite
the board's status. The nested work-product case verifies no decision before the
outer commit, no decision after rollback, then successful reassessment after a
later commit. All paths return to driver-observed SQL quiet.

Final owner lifecycle tests pass all 13 cases, including the real promotion route,
and server types pass. Evidence: /tmp/sleep50-products-before.log (six failures),
/tmp/sleep50-products-after.log (nine passes), /tmp/sleep50-tasks-before.log
(three failures), /tmp/sleep50-tasks-after.log (12 passes), and
/tmp/sleep50-products-final.log (13 passes) plus its final typecheck log.

Affected consumers pass 79 cases across five files: work products, attachment
routes, low-trust HTTP routes, attachment reuse, and runner task attachments.
The first combined run passed 53 but failed two suites during embedded PostgreSQL
bootstrap, leaving 26 cases unrun. Those suites now accept validated dedicated
external test database URLs and explicitly close their clients. Their 26 cases
then pass on separate PostgreSQL databases. Low-trust route tests use their own
dedicated database because teardown deletes shared tables. Preserve the initial
failure in /tmp/sleep50-consumers.log and the successful rerun in
/tmp/sleep50-attachment-consumers-after.log. This is 79 passing consumer cases
across the two runs, not a green initial run or a whole-workspace result.

Master was refreshed and remains 1fbbef45a8. The stack has not been reconciled
onto it yet. The worker remains unregistered and periodic reassessment remains.
Remaining producer coverage includes approval/interaction and run-event evidence,
case handoffs, native ownership and run-status transitions, completion-contract
changes and workspace-finalization barriers. Workspace recovery writes a separate
workspace_finalize success receipt; snapshot-only rows are not that barrier.
Continue the concurrent authority audit, independent-current-history/backlog cost,
lifecycle/failure evidence, startup/periodic wiring and full PR acceptance.


## Approval evidence producer checkpoint

Approval references are classified from the current approval status and its
company/task link. A product can have changed after the selected assessment
while that approval is still pending or unlinked. The worker correctly goes
quiet with insufficient evidence, but must inspect that same candidate when
an approval is resolved or linked later. This does not add a new reassessment
condition: the existing changed-product predicate must still be satisfied.

The existing `notifyApprovalWork` boundary now sends the same task scopes to
native reassessment as to governed review responses, before the approval/link
write. It already resolves linked task IDs for status changes and accepts
explicit task scopes for link/unlink and bulk link. No new transaction wrapper,
company scan, table, or provider policy was introduced. Unlinked approval creation
has no task to reassess; the subsequent link owns activation. The production
writer audit also found budget approval resolution and gateway formal-approval
linking use this boundary with the appropriate scope. Company deletion removes
the records rather than creating a surviving reassessment obligation.

Four real PostgreSQL regressions failed before the notification: approval
resolution, single link, bulk link, and an approval inside a caller-owned outer
transaction. With the notification they pass, including no premature decision
before outer commit, no decision after rollback, and driver-observed SQL quiet
before activation and after settlement. The full lifecycle file now passes 17
cases. Existing approval service and route-idempotency consumers pass another
19 cases (36 total in the combined run). Server typecheck passes.

Evidence: `/tmp/sleep50-approval-before.log` and `.status` (four failures),
`/tmp/sleep50-approval-after.log` and `.status` (36 passes), and
`/tmp/sleep50-approval-types.log` and `.status` (pass). The before and after runs
used separate freshly migrated PostgreSQL test databases. This is local producer
acceptance, not full slice or remote PR acceptance.

Interaction evidence remains next: confirmation/question paths signal through
chat milestones, while other interaction outcomes signal governed review response
directly. Their common activation boundary must cover reassessment without teaching
the scheduler interaction policy or coupling it to a review-specific worker.
Several interaction mutations also lack either signal and require fact-level
audit before the old polling path can be removed. Run evidence, ownership,
completion contracts, workspace barriers, concurrent authority, discovery cost,
and startup registration remain outstanding as listed above.


## Interaction evidence producer checkpoint

The interaction classifier reads status and result outcome, not just terminal
status. Real response regressions reproduced missed wakes for confirmation,
checkbox confirmation, question answers, completed item verdicts, and partial
item verdicts. The first checkbox fixture used `items`/`checkedItemIds` rather
than the real `options`/`selectedOptionIds` contract; after correcting it, that
case also reproduced the missed wake before production changes.

`notifyNativeReviewState` is a small fan-out boundary for the two consumers of
changed review facts: governed response recovery and status reassessment. It
preserves their existing task/run/company scopes and delegates all discovery,
classification and authority to the owning workers. Approval, interaction,
chat-milestone, satisfied-connection and OAuth completion/rejection producers
reuse that boundary in their existing transactions. It does not add database
queries or a transaction wrapper at these call sites; the existing shared intent
registration still owns its normal transaction-tracking cost.

Confirmation/question paths already use the milestone boundary; other interaction
outcomes use the new shared review-state boundary directly. Connection-intent
creation/supersession signals before insert in its existing transaction. Generic
non-question/non-confirmation creation signals reassessment before insert.
Partial item verdicts need reassessment even though governed response recovery
still waits for completion: their persisted `outcome: resolved` is already
accepted by the evidence classifier. This migration preserves that existing
classification policy rather than silently changing it while removing polling.

Direct-writer audit: secret proposals, tool-action review, gateway outcome
projection, conversation promotion, and obsolete-policy review retirement already
signal milestones. Automatic completion retirement and native status commits
already signal reassessment/finalization. Confirmation comment enrichment shares
its outer transaction with ordinary service resolution. Ownership-change connection
expiry is called only through issueService's owned transaction. OAuth callback
acceptance/rejection and satisfied-connection retirement now use the shared helper.
Payload-only connection-phase updates, consumed-action stamps, retry annotations
on already accepted confirmations, and dismissal attention fields do not change
the classifier's status/outcome facts. Native response materialization uses the
existing finalization boundary. Authorization-start's reopening/creation path
and native superseded-review caller ownership still need final audit; do not infer
complete producer coverage from this checkpoint.

All 22 reassessment lifecycle cases pass, with driver-observed SQL quiet before
and after real response activation. Server typecheck passes. Existing interaction
service, tool-access/OAuth, and satisfied-connection suites pass 625 cases across
three separate freshly migrated PostgreSQL databases. Evidence:
`/tmp/sleep50-interaction-before.log` (four missed-wake failures and one invalid
fixture), `/tmp/sleep50-interaction-checkbox-before.log` (corrected missed-wake
failure), `/tmp/sleep50-interaction-after.log` and `.status` (22 passes),
`/tmp/sleep50-interaction-types.log` and `.status` (pass), and
`/tmp/sleep50-interaction-consumers.log` and `.status` (625 passes).

The milestone fan-out also reaches existing run-status producers, but that is not
proof that all native ownership/run-event writers are covered. Workspace barrier
producers, remaining run/contract/case-handoff facts, concurrent authority guards,
current-history/backlog query cost, startup registration and remote PR acceptance
remain incomplete. Periodic reassessment is deliberately still enabled.


## Workspace finalization barrier producer checkpoint

The retired-review path defers when the latest `workspace_finalize` record has
not succeeded. It deliberately leaves no recovery timer for an in-progress or
failed barrier, so the actual producer must reactivate it when that fact changes.
Two PostgreSQL regressions reproduced missing reactivation through the normal
workspace-operation recorder: failure followed by a later successful export,
and a successful write inside a caller-owned transaction.

The recorder now routes its initial state insert, successful settlement and failed
settlement through one local state-write boundary. Only `workspace_finalize`
operations with a run binding register reassessment intent; other phases retain
their existing writes. The added transaction contains only the state write and
notification. Log I/O, the provider callback, and progress/lease updates remain
outside it. Existing caller-owned transactions retain outer commit semantics.
The success test keeps the real callback suspended while the worker goes SQL
quiet, then completes it and observes task completion. The transaction test
proves no decision before outer commit, no decision after rollback, and successful
activation after a later commit.

The separate retained-workspace recovery success receipt now signals in its
existing transaction before the receipt insert and generation update. A test
runs real retained recovery with temporary files and verifies that the delivered
notification's reader observes a committed `workspace_finalize: succeeded` row.
The historical unsafe-export path already had the common finalization signal;
it now registers that intent before its barrier insert rather than afterward.
Snapshot and copy-only records use other phases and do not satisfy this barrier.
Runtime-control orphan reconciliation operates on action-stamped controls; normal
native workspace finalization uses its own ownership metadata instead.

All 24 worker lifecycle cases pass, and server typecheck passes. The workspace
operation reconciliation, retained workspace recovery and native status arbiter
corpus suites pass 170 cases across three fresh PostgreSQL databases. The two
workspace suites now accept dedicated, validated external test database URLs;
restart tests reuse that URL, and clients close before fixture teardown. This
uses the known-working local PostgreSQL installation because embedded bootstrap
failed in earlier acceptance attempts; no product database is used.

Evidence: `/tmp/sleep50-workspace-before.log` and `.status` (two failures),
`/tmp/sleep50-workspace-after.log` and `.status` (24 passes),
`/tmp/sleep50-workspace-consumers.log` and `.status` (170 passes), and
`/tmp/sleep50-workspace-final-types.log` and `.status` (pass). All launched
commands at this checkpoint reached terminal status. These are local checks,
not remote PR acceptance or evidence of host suspension.

Next: finish run-event/case-handoff, completion-contract, ownership and remaining
interaction producer audit; then verify commit-time business authority, discovery
cost/backlog behavior, lifecycle wiring and remote PR gates. Current scheduled
commit guards fence coordinator/run ownership and source selection, but the
retired-review business-fact checks still run before the commit transaction.
The old periodic reassessment remains enabled until this full slice is ready.


## Authoritative run-event producer checkpoint

Event references may become accepted/rejected only when a persisted PRP event
has `sourceKind: control_plane` and the corresponding evidence verdict. The
classifier now exposes that existing pure verdict interpretation to the append
boundary, including its existing whitespace normalization. The append boundary
registers a run-scoped reassessment signal before the event write for native
runs. It does not look up a task context or scan evidence consumers to append
an event. Non-verdict events retain the ordinary atomic single-statement path;
runner-authored claims do not activate reassessment.

The writer audit found three insertion paths. The native coordinator store accepts
only `sourceKind: runner` and rejects control-plane events, so its append path
cannot produce an authoritative verdict and needs no added signal. Scheduled
retry cancellation inserts ordinary lifecycle diagnostics without PRP evidence.
The shared append path owns the supported control-plane verdict writes. Event
rows are otherwise immutable in production; agent/company deletion owns removal
of their run history rather than producing new evidence for surviving runs.

Four real-append regressions failed before the fix: ordinary append, native-source
append, outer transaction commit, and authoritative evidence after ordinary/runner
logs. The repaired tests observe task completion, outer rollback/commit fencing,
no reassessment signal for ordinary or runner-authored logs, replay idempotency,
and driver-observed SQL quiet. All 28 lifecycle cases and six existing atomic
append cases pass. The atomic tests still prove the one-statement ordinary-log
path and preserve binding/concurrency behavior.

The initial combined run failed three sequencing cases during embedded PostgreSQL
bootstrap, before assertions. They now accept a validated dedicated external test
database URL, clean only their own company fixture between cases, and close both
clients. All three then pass, including concurrent retry receipt deduplication,
concurrent event allocation, and conflicting replay without cursor drift. Final
server typecheck passes. This is 37 distinct passing cases across the runs, not
a successful initial combined run.

Evidence: `/tmp/sleep50-events-before.log` and `.status` (four failures),
`/tmp/sleep50-events-after.log` and `.status` (34 passes, three bootstrap failures),
`/tmp/sleep50-events-sequence.log` and `.status` (three passes), and
`/tmp/sleep50-events-final-types.log` and `.status` (pass). All test handles at
this checkpoint are terminal. Case-handoff creation/cancellation, remaining
contract/ownership/authority producers and the full acceptance tasks listed above
remain outstanding; the old periodic reassessment path is still enabled.
