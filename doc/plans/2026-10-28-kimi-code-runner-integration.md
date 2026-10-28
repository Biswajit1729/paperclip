# Kimi Code native Runner integration — 2026-10-28

Owner: this chat, with separate provider, distribution, and product owners.
Baseline: `dce004259394486f6361d0c0dd5a33a5272acc0a`.
Branch: `codex/kimi-code-runner` in the existing managed worktree.
Delivery: tested, reviewable PR stack: Runner foundation, then product setup and
acceptance. Each slice must compile and remain below the repository review limit.
Merge, publication, and production deployment
are separate from this handoff. The user confirmed local plus Daytona acceptance.

## Release contract

An operator selects Kimi Code in native Runner, saves and reopens its exact
model/environment configuration, tests the runtime, assigns ordinary work, sees
streamed tools and output, receives independently verified files/artifacts and
durable task completion, and can Stop owned work. Existing legacy Kimi agents
and their history retain their current execution path.

- First environment: isolated local macOS arm64; remote: Daytona Linux x64.
- Runtime under investigation: official `@moonshot-ai/kimi-code@2.3.3`, ACP over
  stdio, behind the existing ACPX driver. The ambient Mac binary is 0.41.0 and
  cannot establish the new runtime's compatibility.
- Model: explicit caller-selected identifier, acknowledged before the first
  prompt. Qualification uses authenticated `kimi-for-coding`;
  discovery is never a product allowlist.
- Authentication: explicit company-secret `KIMI_API_KEY` environment binding.
  Qualification uses only the active global login's short-lived access token;
  the provider accepted a real model/tool turn. Refresh tokens and login homes
  are never transferred. Managed Kimi account connections are deferred.
- Instructions: exact composed content must reach native model instructions on
  create and load, with correlated acknowledgment; missing proof rejects prompt
  admission. Current official ACP does not consume this field, so a pinned,
  provider-owned runtime patch is required unless a richer interface proves better.
- Required: model/instruction admission, scoped authenticated tools, streaming,
  semantic questions, permission decisions, cancellation, session continuation,
  terminal settlement, cleanup, clean installation, and the ordinary product path.
  Native question/plan controls are inventoried separately before any claim.
- Deferred unless separately qualified: managed browser login, active steering,
  inbound media, native question/plan controls, native child/background agents,
  first-class child projections, additional OS/architectures, and usage accounting.
  Native ACP reports context occupancy, not usable per-run token/cost totals.
  Dollar budget enforcement is therefore not a qualified capability.
- Spending: proportionate goal-authorized test/provider/infrastructure work;
  record material costs and unknowns, diagnose first divergence before paid retry,
  stop uninformative attempts. No recurring infrastructure commitment.

## Architecture and ownership

Provider translation and native patch remain Kimi-owned. Shared Runner supervision,
PRP transport, durable decisions, authorization, and task finalization retain
their existing contracts. Distribution is a pinned installed closure with no
fallback to ambient Kimi. Runtime admission remains pending until required live
qualification passes. Provider registration does not migrate legacy agents.

## Acceptance ledger

| Required gate | Environment | Observation | Verdict |
| --- | --- | --- | --- |
| Exact model and instructions | local and Daytona | Local driver/native metadata and live instruction-only nonce passed on profile2; final profile and product/Daytona evidence pending | partial |
| Scoped tools and credentials | local and Daytona | Live semantic echo passed; controlled native/ACPX peer found and fixed argument and child-environment gaps; native v5 controlled peer passed; authenticated final profile pending | partial |
| Ordinary setup | local and Daytona | Save/reopen/Test/run/reconnect with exact selection | unattempted |
| Useful task | local and Daytona | Profile6 failed exact output framing; profile7 passed exact reply, accepted finish, durable Done and physical cleanup | partial |
| Human input and Stop | local and Daytona | Durable semantic question/permission; deny and timely Stop prevent effects | unattempted |
| Continuation and child loss | local and Daytona | Correct session/model/instructions; pending input expires; bounded retirement | unattempted |
| Installed distribution | macOS arm64 and Linux x64 | Archived installed CJS setup/download/reuse/tamper checks passed; Linux metadata passed under emulation; final tarball and native image pending | partial |
| Regression and repository checks | candidate revision | Full typecheck and focused checks passed before final profile; full tests interrupted by confirmed host semaphore exhaustion; final tests/build pending | partial |

Current totals: 0 fully passed, 5 partial, 3 unattempted of 8 gates.
Each gate's detailed cells and attempts will be recorded before qualification;
these grouped gates are not a substitute for per-environment passing evidence.

The explicit-only `kimi-qualification` Product E2E suite has 20 required cells:
message-marker, plan-revise-accept, ask-question, structured-question-resume,
structured-question-restart-resume, file-edit-validate, continuity-restart, and
stop-new-resume, native pending-permission Stop, and native pending-permission worker loss, each on local and Daytona. Each has one required repetition and
zero automatic paid retries. The local message-marker cell passed on its third candidate attempt; the first
two failures remain retained below. The other 19 cells are unattempted. The four
native pending-permission Stop and child-loss cells are now registered and have
provider-specific evidence and process selectors. Controlled native probes establish the provider
boundary but do not replace product evidence. Assigned-skill behavior and ordinary
setup/save/reopen/Test/run/reconnect remain required. Existing matrices are unchanged.

## Current state

Provider, distribution, and product registration are implemented and pending live
qualification. Three delegates own native protocol/probes, distribution/image
delivery, and product admission/database test infrastructure. The lead owns
integration, the full-stack campaign, and PR delivery. The next critical gate is
the explicit local/Daytona cells on frozen profile8 after the passing local
profile7 slice and the native permission correction. Production admission stays pending.

The full test attempt was interrupted after a separate probe reproduced macOS
SysV semaphore exhaustion: PostgreSQL `semget(...,17,03600)` returned ENOSPC.
The host had 87,364 of 87,381 semaphores allocated. No shared processes or IPC
resources were changed. An owned Docker PostgreSQL18.6 database is available for
tests that support `PAPERCLIP_TEST_DATABASE_URL`; this cannot establish embedded
database coverage. Its owner is this chat; remove it after qualification.

Dedicated isolated build resources now exist: Kimi-owned CodeBuild project,
role, bucket, logs and public candidate ECR repository. The first profile7 job
was stopped after 33 seconds of pre-build when the permission gap was found. It
produced no image. The profile8 retry needs the corrected frozen pushed source SHA.
The job receives no GitHub or provider credentials, has concurrency1 and a
30-minute build limit, and verifies the installed native closure before publishing.
Daytona acceptance still requires the resulting immutable image digest. The old
authorized test key returned HTTP401 without creating a sandbox. The replacement
key in the user-authorized secret file passed an SDK read-only authentication
probe; no sandbox was created and no credential values are retained here.

## Evidence and first divergences

- Frozen root dependency installation passed with the normal network-enabled
  package manager. Restricted-network signature fetch failures were retained;
  no signature gate was disabled.
- Runner TypeScript/Rust typecheck passed before final sidecar registration edits.
  Focused Runner contracts: 297 tests passed. Product setup/admission, token,
  catalog, and route checks have separate passing results; these are not live proof.
- Both locked runtime closures built in 8.4 seconds with 33 required npm packages.
  macOS arm64 installed native metadata and Linux x64 metadata under emulation
  passed create/model/load/EOF; Linux emulation is not Daytona qualification.
- Real bundled ACPX manager admitted exact `kimi-for-coding` and current bound
  instructions with physical cleanup. The first two attempted turns failed before
  semantic tool delivery. The second retained the native 403: account subscription
  lacked Kimi Code entitlement. Native CLI login succeeded, and the user then
  subscribed. Those failures remain failures; no cost counters were available.
- The first entitled turn completed native execution and called the exact MCP
  echo with the instruction-only nonce. Its smoke observer incorrectly expected
  `paperclip_echo` at a handler that receives canonical `echo`. Native arguments,
  MCP receiver error, and terminal completion establish a grading/observer failure,
  not a successful tool round trip. The corrected observer then passed a real
  authenticated semantic echo, native terminal completion, and physical cleanup.
  Its profile2 evidence is retained separately from the final candidate.
- Review found and corrected a real normal-path gap: the packaged sidecar's
  handwritten agent parser omitted Kimi even though direct driver metadata passed.
  Final sidecar checks and real Rust/sidecar product acceptance remain required.
- Native controlled-model probes use the actual pinned Kimi and bundled ACPX.
  They found upstream approval construction omitted `toolInput`; the owned patch
  now carries exact nested and UTF-8 arguments, including empty objects. Denied
  Write caused no file effect, and native HTTP418 remained a typed failed turn.
- The next probe found provider credentials inherited into native Bash. The
  patch filters `KIMI_API_KEY` and private instruction transport from native
  subprocesses while preserving explicitly assigned task variables. Actual ACPX
  always advertises terminal capability, which routed Bash through its own host;
  the final provider patch forces the owned filtered native process path instead.
  Final verification must observe zero `terminal/create` requests and no secret
  in the actual child, rather than merely inspecting a filtered object.
- Bundling exposed a `Function.toString()` source difference that changed patched
  native bytes. The patch now embeds one canonical static helper source; raw and
  archived CJS setup produce the same pinned output. Final source comment removal
  changes its byte identity again before profile4 freeze; old evidence keeps its
  original closure and profile identity.
- Required repository checks remaining: final full typecheck, supported full test
  run with the original infrastructure failure retained, full build, and the
  ordinary setup/save/reopen/Test/run/reconnect path. Token gates and map structure
  currently pass. Setup Test now uses the official authenticated model catalog;
  it does not claim inference, quota, or task execution from a metadata response.

The full repository build passed on candidate profile5. Its first Product E2E
message-marker attempt reached real UI/server/database setup, then stayed paused:
the installed-runtime-only Test warning is rejected by the ordinary agent lifecycle.
No model turn started. This candidate failure is preserved separately from the
retry. The correction performs a fixed-endpoint authenticated model-catalog probe
before reporting a successful Test. A real catalog request accepted the credential
and returned exact `kimi-for-coding`; the official `KimiCLI/2.3.3` client header
is required (a generic client was rejected with HTTP403). The selected ID is never
substituted. The first release also disables native question and plan tools so
only the promised semantic interaction path remains available.

Current profile8 command digest:
`sha256:53c63af8722894e14d48ed55526f99fcd79e06c86ae1c7aa384ef7ee8c56efd4`.
Native runtime patch v6 SHA256:
`79980aa95c54f325a05cbdf883f74443705db28f3e412a1b5ae22929d939eb66`.
Closure pins: macOS arm64 `6038325abd0431c30097ff1f572a9b29816e1b4da372d8cb86b2ca5d18ea34e7`,
Linux x64 `105d8394adbbc76a953a12cc51b5288eb940ad693291e584f6cdc6407213164d`.
The actual native Kimi plus bundled ACPX controlled-service probes passed seven
requests for instructions/arguments/auth fencing/denial/failure, then nine for
pending-permission Stop and spontaneous owned native-worker loss. Both pending
callbacks aborted, stale approval caused no response/write/new model request,
and workers physically retired within five seconds. The model service was simulated;
these results do not establish authenticated product acceptance.

To retain native macOS Runner acceptance without changing shared IPC state, an
official checksummed PostgreSQL18.6 build with named POSIX semaphores passed fresh
initialization, normal migrations, SQL empty-database checks, and cleanup. Only
this worktree's unshared native dependency entry was temporarily pointed at that
private build. It was restored before canonical public-package staging. The
accepted database process/version must be disclosed with each affected result;
no database fixture contract or tracked dependency file was changed.

Campaign cost: subscription model calls have no reliable native usage counters;
cost is unknown. One cloud job was stopped during pre-build; no image or Daytona sandbox exists. Original
403s, the grading defect, credential-boundary failures, and database setup failure
remain separate failed or blocked attempts; none are overwritten by retries.

The Code endpoint for this finite release is the global coding API
`https://api.kimi.ai/coding/v1`, matching the successfully restored account.
Mainland-region routing and managed OAuth refresh are outside this release.
Authenticated qualification binds only the existing login's access token to the
isolated run; refresh tokens and the ambient login home are not transferred.

The second local message-marker attempt reached the real model and tools. Run
`4d394aef-0e6a-49a8-9fb0-873651d0241f` finished in 24 seconds, accepted the finish
contract, saved task Done, and passed physical cleanup. Its original verdict is
failed: progress text and final text shared one provider item, so the visible
final bubble contained both. Native patch v5 now forwards actual turn-step UUID
boundaries. The Kimi projection validates their provenance and order before
passing generic assistant boundaries to Runner. It does not infer boundaries
from text, tools, or HTTP response identifiers. The actual native Kimi/ACPX
controlled peer passed this framing case alongside instructions, tool arguments,
credential isolation, denial, typed failure, Stop, and native-worker loss.

Current profile7 verification: 162 sidecar/projection/metadata/instruction tests,
144 driver/projection tests, and 18 Rust provider-state tests passed. TypeScript,
Rust daemon staging, bundled entrypoints, and all three affected immutable
profile checks passed. The archived installer passed fresh public downloads,
offline reuse, tamper rejection and cancellation on profile7. Final installed
CLI/server tarballs remain to be rebuilt and checked. The full repository test
run continues against the owned migrated PostgreSQL18.6 Docker database; the
earlier host semaphore and unmigrated-database setup failures remain retained.

The third local message-marker attempt passed all six independent matchers,
accepted finish, durable Done, and cleanup on profile7/source
`5fe7d496e1603626ceb5838f37c4fecce23580ee`. Campaign
`local-2026-10-28T14-24-09-928Z`, run
`68705f91-d195-4532-9fd4-e8b1826d6ed9`, completed in 45.1 seconds including
cleanup and evidence collection. Its rendered final reply is the exact marker.
The profile7 installed CLI/server tarballs also passed fresh public setup,
offline reuse, exact native create/model/load/instruction receipts and EOF.

Lifecycle authoring then found that native Kimi approval omitted its tool kind.
Patch v6 carries the native tool's existing canonical kind. The actual native
callback now passes shared normalization: exact Write target with Allow once,
Deny and Cancel; missing/foreign workspace contexts offer only Deny/Cancel and
reject acceptance. The complete nine-request controlled native peer passed.
The engine metadata correction and v6 change advance the installed closures.
Profile7 evidence retains its original identity; the affected permission and
installed-runtime paths require profile8 evidence before qualification.

CI found stale dependent provider attestations and fixture expectations. Pi31
attests the changed shared environment/sandbox sources without changing its native
closure. Copilot73 attests historical-profile decoding changes; Grok11 remains
current. Old fixtures stay immutable. Ninety-five Pi/Copilot installation tests
passed with one existing opt-in skip, plus 18 image contract tests and four Grok
identity-generator tests. Kimi lifecycle authoring passed 44 deterministic cases;
the exact Linux pidfd selector passed 14 real cases on native ARM64 Linux and 110
TypeScript observer/contract tests with one existing skip. Linux x64 emulation
returned ENOSYS for pidfd and is retained as an unsuccessful infrastructure
attempt; only actual Daytona Linux x64 can qualify that target.

The rebased profile7 full typecheck/build passed and profile8 full build passed
before the final dependent-provider identity refresh. The local full-test run
was interrupted after unrelated shared-database cleanup failures and stale
migration module errors. A fresh current-build isolated PostgreSQL migration
probe passed. A replacement full run and final checks remain required. Later
focused HTTP tests hit import/hook timeouts while host load was 63/120 with 92%
CPU use; their original failures remain retained, without committed deadline
increases. CI for the corrected source will provide an independent Linux check.

Review branches are published as draft PRs [Runner foundation #18028](https://github.com/paperclipai/paperclip/pull/18028)
and [product setup #18029](https://github.com/paperclipai/paperclip/pull/18029).
The first foundation review was 5/5 with no comments on its exact prior head;
the corrected final head requires a fresh review. Neither PR is ready for merge
until required product acceptance and checks pass.
