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
