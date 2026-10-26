# Terminal workspace recovery pagination

Terminal workspace maintenance already uses the shared delivery coordinator and
retains deadlines only for outstanding work. Its bounded scan must progress past
ineligible rows so that later eligible work can finish and the worker can park.

The source query orders candidates by `(updated_at, id)`. PostgreSQL timestamps
can contain microseconds. The former cursor used a JavaScript Date, which loses
that precision. A skipped row could then compare greater than its own rounded
cursor. Repeated full pages kept recovery active and prevented later cleanup.

The query now carries the database timestamp as text alongside each workspace.
Only the private scan cursor uses that value. Workspace data, business deadlines,
and the frozen rotation boundary keep their existing types and behavior. The
cursor comparison uses the same timestamp/ID tuple as the ordering. The source
service continues to own cleanup eligibility, authorization, concurrency fences,
page limits, abort handling, failed-page recovery, and rotation under churn.
No scheduler API, queue, migration, producer signal, or external alarm changes.

## Verification

The existing full-page starvation regression now gives its skipped rows actual
PostgreSQL microsecond timestamps. Before the repair, the eligible workspace was
never archived. After the repair, the full workspace service and terminal worker
selection passes all 87 tests, including bounded rotation under continuous churn,
changed rows behind the cursor, failed-page recovery, quiet workers, and shutdown.
The service suite accepts the repository's validated disposable external
PostgreSQL URL. Setup applies pending migrations before opening the test client,
then clears fixture tables before the first test as well as after each test. This
supports a fresh database and reuse after an interrupted test run. The database
connection closes during teardown. Server typechecking passes.

This fixes recovery progress. It does not establish provider suspension or change
which active or unresolved resources prevent instance sleep.

Workspace-wide typechecking and the production build also pass. Full sharded CI
and fresh review remain required before this PR is ready.

Review follow-up reproduced the missing-schema failure against a newly created,
unmigrated disposable database. The setup repair migrates that same database
inside the suite; the full workspace-service selection then runs without manual
schema preparation. The production cursor implementation is unchanged.
