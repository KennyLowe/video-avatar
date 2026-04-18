---

description: "Task list for Lumo v1 — operator-driven avatar video pipeline"
---

# Tasks: Lumo v1 — Operator-driven avatar video pipeline

**Input**: Design documents from `S:/video-avatar/specs/001-lumo-v1/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test tasks are included because `plan.md` explicitly scopes `tests/contract/`, `tests/integration/`, and `tests/ui/` (Vitest + Playwright-Electron). They are deliberately placed **after** the primary implementation in each story so the project isn't forced into TDD unless the operator wants it.

**Organization**: Tasks are grouped by user story (P1–P5) to enable independent implementation and testing. Every task carries a checkbox, ID, optional `[P]` marker, optional `[USn]` story label, action, and an absolute file path.

## Format

`- [ ] [TaskID] [P?] [USn?] Description with absolute file path`

- **[P]**: Different file(s), no dependency on any incomplete task.
- **[USn]**: Maps the task to user story `n` from `spec.md`.
- Absolute paths are under `S:/video-avatar/...`; on any other machine, substitute the repo root.

## Path conventions

Electron single-repo layout per `plan.md`:
- Main: `S:/video-avatar/src/main/`
- Preload: `S:/video-avatar/src/preload/`
- Renderer: `S:/video-avatar/src/renderer/`
- Shared: `S:/video-avatar/src/shared/`
- Tests: `S:/video-avatar/tests/{contract,integration,ui}/`
- Bundled templates: `S:/video-avatar/resources/templates/`
- Build config: `S:/video-avatar/build/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialise the repository, dependency graph, and tooling so every later task has a working project to land in.

- [X] T001 Create the top-level source tree (`src/main/`, `src/preload/`, `src/renderer/`, `src/shared/`, `resources/templates/`, `tests/{contract,integration,ui,fixtures}/`, `build/`) in `S:/video-avatar/`
- [X] T002 Initialise `S:/video-avatar/package.json` with name, version, author, main=`dist/main/bootstrap.js`, scripts (`dev`, `build`, `test`, `lint`, `package`) and engines.node ≥ 20
- [X] T003 Add runtime dependencies to `S:/video-avatar/package.json`: `electron`, `react`, `react-dom`, `better-sqlite3`, `keytar`, `zod`, `zod-to-json-schema`, `@remotion/player`, `@remotion/renderer`, `@remotion/bundler`, `@vladmandic/face-api`, `ffmpeg-static`, `ffprobe-static`, `monaco-editor`, `@monaco-editor/react`, `uuid`, `nanoid`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`
- [X] T004 Add dev dependencies: `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `vite`, `@vitejs/plugin-react`, `electron-builder`, `electron-vite`, `vitest`, `@playwright/test`, `playwright-electron`, `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `prettier`
- [X] T005 [P] Create `S:/video-avatar/tsconfig.json` (strict, noUncheckedIndexedAccess, target ES2022, paths for `@main/*`, `@renderer/*`, `@shared/*`)
- [X] T006 [P] Create `S:/video-avatar/electron.vite.config.ts` with separate main, preload, and renderer configs pointing at their trees
- [X] T007 [P] Create `S:/video-avatar/.eslintrc.cjs` with TypeScript, React, and Prettier plugins
- [X] T008 [P] Add a custom ESLint rule in `S:/video-avatar/.eslint-rules/no-inline-fetch.cjs` that forbids `fetch(` outside `src/main/providers/**`
- [X] T009 [P] Add an ESLint rule in `S:/video-avatar/.eslint-rules/no-string-concat-paths.cjs` that flags string literals joined to path-like variables, reinforcing Non-negotiable #6
- [X] T010 [P] Create `S:/video-avatar/.prettierrc` (single-quotes, trailing comma all, print width 100)
- [X] T011 [P] Add `S:/video-avatar/build/electron-builder.yml` (productName `Lumo`, win target `nsis`, `extraResources` includes `resources/templates` and `ffmpeg-static` binary, `publish: null` to disable auto-update)
- [X] T012 [P] Add `S:/video-avatar/vitest.config.ts` with environment `node` for contract/integration and `jsdom` for renderer unit tests
- [X] T013 [P] Add `S:/video-avatar/playwright.config.ts` for Playwright-Electron with a single Windows project
- [X] T014 [P] Add `S:/video-avatar/.github/workflows/ci.yml` running on windows-latest: install, lint, typecheck, vitest, and a best-effort Playwright run (skip if binary build fails)
- [X] T015 [P] Create a minimal `S:/video-avatar/README.md` pointing to `specs/001-lumo-v1/quickstart.md` for operator setup and `CLAUDE.md` for contributor context

**Checkpoint**: Repo installs cleanly with `npm install` and `npm run lint` passes on an empty source tree.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Everything every user story needs before it can land a single line: Electron scaffolding, data layer, logger, keychain, IPC skeleton, worker skeleton, shared schemas, the Claude Code wrapper (used by three stories), the minimal projects CRUD and Home shell (every story needs to open a project), and the async-feedback contract that enforces SC-002. **No story work starts until this phase is green.**

- [X] T016 Create the Electron main entry point at `S:/video-avatar/src/main/bootstrap.ts` with app lifecycle (ready, window-all-closed, activate) and a single `BrowserWindow`
- [X] T017 Wire the preload bridge at `S:/video-avatar/src/preload/index.ts` that exposes `window.lumo` via `contextBridge.exposeInMainWorld`; start with an empty namespace map and grow per story
- [X] T018 Create the renderer bootstrap at `S:/video-avatar/src/renderer/main.tsx` + `App.tsx` with a React Router shell and a placeholder Home screen
- [X] T019 [P] Implement `S:/video-avatar/src/main/platform/paths.ts` with `getAppDataRoot()` (`%APPDATA%/Lumo`) and `getProjectsRoot()` (reads from settings, falls back to a dialog). Every path built via `path.resolve` / `path.join`.
- [X] T020 [P] Implement `S:/video-avatar/src/main/platform/keychain.ts` — a typed `keytar` wrapper exposing `get(target, account)`, `set(target, account, value)`, `clear(target, account)`. Targets: `Lumo/elevenlabs`, `Lumo/heygen`, `Lumo/s3`.
- [X] T021 [P] Implement `S:/video-avatar/src/main/platform/notifier.ts` using Electron's native `Notification` API for Windows toasts with a `notify(title, body, onClick?)` function
- [X] T022 [P] Implement the log redactor at `S:/video-avatar/src/main/services/redactor.ts` covering known secret shapes (ElevenLabs `xi-api-key`, HeyGen `x-api-key`, bearer tokens, AWS pre-signed URL `X-Amz-Signature` params, Cloudflare tunnel hostnames); 100% unit tested.
- [X] T023 [P] Implement the JSONL logger at `S:/video-avatar/src/main/logging/jsonl.ts` writing to `%APPDATA%/Lumo/logs/YYYY-MM-DD.jsonl`, daily rotation, level gate, and passing every payload through the redactor before write
- [X] T024 Implement `S:/video-avatar/src/main/data/db.ts` — per-project `better-sqlite3` connection pool keyed by project id, WAL mode on open, and a `transaction(cb)` helper
- [X] T025 Implement the migration runner at `S:/video-avatar/src/main/data/migrations/runner.ts` that reads `schema_migrations` and applies missing `.sql` files in order inside a single transaction
- [X] T026 Author the initial migration at `S:/video-avatar/src/main/data/migrations/0001_init.sql` creating tables `voices`, `takes`, `avatars`, `segments`, `scripts`, `script_chapters`, `renders`, `jobs`, `costs`, `schema_migrations` with the columns from `data-model.md`
- [X] T027 [P] Create the repository base at `S:/video-avatar/src/main/data/repositories/base.ts` exposing typed prepared-statement helpers and absolute-resolving every `*_path` column on read
- [X] T028 [P] Implement the projects metadata layer at `S:/video-avatar/src/main/data/projects.ts` — reads/writes `<project>/project.json`, returns typed `Project` objects, and resolves slug collisions with a numeric suffix
- [X] T029 [P] Create the global settings store at `S:/video-avatar/src/main/platform/settings.ts` persisting to `%APPDATA%/Lumo/settings.json` (projects root, default Claude model = `claude-opus-4-7`, upload transport default = `heygen`, render defaults, log level, appearance)
- [X] T030 Create shared Zod schemas under `S:/video-avatar/src/shared/schemas/` for every entity in `data-model.md` (`project.ts`, `voice.ts`, `take.ts`, `avatar.ts`, `segment.ts`, `script.ts`, `template.ts`, `render.ts`, `job.ts`, `costEntry.ts`, `transport.ts` with `TransportKind = 'heygen' | 's3' | 'r2' | 'cloudflared'`) plus `index.ts` barrel
- [X] T031 Create the typed IPC bridge stub at `S:/video-avatar/src/main/ipc/index.ts` that registers handler groups (empty for now) and exposes their types to the preload
- [X] T032 Add the typed renderer proxy at `S:/video-avatar/src/renderer/lib/lumo.ts` that types `window.lumo.*` from the IPC schema barrel
- [X] T033 Scaffold the job worker at `S:/video-avatar/src/main/workers/jobQueue.ts` — single-consumer loop with exponential back-off (5 s → 10 s → 20 s → 40 s → 80 s → 120 s cap), abort on `jobs.cancel`
- [X] T034 Scaffold the launch reconciler at `S:/video-avatar/src/main/workers/reconciler.ts` — on app start, fetch every `jobs` row where `status IN ('queued','running')` and ask the provider for its current state before accepting new work
- [X] T035 [P] Scaffold the ElevenLabs, HeyGen, Remotion, and Transport wrappers as skeletons (signatures only, throwing `NotImplemented`) at `S:/video-avatar/src/main/providers/{elevenlabs,heygen,remotion,transport}.ts`, each matching `contracts/provider-wrappers.md`
- [X] T036 [P] Add a universal error type at `S:/video-avatar/src/shared/errors.ts` (`ProviderError` with `provider`, `code`, `message`, `cause`) that every wrapper throws
- [X] T037 [P] Implement the global keyboard shortcut layer at `S:/video-avatar/src/renderer/hooks/useKeyboardShortcuts.ts` covering `Ctrl+0..5`, `Ctrl+J`, `Ctrl+,` with visible-on-button hints
- [X] T038 Implement the Claude Code wrapper fully at `S:/video-avatar/src/main/providers/claudeCode.ts` per `contracts/provider-wrappers.md`: `invoke` using `child_process.spawn('claude', ['--print','--output-format',fmt,'--model',model])` with stdin for prompts > 4 KB, stderr captured to log, timeout + AbortSignal kill; and `verifyInstalled` that probes `claude --version` for installed + a trivial `claude --print --output-format json` with a 5 s timeout for authenticated (per FR-001), classifying known auth-failure stderr signatures
- [X] T039 Implement foundational `projects.*` IPC handlers at `S:/video-avatar/src/main/ipc/projects.ts` — `list`, `create`, `open` only (rename/duplicate/delete/revealInExplorer arrive in US5). Backed by `src/main/data/projects.ts`; `create` runs migrations on the new DB and writes `project.json`.
- [X] T040 Build the minimal Home shell at `S:/video-avatar/src/renderer/screens/Home.tsx` — projects-root picker on first run, list of recent projects, "New project" button, "Open project" button, and space for a persistent banner. US5 enriches this file with thumbnails, quick actions, and a two-step delete flow.
- [X] T041 Implement foundational `settings.*` IPC handlers at `S:/video-avatar/src/main/ipc/settings.ts` — `get`, `update`, and `pickProjectsRoot`. Full Settings UI (provider keys, transport config, render defaults, logs) lands in US5.
- [X] T042 Implement the async-feedback contract at `S:/video-avatar/src/renderer/components/AsyncFeedback.tsx` — a React component with discriminated union `kind: 'progress' | 'eta' | 'typical'` per SC-002. Every screen that awaits an operation expected to exceed 5 s MUST render this component; T136 polish audits compliance.
- [X] T043 Wire the Claude Code availability check into `bootstrap.ts` using `claudeCode.verifyInstalled()` from T038 so Home renders a non-dismissible banner when either `installed=false` or `authenticated=false`, with the exact shell command to fix and a Recheck button

**Checkpoint**: Electron app launches, Home lets the operator pick a projects root and create/open a project, Claude Code banner appears when `claude` is missing or unauthenticated, logs flow to `%APPDATA%/Lumo/logs/`. Empty DB migrates cleanly for every new project.

---

## Phase 3: User Story 1 - End-to-end avatar video from prompt, using stock voice and stock avatar (Priority: P1) 🎯 MVP

**Goal**: An operator on a fresh install, with Claude Code already authenticated and ElevenLabs + HeyGen keys entered at first use, can type a one-line prompt, approve the generated script (with spoken-word linting and optional Claude-driven assists on selection), pick a stock voice + stock avatar + Standard mode, see a cost preview, click Run, and receive a playable lip-synced MP4 inside the app.

**Independent Test**: Run the Playwright flow `p1-end-to-end.spec.ts` against a built binary with test fixtures stubbing ElevenLabs + HeyGen + Claude Code. Expect a file at `<project>/video/avatar/<id>.mp4` and a cost-ledger row.

### Implementation for User Story 1

- [X] T044 [US1] Implement ElevenLabs wrapper at `S:/video-avatar/src/main/providers/elevenlabs.ts` — `testKey` (`GET /v1/user`), `tts` (`POST /v1/text-to-speech/{voice_id}` returning the MP3 buffer + character count), `listStockVoices`, `getPvcMinimumSeconds` / `getIvcMinimumSeconds` (live query with 1800 s / 60 s fallback per `research.md` §2); reads the key from keychain at call time
- [X] T045 [US1] Implement HeyGen wrapper at `S:/video-avatar/src/main/providers/heygen.ts` — `testKey`, `uploadAudioAsset` (raw binary `POST upload.heygen.com/v1/asset`), `generateVideo` (`/v2/video/generate` with `audio_asset_id`; Avatar IV via `/v2/video/av4/generate`), `getVideoStatus`, `cancelVideo`, and `listStockAvatars`
- [X] T046 [US1] Implement the `'heygen'` transport at `S:/video-avatar/src/main/providers/transport.ts` returning `{ kind: 'asset', assetId }` for downstream reference as `audio_asset_id`; S3/R2 and cloudflared transports arrive in Phase 8 (T133, T134)
- [X] T047 [US1] Implement `credentials.*` IPC handlers in `S:/video-avatar/src/main/ipc/credentials.ts` (`status`, `test`, `set`, `clear`, `recheckClaudeCode`) per `contracts/ipc-bridge.md`
- [X] T048 [US1] [P] Build the provider key-entry dialog component at `S:/video-avatar/src/renderer/components/KeyEntryDialog.tsx` — masked input, Test button surfacing the verbatim provider error, Save on success only
- [X] T049 [US1] Implement `scripts.*` IPC handlers in `S:/video-avatar/src/main/ipc/scripts.ts` — `list`, `generate`, `save`, `restore`, and `assist` (per FR-013 and the `contracts/ipc-bridge.md` signature); each handler is backed by the `scripts` repository and `claudeCode.invoke`
- [X] T050 [US1] Implement the script response schema + system prompt at `S:/video-avatar/src/main/services/scriptPrompt.ts` (`ScriptResponseSchema` per spec, `SCRIPT_SYSTEM_PROMPT` enforcing spoken register)
- [X] T051 [US1] [P] Implement the spoken-word linter service at `S:/video-avatar/src/renderer/services/spokenLinter.ts` per FR-011 — rule-based flags for parenthetical asides, bullet-list syntax, URL literals, acronyms without first-use expansion; exports a `lint(body): LintMark[]` function with stable marker positions for Monaco
- [X] T052 [US1] [P] Implement the assist-prompt library at `S:/video-avatar/src/main/services/assistPrompts.ts` — one system prompt per action (Tighten, Less corporate, Break into chapters, Add hook, Convert jargon); returns the replacement string only
- [X] T053 [US1] Build the Script screen at `S:/video-avatar/src/renderer/screens/Script.tsx` with prompt box, tone + length selectors, Monaco editor wired to the spoken-word linter (inline squiggles + tooltip), live WPM / word count / duration readouts, Save writes `scripts/<slug>-v<n>.md` via `scripts.save`
- [X] T054 [US1] [P] Build the assist menu + diff preview at `S:/video-avatar/src/renderer/components/AssistMenu.tsx` — selection-driven action list, calls `scripts.assist`, opens `DiffPreview.tsx` before replacing the selection (operator must accept)
- [X] T055 [US1] Implement the cost estimator at `S:/video-avatar/src/main/services/costEstimator.ts` covering ElevenLabs TTS (characters → credits → USD) and HeyGen Standard + Avatar IV (seconds → credits → USD with the Avatar IV premium-credit multiplier); USD rates live in a static table with a `sources.md` footnote
- [X] T056 [US1] Implement `generate.costPreview` and `generate.run` IPC handlers at `S:/video-avatar/src/main/ipc/generate.ts` (enforce voice/avatar/script/mode selection, persist a `jobs` row, kick the worker)
- [X] T057 [US1] Implement the `avatarVideo` job handler at `S:/video-avatar/src/main/workers/handlers/avatarVideo.ts` — step 1 TTS to `<project>/audio/tts/<uuid>.mp3`, step 2 upload via the resolved transport (default `'heygen'`), step 3 HeyGen generate, step 4 poll status, step 5 download MP4, step 6 write `renders` row and cost entries
- [X] T058 [US1] [P] Build the Generate screen at `S:/video-avatar/src/renderer/screens/Generate.tsx` — four-column pickers (voice, avatar, script, mode), inline cost preview, Run disabled until selections complete, disables Avatar IV when the selected avatar tier is incompatible
- [X] T059 [US1] [P] Build the CostPreview component at `S:/video-avatar/src/renderer/components/CostPreview.tsx` showing ElevenLabs characters/credits/USD, HeyGen minutes/credits/USD, total, month-to-date per provider, and plan headroom if available
- [X] T060 [US1] Build the approval-and-continue affordance on the Generate screen — inline MP4 player, Regenerate (warns of repeat cost with USD estimate), Approve-and-continue → marks the render approved and advances to Compose
- [X] T061 [US1] [P] Implement `voices.listStock` and `avatars.listStock` IPC handlers at `S:/video-avatar/src/main/ipc/{voices,avatars}.ts` returning the ElevenLabs and HeyGen stock catalogues for operators with no trained assets
- [X] T062 [US1] Wire Windows toast notifications for avatar-video job completion/failure in `notifier.ts` (already implemented in T021), called from the worker

### Tests for User Story 1

- [X] T063 [P] [US1] Contract test for the ElevenLabs wrapper at `S:/video-avatar/tests/contract/providers/elevenlabs.test.ts` against recorded fixtures (testKey, tts, stock voices, minimums)
- [X] T064 [P] [US1] Contract test for the HeyGen wrapper at `S:/video-avatar/tests/contract/providers/heygen.test.ts` (testKey, uploadAudioAsset, generateVideo, getVideoStatus, cancelVideo)
- [X] T065 [P] [US1] Contract test for the Claude Code wrapper at `S:/video-avatar/tests/contract/providers/claudeCode.test.ts` using a fake `claude` binary on PATH (covers `invoke`, `verifyInstalled` installed/authenticated/auth-failure branches)
- [X] T066 [P] [US1] Contract test for the spoken-word linter at `S:/video-avatar/tests/contract/spokenLinter.test.ts` — cases for each rule, stable marker positions
- [ ] T067 [P] [US1] Integration test for the avatarVideo job handler at `S:/video-avatar/tests/integration/avatarVideo.test.ts` — full pipeline against fixtures + temporary project
- [ ] T068 [P] [US1] Integration test for resumability at `S:/video-avatar/tests/integration/reconciler-p1.test.ts` — kill process mid-job, restart, confirm reconciliation completes the download
- [X] T069 [US1] Playwright-Electron spec at `S:/video-avatar/tests/ui/p1-end-to-end.spec.ts` covering the full happy path with fixture providers, including the spoken-word linter firing on a known-bad script and at least one assist action going through the diff preview

**Checkpoint**: An operator can go from blank project to a playable lip-synced MP4 using stock voice + stock avatar. The Script editor actively lints the body and offers Claude-driven rewrites with diff-approval. Closing the app mid-pipeline and reopening continues to completion.

---

## Phase 4: User Story 2 - Train and use a custom Professional Voice Clone (Priority: P2)

**Goal**: Record or import ≥ 30 minutes of good audio, submit for PVC training, close the app, come back hours later, find the voice attached to the project, preview it, and use it on the Generate screen.

**Independent Test**: `tests/ui/p2-pvc-training.spec.ts` with a recorded ElevenLabs PVC completion fixture — record/import stubs produce good takes, PVC submit returns a training job, time-travel the worker to completion, voice appears in the voices list.

### Implementation for User Story 2

- [X] T070 [US2] Implement the audio recorder in the renderer at `S:/video-avatar/src/renderer/services/audioRecorder.ts` using `MediaRecorder` with PCM 48 kHz mono 24-bit, pause/resume, live RMS + peak via Web Audio API
- [X] T071 [US2] [P] Build the WaveformMeter component at `S:/video-avatar/src/renderer/components/WaveformMeter.tsx` drawing live peak bars and a scrolling waveform
- [X] T072 [US2] Implement `voices.recordStart`, `voices.recordStop`, and `voices.import` IPC handlers in `S:/video-avatar/src/main/ipc/voices.ts` normalising imports with ffmpeg to 48 kHz mono 24-bit WAV at `audio/takes/<ts>.wav`
- [X] T073 [US2] Implement take management IPC handlers (`markTake`, `trimTake`, `deleteTake`) plus a `takes` repository at `S:/video-avatar/src/main/data/repositories/takes.ts`
- [X] T074 [US2] Extend `elevenlabs.ts` with `createPVC`, `createIVC`, `getVoiceStatus`, and concatenation via ffmpeg before upload
- [X] T075 [US2] Implement the `voiceTrain` job handler at `S:/video-avatar/src/main/workers/handlers/voiceTrain.ts` with PVC + IVC branches, `kind='voice_train'`, poll until ready, write `voices` row on completion
- [X] T076 [US2] [P] Build the Voice screen at `S:/video-avatar/src/renderer/screens/Voice.tsx` with Record/Import tabs, input-device dropdown, per-take controls (play, scrub, trim, mark, rename, delete), and a running total of good seconds/minutes
- [X] T077 [US2] Add Train PVC and Train IVC actions to the Voice screen that refuse to submit below the cached minimums (FR-018, FR-020) and surface the numeric gap; IVC button labelled "Quick test (not recommended for production)" per FR-019
- [X] T078 [US2] Implement `voices.preview(voiceId, text)` IPC handler that generates a 10-second TTS clip and plays it inline; A/B toggle between two voices
- [X] T079 [US2] Wire the trained voice into the Generate screen's voice picker so US2 enriches US1's pipeline without regressions

### Tests for User Story 2

- [X] T080 [P] [US2] Contract test for PVC/IVC endpoints at `S:/video-avatar/tests/contract/providers/elevenlabs-training.test.ts`
- [ ] T081 [P] [US2] Integration test for the voiceTrain job handler at `S:/video-avatar/tests/integration/voiceTrain.test.ts` including concat-then-upload and status polling to completion
- [X] T082 [US2] Playwright-Electron spec at `S:/video-avatar/tests/ui/p2-pvc-training.spec.ts` covering record → mark good → submit → close → reopen → ready → preview → use in Generate

**Checkpoint**: A custom PVC voice can be trained, survives an app restart mid-training, previews correctly, and drives a Generate-screen avatar video.

---

## Phase 5: User Story 3 - Train and use a custom HeyGen avatar (Priority: P3)

**Goal**: Import 2+ minutes of on-camera video, optionally select clean segments, submit for Instant Avatar training; or drop a portrait for Photo Avatar training. On completion the trained avatar is usable on the Generate screen.

**Independent Test**: `tests/ui/p3-avatar-training.spec.ts` covering both tier paths with HeyGen training fixtures and sampled frames for the face-detection gate.

### Implementation for User Story 3

- [X] T083 [US3] Implement video probing at `S:/video-avatar/src/main/services/ffprobe.ts` returning duration, resolution, fps, codec, size for an imported file
- [X] T084 [US3] Implement segment extraction at `S:/video-avatar/src/main/services/ffmpeg.ts` using `-c copy` where stream-copy is safe and re-encoding otherwise; writes to `<project>/video/segments/<source>-<n>.mp4`
- [X] T085 [US3] [P] Implement frame grab at `S:/video-avatar/src/main/services/ffmpeg.ts#extractFrame` returning a PNG at a given timestamp
- [X] T086 [US3] [P] Build the face-detection adapter at `S:/video-avatar/src/renderer/services/faceDetect.ts` wrapping `@vladmandic/face-api` (TF.js WebGL) with lazy model load from `resources/face-api/`, returning `{ framesSampled, oneFaceCount, multiFaceCount, avgLaplacian, meanInterFrameDelta }`
- [X] T087 [US3] [P] Implement the quality-heuristics evaluator at `S:/video-avatar/src/renderer/services/qualityHeuristics.ts` applying the thresholds pinned in FR-027 (resolution, face coverage ≥ 90%, motion ≤ 15% area delta, Laplacian variance ≥ 120); returns a warn/reject list with clear messages
- [X] T088 [US3] Implement `avatars.*` IPC handlers in `S:/video-avatar/src/main/ipc/avatars.ts` (`importVideo` → probes, `importImage` → probes, `addSegment`, `trainPhoto`, `trainInstant`, `preview`) per `contracts/ipc-bridge.md`
- [X] T089 [US3] Extend `heygen.ts` with `createPhotoAvatar`, `createInstantAvatar`, and `getAvatarStatus` per `research.md` §1 — include the `/v2/photo_avatar/train` path and verify Instant Avatar path against live docs at implementation time
- [X] T090 [US3] Implement the `avatarTrain` job handler at `S:/video-avatar/src/main/workers/handlers/avatarTrain.ts` with photo + instant branches, cancellation path that hits HeyGen best-effort
- [X] T091 [US3] [P] Build the Avatar screen at `S:/video-avatar/src/renderer/screens/Avatar.tsx` with tier selector, accepted-type-aware importer, segment timeline, quality-heuristics panel (warn-only except multi-face on Photo Avatar which blocks), and a Train button
- [X] T092 [US3] [P] Build the FaceDetectPanel component at `S:/video-avatar/src/renderer/components/FaceDetectPanel.tsx` that runs detection on sampled frames/images and renders warnings inline against the FR-027 thresholds
- [X] T093 [US3] Implement `avatars.preview` generating a 5-second canned-phrase clip via the same avatar-video pipeline using the project's voice or a default HeyGen voice
- [X] T094 [US3] Wire trained avatars into the Generate screen's avatar picker alongside stock avatars

### Tests for User Story 3

- [X] T095 [P] [US3] Contract test at `S:/video-avatar/tests/contract/providers/heygen-training.test.ts` covering Photo + Instant training endpoints and status polling
- [X] T096 [P] [US3] Contract test for the quality-heuristics evaluator at `S:/video-avatar/tests/contract/qualityHeuristics.test.ts` covering every threshold boundary in FR-027
- [ ] T097 [P] [US3] Integration test for the avatarTrain job handler at `S:/video-avatar/tests/integration/avatarTrain.test.ts` including segment extraction and cancellation
- [X] T098 [US3] Playwright-Electron spec at `S:/video-avatar/tests/ui/p3-avatar-training.spec.ts` for both tier paths through to a usable avatar on Generate

**Checkpoint**: Photo Avatar and Instant Avatar both train and return usable avatar ids; Generate screen shows them; cancellation cleans up best-effort.

---

## Phase 6: User Story 4 - Compose a branded final video with intro, outro, and overlays (Priority: P4)

**Goal**: Pick a Remotion template, write a natural-language prompt, have Claude fill validated props, preview live, and render a composed MP4 per the FR-042 preset mapping.

**Independent Test**: `tests/ui/p4-compose.spec.ts` against a stock avatar clip — drive the FullExplainer template with a prompt, receive a rendered MP4 whose metadata matches the requested resolution and whose ffmpeg settings match the selected preset.

### Implementation for User Story 4

- [X] T099 [US4] Implement the Remotion wrapper at `S:/video-avatar/src/main/providers/remotion.ts` with `bundleOnce(entryTsx)`, `invalidateBundle()`, and `renderMedia(req)` per `contracts/provider-wrappers.md`; the render settings object maps preset enum to `{ffmpegPreset, crf}` per FR-042
- [X] T100 [US4] Implement the template loader at `S:/video-avatar/src/main/services/templateLoader.ts` scanning `resources/templates/` and `<project>/templates/`, validating required exports, caching by absolute path
- [X] T101 [US4] [P] Author the `LogoIntro` template at `S:/video-avatar/resources/templates/LogoIntro.tsx` (logo + title card + colour accent)
- [X] T102 [US4] [P] Author the `LowerThird` template at `S:/video-avatar/resources/templates/LowerThird.tsx` (name/title overlay with in/out)
- [X] T103 [US4] [P] Author the `FullExplainer` template at `S:/video-avatar/resources/templates/FullExplainer.tsx` (intro + avatar clip body + outro, accepts avatar-clip path + chapters)
- [X] T104 [US4] [P] Author the `TitleSlide` template at `S:/video-avatar/resources/templates/TitleSlide.tsx`
- [X] T105 [US4] [P] Author the `ChapterCard` template at `S:/video-avatar/resources/templates/ChapterCard.tsx`
- [X] T106 [US4] Implement the prompt-to-props flow at `S:/video-avatar/src/main/services/templateProps.ts` — `zodToJsonSchema` + `claudeCode.invoke` + `schema.parse` + single retry on validation error per `contracts/remotion-template.md`
- [X] T107 [US4] Implement `compose.*` IPC handlers in `S:/video-avatar/src/main/ipc/compose.ts` (`listTemplates`, `promptProps`, `render`)
- [X] T108 [US4] Implement the `render` job handler at `S:/video-avatar/src/main/workers/handlers/render.ts` — calls `remotion.renderMedia` with per-job abort signal, emits progress into the async-feedback channel (T042), writes `renders` row; partial files MUST be removed on cancellation (FR-042)
- [X] T109 [US4] [P] Build the Compose screen at `S:/video-avatar/src/renderer/screens/Compose.tsx` — template picker (valid + invalid tabs), prompt box, `@remotion/player` live preview, side-panel props editor, render-settings form (resolution + codec + preset enum + audio bitrate), Render button
- [X] T110 [US4] [P] Build the RemotionPreview component at `S:/video-avatar/src/renderer/components/RemotionPreview.tsx` wrapping `@remotion/player` with scrub, play/pause, and prop hot-update
- [X] T111 [US4] [P] Build the JSON editor fallback component at `S:/video-avatar/src/renderer/components/PropsJsonEditor.tsx` for the second schema-parse failure path
- [X] T112 [US4] Add cancellation to the render job from the jobs tray, ensuring partial `.mp4` files and temp directories are removed on cancel

### Tests for User Story 4

- [X] T113 [P] [US4] Contract test for the Remotion wrapper at `S:/video-avatar/tests/contract/providers/remotion.test.ts` (bundle + renderMedia happy path against a fixture composition; asserts preset→CRF mapping per FR-042)
- [X] T114 [P] [US4] Contract test for the template loader + prompt-to-props flow at `S:/video-avatar/tests/contract/remotion-template.test.ts` (validity checks, double-parse-fail path, JSON editor fallback)
- [ ] T115 [P] [US4] Integration test for the render job handler at `S:/video-avatar/tests/integration/render.test.ts` including cancel-then-restart and the partial-file cleanup rule
- [X] T116 [US4] Playwright-Electron spec at `S:/video-avatar/tests/ui/p4-compose.spec.ts` covering template pick → prompt → preview → render → playable MP4; asserts the rendered file's ffprobe reports a CRF consistent with the selected preset

**Checkpoint**: All five seed templates load, a prompt yields validated props, live preview scrubs, rendered MP4s land in `<project>/renders/`, and the ffmpeg preset/CRF mapping from FR-042 is enforced end-to-end. Custom `.tsx` dropped into `<project>/templates/` is either loaded or explicitly invalidated with a named missing export.

---

## Phase 7: User Story 5 - Operational polish: project management, cost visibility, jobs tray, settings (Priority: P5)

**Goal**: Multi-project Home screen with thumbnails and quick actions, month-to-date cost visibility (local ledger **and** provider-reported, side-by-side) with CSV export, persistent Jobs tray, full Settings, and safe Delete that goes to the Windows Recycle Bin.

**Independent Test**: `tests/ui/p5-cost-and-jobs.spec.ts` — create two projects, perform one paid operation in each, export the CSV, verify per-project rows; delete one project, verify Recycle Bin location.

### Implementation for User Story 5

- [X] T117 [US5] Extend `projects.*` IPC handlers at `S:/video-avatar/src/main/ipc/projects.ts` with `rename`, `duplicate`, `delete`, and `revealInExplorer`; delete uses `shell.trashItem` to move the folder to the Windows Recycle Bin (FR-009)
- [X] T118 [US5] [P] Enrich the Home screen at `S:/video-avatar/src/renderer/screens/Home.tsx` (built minimally in T040) with project grid, last-modified + last-render thumbnail, quick actions menu, and rename/duplicate/delete entry points
- [X] T119 [US5] [P] Build the two-step delete-project confirmation modal at `S:/video-avatar/src/renderer/components/DeleteProjectDialog.tsx` that requires typing the project name verbatim
- [X] T120 [US5] Implement `costs.*` IPC handlers in `S:/video-avatar/src/main/ipc/costs.ts` (`mtd`, `ledger`, `exportCsv`) per `contracts/ipc-bridge.md`; `mtd` returns both the local-ledger sum and any provider-reported MTD (from `testKey` payloads) so the UI can render them side-by-side per FR-050
- [X] T121 [US5] Audit every job handler to confirm it writes a `costs` row on completion of a paid op (hooks scoped in T057, T075, T090); fix any gap
- [X] T122 [US5] Implement `jobs.*` IPC handlers in `S:/video-avatar/src/main/ipc/jobs.ts` (`listActive`, `listHistory`, `cancel`, `showLog`, `onUpdate` push channel)
- [X] T123 [US5] [P] Build the persistent JobsTray component at `S:/video-avatar/src/renderer/components/JobsTray.tsx` — bottom strip on every screen, collapse/expand, per-job progress via the AsyncFeedback contract (T042), cancel, log link
- [X] T124 [US5] [P] Build the full Jobs panel at `S:/video-avatar/src/renderer/screens/Jobs.tsx` with active + history tabs and a filter by kind/provider
- [X] T125 [US5] [P] Build the full Settings screen at `S:/video-avatar/src/renderer/screens/Settings.tsx` — providers (keys + test + status), Claude Code defaults, **upload transport config including S3/R2 bucket + credentials and cloudflared binary path**, render defaults, projects root, logs folder + retention + level, appearance
- [X] T126 [US5] [P] Build the ProviderStatus card at `S:/video-avatar/src/renderer/components/ProviderStatus.tsx` showing per-provider authenticated yes/no, plan name, and **both local-ledger MTD and provider-reported MTD side-by-side per FR-050**, plus a link to the provider's dashboard
- [X] T127 [US5] Wire `jobs.onUpdate` into a `useJobs` hook at `S:/video-avatar/src/renderer/hooks/useJobs.ts` that backs the tray and Jobs panel
- [X] T128 [US5] Implement CSV export at `<projects-root>/<project>/exports/costs-<date>.csv` with headers `timestamp,provider,operation,units,unit_kind,usd_estimate,project_id,job_id`

### Tests for User Story 5

- [ ] T129 [P] [US5] Integration test at `S:/video-avatar/tests/integration/costLedger.test.ts` covering ledger writes for each paid op, combined MTD calculation, and CSV export shape
- [ ] T130 [P] [US5] Integration test at `S:/video-avatar/tests/integration/projectsLifecycle.test.ts` covering create → rename → duplicate → delete (Recycle Bin verified via stub)
- [X] T131 [US5] Playwright-Electron spec at `S:/video-avatar/tests/ui/p5-cost-and-jobs.spec.ts` covering two-project flow, tray across screen changes, combined-MTD panel rendering, and CSV export

**Checkpoint**: All operational ergonomics land; every paid op shows up on the ledger; tray is present on every screen; deletes go to the Recycle Bin; MTD panel renders the local + provider-reported pair.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story hardening, transport fallbacks, lint gates that enforce the constitution, packaging, and end-to-end validation.

- [ ] T132 [P] Add a CI grep/ESLint step in `S:/video-avatar/.github/workflows/ci.yml` that fails the build on any `eval(`, `new Function(`, or dynamic `require(` of a computed path anywhere in `src/`
- [ ] T133 [P] Implement the S3/R2 transport fallback at `S:/video-avatar/src/main/providers/transport.ts` — `put()` uploads via `@aws-sdk/client-s3` to the operator's configured bucket and returns a pre-signed URL via `@aws-sdk/s3-request-presigner` with a short TTL (15 min); R2 uses the same code with a different endpoint. Credentials from keychain target `Lumo/s3`.
- [ ] T134 [P] Implement the cloudflared transport fallback at `S:/video-avatar/src/main/providers/transport.ts` — spawns `cloudflared tunnel run --url http://localhost:<port>` pointing at an ephemeral `http` server serving the audio file; returns the tunnel URL and a `cleanup` callback that tears down both the server and the tunnel subprocess. Requires a configured `cloudflared` binary path (set in Settings from T125) and surfaces a clear error if missing.
- [ ] T135 [P] Add a CI check that forbids committed `.js` files under `src/` (Non-negotiable from constitution)
- [ ] T136 [P] Add a CI check that runs `tsc --noEmit` across all three trees and fails on any error
- [ ] T137 [P] Add a CI grep check that fails if any renderer or main file awaits an operation expected to exceed 5 s without rendering `AsyncFeedback` (T042) — enforces SC-002 structurally
- [ ] T138 [P] Audit every provider-facing error surface to confirm the provider's verbatim message is preserved (FR-053); add fixtures reproducing common provider errors at `S:/video-avatar/tests/fixtures/errors/`
- [ ] T139 [P] Performance pass on the script studio: measure Claude Code round-trip p95 on typical prompts; document the baseline at `S:/video-avatar/specs/001-lumo-v1/perf-baseline.md`
- [ ] T140 [P] Accessibility pass across screens (tab order, aria-labels on primary actions, contrast on cost previews)
- [ ] T141 Package a signed Windows installer via `electron-builder` driven by `S:/video-avatar/build/electron-builder.yml`; verify install on a clean Windows 11 VM
- [ ] T142 Run the quickstart validation at `S:/video-avatar/specs/001-lumo-v1/quickstart.md` against the packaged installer end-to-end; file any regressions as fresh tasks
- [ ] T143 [P] Keyboard-shortcut + async-feedback audit: confirm every primary action has a visible shortcut (FR-058), the six core screens are one keystroke from anywhere (FR-057), and every screen respects the AsyncFeedback contract (SC-002)
- [ ] T144 [P] Log-retention enforcement: wire the logger to drop `.jsonl` files older than the configured retention (default 14 days) on app start
- [ ] T145 [P] Redactor fuzz tests at `S:/video-avatar/tests/integration/redactor-fuzz.test.ts` — feed 10 000 random strings shaped like known secrets and assert zero escape
- [ ] T146 Contract test for all three transports at `S:/video-avatar/tests/contract/providers/transport.test.ts` — `heygen` default, `s3`/`r2` with a mocked S3 client, `cloudflared` with a stubbed spawn; covers fallback-resolve order per `contracts/provider-wrappers.md`
- [ ] T147 Final constitutional re-check: walk the plan's Constitution Check table against actual code and mark each row ✅ with a reference to the enforcing file

**Checkpoint**: Packaged installer, CI gates enforcing the non-negotiables (including the AsyncFeedback contract), all three transports available, quickstart validated end-to-end. Ready to cut v1.0.0.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no dependencies; start immediately.
- **Phase 2 (Foundational)** — depends on Phase 1; **blocks all user stories**. Includes the full Claude Code wrapper (T038), minimal projects CRUD + Home shell (T039–T040), settings foundation (T041), and the AsyncFeedback contract (T042) — all prerequisites for every story below.
- **Phase 3 (US1 / P1 MVP)** — depends on Phase 2. Delivering only this phase yields a working MVP (stock voice + stock avatar).
- **Phase 4 (US2 / P2)** — depends on Phase 2. Does not depend on US1, but enriches US1's pipeline when integrated via T079.
- **Phase 5 (US3 / P3)** — depends on Phase 2. Enriches US1 via T094.
- **Phase 6 (US4 / P4)** — depends on Phase 2. Operates on any avatar clip; does not require US2/US3 to be complete.
- **Phase 7 (US5 / P5)** — depends on Phase 2; may be interleaved with any story. The full projects CRUD (T117) builds on the minimal CRUD from T039; the full Home (T118) enriches the shell from T040.
- **Phase 8 (Polish)** — depends on whichever stories you intend to ship. Transport fallbacks (T133, T134) can land any time after T041 (settings) but before shipping if any operator needs a non-default transport.

### Within each user story

- Provider wrappers before job handlers before IPC handlers before screens.
- Component files marked `[P]` can be built by a second developer in parallel with the server-side work.
- Tests in each story run after implementation in this plan (the project isn't committed to TDD). If you want TDD, move the test tasks to immediately before their implementation and add a "MUST fail before implementation" note.

### Parallel opportunities

- Phase 1: T005–T015 all `[P]` — everything after the package.json + tsconfig boot is independent.
- Phase 2: T019–T023 (platform helpers), T027–T029 (data/settings scaffolding), T035–T037 (provider skeletons + errors + shortcuts), T040–T042 are all `[P]` once their prerequisites (T024–T026, T031) are green.
- Phase 3: after T044–T046 (providers real), T048 / T051 / T052 / T054 / T058 / T059 / T061 are all `[P]` and UI/linter-heavy; T063–T068 tests are all `[P]`.
- Phase 4: T071 (component), T076 (screen), T080–T081 (tests) are `[P]`.
- Phase 5: T085–T087 (services), T091–T092 (screen + panel), T095–T097 (tests) are `[P]`.
- Phase 6: T101–T105 (five seed templates) are fully `[P]`; T109–T111 (screen + preview + JSON editor) are `[P]`.
- Phase 7: T118–T119 (Home enrichment + delete dialog), T123–T126 (tray + Jobs + Settings + ProviderStatus) are `[P]`.
- Phase 8: every task except T141 / T142 / T146 / T147 is `[P]`.

---

## Parallel example: User Story 1

```bash
# After Phase 2 is green, launch these in parallel on a team of two:

# Developer A (server-side):
Task T044  # elevenlabs.ts full
Task T045  # heygen.ts full
Task T046  # transport heygen default
Task T049  # scripts IPC (list/generate/save/restore/assist)
Task T050  # script schema + system prompt
Task T052  # assist prompt library
Task T055  # cost estimator
Task T056  # generate IPC
Task T057  # avatarVideo job handler

# Developer B (client-side, [P] tasks):
Task T048  # KeyEntryDialog
Task T051  # spoken-word linter service
Task T053  # Script screen
Task T054  # AssistMenu + DiffPreview
Task T058  # Generate screen
Task T059  # CostPreview
Task T061  # listStock IPC (small, server but isolated)

# Both then land tests in parallel:
Task T063, T064, T065, T066, T067, T068  # all [P]
Task T069  # Playwright, runs last
```

---

## Implementation strategy

### MVP first (User Story 1 only)

1. Complete Phase 1 — project installs, lint passes.
2. Complete Phase 2 — app launches, DB migrates, logs flow, operator can create and open a project.
3. Complete Phase 3 — end-to-end video from a stock voice + stock avatar, including the spoken-word linter and Claude-driven assists on the Script screen.
4. **Stop, validate** against `quickstart.md` § "First project: stock-voice / stock-avatar end-to-end".
5. Ship internally / dogfood.

### Incremental delivery

1. Phase 1 + 2 → scaffolding ready.
2. + US1 → MVP video pipeline (ship).
3. + US2 → custom voice (ship).
4. + US3 → custom avatar (ship).
5. + US4 → branded composition (ship).
6. + US5 → operational polish (ship v1.0.0).

Each landing adds value without breaking any prior story.

### Parallel team strategy

With two developers post-Phase 2:
- Dev A takes US2 (voice lab is mostly self-contained).
- Dev B takes US4 (compose is cleanly separable with mock avatar clips).
- They converge on US3 (avatar lab), then US5 (polish) together.
- Phase 8 transport fallbacks (T133, T134) can be slotted into any quiet slot — they unblock operators who don't have HeyGen asset upload available.

---

## Notes

- Every `[P]` task is in its own file path.
- Every `[USn]` task maps 1:1 to a user story from `spec.md`.
- Every task has an absolute path inside `S:/video-avatar/`.
- Stop at any checkpoint to validate the story independently.
- Constitutional gates (no `eval`, secrets never on disk, one wrapper per provider, absolute paths only) and the SC-002 AsyncFeedback contract are enforced by lint/CI in Phase 8; do not rely on polish to catch violations introduced in earlier phases.
- `TransportKind` is `'heygen' | 's3' | 'r2' | 'cloudflared'`. The former `'direct'` term is deprecated and unused.
