# Issue monitor deadline migration

Parent: slice 61, PR #17840, `68339f4162f26f5e12df0848d92f2ed62af8841f`.
Fresh remote master: `0cb3fc7db591ba23e21fbbc70042bc44ec7d6f20`.

This slice owns only issue-monitor scheduling. Legacy agent interval policy stays
on the existing heartbeat cadence for its own subsequent slice. Manual combined
`tickTimers` behavior must remain compatible. No Cloud sleep proof is relaxed.

Truth is already in issues: monitorNextCheckAt, monitorWakeRequestedAt, assignee,
status, and execution policy. Native runs and finalization phase suppress a new
monitor while the prior native owner remains active or unfinished. The scheduling
module keeps dispatch authorization, exact-claim CAS, quota recovery, attempt
limits, diagnostics, and monitor consumption. Index wiring selects workers only.

The next deadline must include already-due work left by the 50-item pass and a
claim's five-minute stale threshold (including its strict comparison boundary).
Failed/deferred dispatch keeps concrete due debt with the shared deadline worker's
bounded retry. Empty/history-only state becomes unscheduled. Suppressed work must
reactivate through settings and lifecycle notifications, including after drain.

Producer audit: issue service create/update, native set_task_monitor, native
preserved-monitor decisions, scheduler manual/automatic claim/release/consumption,
issue lifecycle state, company pause/reactivation/budget transitions/deletion, and
native run/finalization changes. Import deliberately leaves monitor deadlines null
until explicitly activated. Existing native projection and issue review-state
notification boundaries already cover their corresponding transition owners.
Signals must precede writes in the committing transaction; filesystem/provider
work must stay outside those transactions. Process-local writer coverage does not
claim support for unrelated SQL writers or another server replica.

Acceptance must measure quiet SQL, first real producer, future and stale-claim
boundaries, capped overdue work, deferred/error retry, manual compatibility,
outer commit/rollback, native settlement reactivation, company pause/resume,
startup/restart, drain/standby, and shutdown. Existing monitor/admission integration
coverage remains required. This audit is a plan, not evidence of completion.

## Implemented boundary

`createHeartbeatScheduling` now exposes `tickIssueMonitors` and
`nextIssueMonitorAt`. It also exposes `tickAgentTimers`. The public `tickTimers`
method still combines both for existing manual callers. `registerScheduledWork`
uses the existing deadline worker for monitors and a separate coordinator topic
for legacy agent ticks. The heartbeat interval only wakes the latter.

The monitor query includes overdue work, including a capped pass's remainder.
Its deadline is the greater of the saved deadline and the claim timestamp plus
five minutes plus one millisecond. The extra millisecond matches the existing
strict stale-claim comparison. A native queued/running/retry owner or unfinished
native finalization excludes the monitor until a state change wakes inspection.

The worker uses the configured heartbeat interval as a minimum retry spacing
while overdue debt remains. The spacing applies to the monitor worker, so new
notifications during that backoff do not start another immediate scan. Future
saved deadlines run directly when no overdue retry is pending. State-change
bursts use the shared worker's one-second coalescing window. No per-monitor
queue, new table, independent timer, or shared scheduler modification was added.

## Producer coverage

| Owning path | Notification boundary |
| --- | --- |
| Issue create/update | Existing monitor intent before the issue write |
| Native `set_task_monitor`; preserved-monitor decisions | Existing monitor intent before the issue write |
| Manual/automatic claim, release, diagnostic fallback, consumption | Added intent in the existing or short write transaction; provider admission remains outside it |
| Issue checkout and stale checkout adoption | Added a short transaction around the existing CAS and intent; captured the expected execution ID before entering the callback |
| Issue removal, release, and force release | Added intent in the existing transaction |
| Tree restoration, member reassignment, agent deletion | Added intent before changing monitor eligibility |
| Agent conversation activation/settlement and external conversation settlement | Added intent before direct issue status writes |
| Workspace reconstruction and execution-recovery blocking | Added intent before changing eligibility |
| Native projection/finalization and issue review transitions | Extended existing notification fanout; no service invocation inside the notifier |
| Execution-control recovery writes and active-run watchdog folding | Extended transaction notifications because these can release native ownership |
| Company status/deletion/budget changes | Added monitor topic beside existing schedule notifications |
| Worktree execution suppression setting | Existing native projection notification now also wakes monitor inspection |

The next-deadline predicate deliberately has the same issue/company/native-owner
eligibility as the existing due-monitor query. Admission still owns authorization,
quota behavior, exact claim guards, current assignment, and client-error handling.
An abort or drain observed after a claim leaves that claim durable for later stale
claim recovery. It does not dispatch new work after that lifecycle check fails.

## Verification on the slice

- Baseline: existing monitor admission and scheduled-work suites, 25 passed.
- Final combined run: eight complete suites, 219 passed, no skipped tests. The
  suites were `heartbeat/scheduling`, `scheduled-work`, `scheduled-work-postgres`,
  `routine-schedule-work`, `issue-monitor-scheduler`, `server-startup-feedback-export`,
  `execution-control-work`, and `native-run-projection-work`.
- Six isolated external PostgreSQL 17 databases had all 403 migrations applied.
  This avoids treating unavailable embedded-Postgres suites as passing evidence.
- New lifecycle cases verify zero worker select/execute/transaction calls over
  multiple old poll periods after settlement, with completed monitor history
  retained. They also verify the first ordinary issue producer, nested outer
  commit/rollback, first work during drain, deferred admission, stale claims,
  pause/resume, checkout reactivation, earlier deadline/cancellation, and a
  51-monitor backlog that needs a second bounded pass.
- Native finalization integration verifies that a dormant monitor worker wakes
  when workspace settlement finishes and applies an expired monitor's existing
  recovery policy without another provider turn. Existing manual and combined
  scheduler cases still pass. The assembled heartbeat test exercises the new
  monitor-specific entry point and its persisted wake/admission result.
- The lifecycle fixture waits for both finished reconciliation and no remaining
  deadline before measuring quiet. Rollback may first require XID reconciliation;
  drain may retain an intent hold until resume. Neither is counted as quiet
  completion before the shared protocol actually finishes.
- `pnpm -r typecheck` passed. The server package build passed. `git diff --check`
  passed. Repository-wide tests/build and live provider sleep qualification have
  not been completed for this slice; the PR's CI gates remain separate evidence.

## Limits and next duty

The supported writers share one server process's database-work scope. Independent
SQL writers and other server replicas need their own ingress/reconciliation
contract. Active events can still cause inspection; the quiet claim concerns an
unchanged subsystem after settlement, not zero queries during active work.

This slice does not prove host or database suspension. Cloud's existing durable
routine/monitor alarm proof remains unchanged. Legacy agent interval policy and
other remaining recurring duties still run. Migrate the legacy agent timer as
its own slice, preserving due claims, worktree cutoff, eligibility, and budgets.
