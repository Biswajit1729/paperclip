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
