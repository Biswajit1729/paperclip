# External conversation settlement from committed work

This is slice 56 of the recurring server work stack. Its base is slice 55,
`13f37eef91edce7ee424ec5424c66fc0e6154f4e`. The parent PR is
[#17758](https://github.com/paperclipai/paperclip/pull/17758).

## Obligation and owner

An answered external conversation must move from active to waiting when its
published response is complete and no supported work remains. The existing owner
is `slack-conversation-lifecycle.ts`. Despite the compatibility name, it supports
Slack and Speko-owned tasks. This change does not add other providers or change
which conversations may settle.

Existing conversation, issue, run, publication, wake, interaction, approval,
dependency, and session rows remain authoritative. There is no new table or
migration. A notification means that a predicate may have changed; it does not
establish completion or hold an in-memory queue count as truth.

The owner now shares one readiness reader between discovery and locked execution.
Execution keeps the endpoint-before-issue lock order and rechecks all evidence:
current binding and assignee; visible external task; successful latest run;
authorized published response to the selected wake; committed native result where
required; no newer user input; and no outstanding execution, monitor, goal,
interaction, approval, dependency, wake, or publication. A waiting binding exits
without a redundant update. Provider policy stays in this owner.

## Trigger and recovery

`external-conversation-settlement-work.ts` registers with the existing delivery
coordinator and shared deadline scheduler. Startup and resume reconstruct work
from rows. Narrow issue-ID pages contain at most 100 candidates. A candidate is
not an obligation: discovery applies the full readiness predicate before adding
it to the worker. Execution batches contain at most 25 entries. The worker
rechecks readiness after settlement. Only still-ready work gets a 30-second
retry. Errors use the existing bounded failure backoff.

Empty, configured-but-ineligible, and retained waiting history leave this worker
without a deadline or recurring SQL. Its discovery cost is not zero: startup and
committed changes can inspect multiple rows and make several readiness queries
per candidate. Issue-scoped hints narrow that work. Run-only or company-wide
changes can conservatively invalidate a company. The shared coordinator coalesces
these hints. This is a process-local supported-writer contract, not independent
SQL or multiple-replica change capture.

The heartbeat facade preserves restore and worktree suppression and task drain.
Startup registers only when the heartbeat scheduler is enabled, and also gates
stopped scheduling and warm standby. The existing settings writer wakes the
worker when worktree execution is enabled. Drain retains an unserved wake;
shutdown joins active work; restart reconstructs any remaining obligation.

## Producer audit

| Source or boundary | Relevant transition and notification |
| --- | --- |
| Chat admission, endpoint configuration, resource reopening | Existing chat-run milestones cover new/reactivated bindings and current authority. Repeated inventory and setup metadata are not new settlement work. |
| Run lifecycle, committed native projection and finalization | Existing milestone/finalization fanout covers run completion and committed-result proof. Live finalization can still settle directly. |
| Publication resolution, delivery and cancellation | Scoped publication changes reach milestones. Payload preparation and transport leases alone do not authorize settlement. Both run-first and publication-first completion orders are tested. |
| Issue update, release and deletion | Status, assignment, execution, monitor, visibility, origin and dependency changes signal before the write. Completion/reopening of a blocker and issue deletion invalidate dependents through company scope. |
| Approval links, interaction completion and connection intents | Shared review-state notification now includes external settlement. Pending interaction insertion blocks work; partial verdicts remain pending. Complete verdicts use the shared notification. |
| Comment deletion and tombstoning | Signal before removing newer input. Admission and publication own ordinary message/response changes. |
| Wake queue release, cancellation and retirement | Execution release signals in the adapter transaction. Inbound wake-notice fanout covers company archive, tree cancellation, budget cancellation and rejected chat retry. Wake-status updates retain cancellation fencing. Native status-wake retirement owns an explicit transaction. |
| Task retry receipts | Superseded retry writers already receive their caller transaction. Chat-receipt reconciliation now opens a transaction only for status-changing writes; diagnostic timestamp updates remain ordinary writes. |
| Goal/session changes | Goal status changes and deletion of unfinished goal sessions signal. Agent configuration/deletion and harness-backup session expiry cover alternate deletion paths. Agent Chat reset is outside this owner's applicability; company deletion removes the candidates. |
| Monitor consumption | The monitor owner signals its terminal clear in the transaction. The handoff ordering and restart receipt rules below prevent premature settlement. |

Additional classifications: stopped-comment recovery only updates wait diagnostics
before re-entering ordinary queue admission. Retry coalescing changes counters;
retry run creation and promotion retain a nonterminal run blocker. Dot and Muse
follow-up consumption requires a current running owned assignment, whose eventual
terminal writer supplies the wake. Preserved-result recovery signals finalization
and remains blocked until commit. Native cancellation removes issue eligibility.
Company portability creates fresh issue IDs, does not import live chat/run bindings,
and intentionally imports monitors unarmed; its relation inserts do not unblock
an existing eligible conversation.

## Monitor handoff correction

The old exhausted-monitor path cleared its schedule before it queued recovery.
This exposed an interval in which the conversation looked complete. A failed or
deferred admission also left no monitor to retry. The regression tests reproduce
all three cases through the real monitor owner and database.

For owner recovery, the existing schedule remains until queue admission succeeds.
The ordinary queue receives its existing monitor claim guard, including the saved
schedule and claim timestamp. Deferred or failed admission releases that claim
but retains the obligation. A successful clear uses the same compare-and-set and
monitor-only JSON patch, preserving a replacement monitor and review state.

A saved idempotency key alone does not deduplicate this queue path. Before another
admission, recovery reads the exact saved receipt and its admitted run, with
company, agent, issue, reason and recovery-key binding. This handles restart after
admission but before monitor consumption. A skipped receipt is not acceptance.
Competing admissions still pass the queue's current monitor-claim guard.

Board escalation is different: its existing comment remains unfinished input.
The comment, escalation audit and monitor clear now commit together, with live
audit publication after commit. Settlement cannot observe the clear without the
comment. The separate recovery-child policy keeps its existing child-task path;
this PR does not redesign child creation or claim that it is atomic with clearing
the parent monitor. Terminal client-error clears also notify in their transaction.

## Periodic delegation and remaining work

The periodic native reconciliation call passes
`skipExternalConversationSettlement`; both finalizer branches honor it. Resource
cleanup and Muse callbacks remain enabled. Direct, live and manual finalizer calls
retain default settlement behavior.

Generic stranded-task recovery used to settle before deciding whether to dispatch
another run. Its delegated path must preserve that order. It checks shared pending
readiness and leaves an eligible answered conversation to this worker. Default
manual recovery retains inline settlement. This read-only guard is still executed
by the existing generic recovery scan: that scan is a separate remaining migration.
This PR does not claim that the whole heartbeat loop or server is idle.

The internal scheduler is not an external wake certificate. This PR does not
relax Cloud sleep safety, change durable alarm coverage, prove DB suspension, or
measure host sleep or fleet savings. Other stack duties and master integration
remain in the central inventory.

## Verification and failure record

Local coverage includes existing owner policy, first real producers, outer commit
and rollback, configured-but-ineligible and retained-history quiet, both response
completion orders, restore/worktree gates, drain/failure/restart, joined shutdown,
independent goal/comment/approval/dependency/wake releases, monitor handoff and
receipt reconstruction, pagination beyond 100 ineligible candidates, generic
recovery ordering, and preserved native resource settlement. Owner and publication
paths use PostgreSQL. Monitor handoff delay/failure tests control admission;
separate existing monitor tests exercise the actual heartbeat queue. They are not
proof of a successful external provider run. Native resource tests observe the
real reconciler with its original settlement function, not a replacement policy.

Material failures were retained during development:

- Initial producer regressions exposed missing execution-release and approval
  wakes. A later flush assertion was too early; it now waits for active work too.
- The readiness reader originally required a root DB type; it now accepts its
  actual select/execute capability, including transactions.
- The real retry-receipt test exposed a root notification without a transaction.
  Work signals require transaction ownership; they do not wrap autocommit writes.
- Startup expected options needed the new delegation flag. A generic recovery
  test needed its existing created-at cutoff to exclude retained test fixtures.
- Monitor regressions exposed premature readiness and lost deferred/failed
  handoffs. Restart testing then exposed the lack of automatic key deduplication.
- Review caught a restart edge case: the monitor limit reason can change from
  attempts exhausted to timeout after admission but before clear. Two regression
  cases failed before the fix. Recovery now uses the monitor schedule as identity
  and recognizes both legacy reason-bearing receipt keys, retaining company,
  assignee, issue, and admitted-run binding. A different schedule is not reused.
- CI shard 1 exposed a stale cancellation fault injection: spying on root
  `db.update` no longer fails writes owned by transactions. The failure reproduced
  locally. The test now injects a PostgreSQL failure at the target run's cancelled
  transition and checks that the process stops even though the row stays running.
- The first CI serialized shard 5 run timed out on the first agent live-run route
  history test (15 seconds). Its unchanged 92-test suite passed locally; that does
  not establish a root cause. Fresh CI after the recovery fix remains required.
- A board escalation expectation incorrectly treated its new comment as finished.
  The test now preserves the existing policy; comment and clear are atomic.
- Additional verification caught a nullable guard type, an extra query parenthesis,
  and a pagination fixture missing its required external label. These were fixed
  before acceptance. The latter failed during fixture insertion, not execution.
- Test DB setup first used a missing root TypeScript executable; the database
  package's installed runtime creates and migrates the isolated test databases.

The PR verification section records final commands and results. The host has
already exhausted embedded PostgreSQL semaphore capacity during earlier full-suite
runs. The specifically approved 11 orphan sets were removed once; this slice uses
validated dedicated external test database overrides, not more shared-OS cleanup.
Fresh CI must run the complete suite. No local full-suite success is claimed.
