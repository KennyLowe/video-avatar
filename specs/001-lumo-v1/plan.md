# Implementation Plan: Lumo v1 — Operator-driven avatar video pipeline

**Branch**: `001-lumo-v1` | **Date**: 2026-04-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-lumo-v1/spec.md`

## Summary

Lumo v1 is a Windows 11 desktop application that orchestrates Claude Code CLI, ElevenLabs, HeyGen, and Remotion to let a single operator turn a prompt into a branded lip-synced avatar video without leaving the app. Five prioritised user stories form the MVP surface: end-to-end stock-voice/stock-avatar pipeline (P1), custom PVC voice training (P2), custom HeyGen avatar training (P3), Remotion composition with prompt-driven prop filling (P4), and operational polish (P5). Technical approach: Electron + React + TypeScript; `better-sqlite3` per-project databases; Windows Credential Manager for secrets via `keytar`; `ffmpeg-static` bundled sidecar; Claude Code invoked per-call via `claude --print --output-format json`; HeyGen audio uploaded to `upload.heygen.com/v1/asset` and referenced by `audio_asset_id`; `@remotion/player` for live preview and `@remotion/renderer` for output; `@vladmandic/face-api` for warn-only pre-upload checks.

## Technical Context

**Language/Version**: TypeScript 5.5+ strict (no `.js` in source)
**Primary Dependencies**: Electron 31+, React 18, Vite 5, `better-sqlite3`, `keytar`, `zod`, `zod-to-json-schema`, `@remotion/player`, `@remotion/renderer`, `@remotion/bundler`, `@vladmandic/face-api`, `ffmpeg-static`, Claude Code CLI (installed on the operator's machine)
**Storage**: SQLite (one DB per project) via `better-sqlite3`; filesystem for blobs (audio, video, renders); Windows Credential Manager for secrets
**Testing**: Vitest for unit + contract tests; Playwright-Electron for UI integration tests; fixtures-based tests for provider wrappers (no live calls in CI)
**Target Platform**: Windows 11 x64 (Constitution non-negotiable; no macOS, no Linux)
**Project Type**: Desktop application (Electron with React renderer)
**Performance Goals**: Script generation round-trip ≤ 5 s p95 over average home broadband; avatar-video end-to-end subject to provider SLA (HeyGen typical 1–5 min for a 30 s clip); Remotion render of 60 s composed piece at 1080p30 ≤ 2 min on an 8-core machine; app cold start ≤ 3 s to first paint
**Constraints**: Offline-safe for local operations (recording, trimming, template preview, settings, history). Network required for every paid provider call. No telemetry, no cloud sync, no analytics. No feature may require the operator to open a terminal, edit a config file, or move files by hand between steps of a normal workflow (Constitution).
**Scale/Scope**: Single operator, single machine. ~12 top-level screens. ~58 functional requirements. 5 Remotion seed templates. Two concurrent long jobs max in practice (one train + one generate); worker handles more in principle.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Evaluating this plan against every principle, non-negotiable, technical invariant, and UX invariant in `.specify/memory/constitution.md` v1.0.0.

### Principles

| # | Principle | Plan complies? | Notes |
|---|-----------|----------------|-------|
| 1 | Boring tech, sharp edges hidden | ✅ | Electron + React + TS + Vite + `better-sqlite3` + `zod` + `keytar` + ffmpeg sidecar — exactly the stack the constitution names. |
| 2 | One operator, one machine | ✅ | No accounts. No cloud sync. No analytics/telemetry. State lives in the project folder and `%APPDATA%\Lumo`. |
| 3 | Secrets never touch disk in plaintext | ✅ | Keys via `keytar` to `Lumo/elevenlabs` and `Lumo/heygen`. Logger redacts known secret shapes. |
| 4 | Every long-running external job is resumable | ✅ | `jobs` table with provider job id; worker reconciles on launch; exponential back-off polling. |
| 5 | Errors are explicit, actionable, verbatim | ✅ | Provider wrappers surface `.message` verbatim plus next-step hints in UI strings (FR-053). |
| 6 | Async by default for long jobs, sync for short jobs | ✅ | Jobs tray persistent; no blocking modals on anything > 5 s. |
| 7 | AI output is always reviewable before it's consumed | ✅ | Script studio diff preview for assists (FR-013); compose step requires explicit approve (FR-035); prop-filling produces validated JSON shown before render (FR-039, FR-040). |
| 8 | Remotion components are typed templates, never free-form generated code | ✅ | Template contract ([contracts/remotion-template.md](./contracts/remotion-template.md)) requires `schema`, `defaultProps`, `durationInFrames`, `fps`, `Composition`. Claude returns JSON only. `schema.parse` gates every render. |
| 9 | Linear first, non-linear later | ✅ | Flow is onboarding → voice → avatar → script → generate → compose → render, matching constitution. Remixing is v2. |
| 10 | No feature ships in v1 that cannot be demonstrated end-to-end in v1 | ✅ | P1 is the end-to-end slice. Every other story is a standalone add-on tested against the same golden path. |

### Non-negotiables

| Rule | Compliance |
|------|------------|
| Windows 11 x64 only | ✅ No cross-platform code paths. |
| TypeScript throughout; no `.js` committed | ✅ ESLint blocks `.js` in `src/`. |
| Electron + Node 20+ + Vite dev + `electron-builder` | ✅ All specified in dependencies. |
| No `eval` of model-generated code, no `new Function`, no dynamic `require` of generated paths | ✅ Template contract enforces JSON-only model output. Lint rule `no-eval` + repo-wide grep check in CI. |
| One typed SDK wrapper per provider | ✅ `src/providers/claudeCode.ts`, `elevenlabs.ts`, `heygen.ts`, `transport.ts`, `remotion.ts`. No inline `fetch()` elsewhere. |
| All filesystem paths absolute and normalized via `path.resolve`/`path.join` | ✅ Data layer absolute-resolves every `_path` column on read; no string concat in source. |
| Claude Code default model `claude-opus-4-7` | ✅ Default in settings; configurable per invocation; not per build. |
| Cost preview before every paid operation | ✅ FR-048; `generate.costPreview` IPC; compose shows render cost (time-based, local). |
| No feature requires terminal or manual file moves in normal workflow | ✅ ffmpeg bundled; keys entered progressively; projects root is the only path the operator picks. |

### Technical invariants

| Rule | Compliance |
|------|------------|
| SQLite via `better-sqlite3` for state | ✅ One DB per project; WAL mode. |
| Filesystem for blobs; Windows Credential Manager for secrets via `keytar` | ✅ |
| JSONL logs to `%APPDATA%\Lumo\logs\<date>.jsonl`, rotated daily, secrets redacted | ✅ FR-052. |
| Persistent `jobs` table with provider job id; single worker with 5 s → 2 min back-off; reconcile on launch | ✅ Data model + worker contract. |
| Cancellation path per long job; best-effort remote cleanup | ✅ `jobs.cancel` IPC; provider wrappers expose `cancelVideo` etc. |
| Claude Code subprocess contract: `--print --output-format json --model <m>`; prompts > 4 KB via stdin; stdout JSON-parsed; stderr logged; per-call timeouts | ✅ `claudeCode.ts` wrapper. |
| Auto-update off by default for v1; manual installers | ✅ `electron-builder` config disables autoUpdater. |

### UX invariants

| Rule | Compliance |
|------|------------|
| Progressive disclosure of setup | ✅ Keys requested at point of first use (FR-002). |
| One primary action per screen; destructive confirms with object name | ✅ FR-058; delete-project UX confirms by name (FR-009). |
| Keyboard-first; single-keystroke navigation between core screens | ✅ FR-057. |
| Cost preview before spend; month-to-date displayed | ✅ FR-048, FR-050. |
| App owns disk layout below the projects root | ✅ FR-006, FR-007. |
| Latency never mysterious | ✅ Every long-running handler emits progress / ETA / "typically takes N min" hints (SC-002). |

**Gate result**: ✅ All constitutional items pass. No complexity exceptions needed. Proceeding to Phase 0.

## Technical Requirements — FR→Implementation mapping

`spec.md` is deliberately WHAT-only. Every concrete implementation decision — library, CLI invocation, endpoint, file format, credential-store target, field name, numeric threshold — is pinned here. Anything in `spec.md` that names a technology is either a product-level dependency (named in Assumptions) or is an error to be reported.

Each row below cites the spec requirement by ID, restates the WHAT, and pins the adopted HOW.

### Setup and credentials

| FR | WHAT (from spec) | HOW (adopted here) |
|----|------------------|--------------------|
| FR-001 | Verify AI assistant installed + operator-authenticated at launch; block all other features on failure. | `claudeCode.verifyInstalled()` probes `claude --version` for installed; runs a trivial `claude --print --output-format json` with a 5 s timeout for authenticated. Stdout is valid JSON → authenticated. Stderr matches `/not logged in|unauthorized|401/i` → not authenticated. Other non-zero exit → authenticated with warning. Home banner links to `winget install Anthropic.Claude` or `claude /login`. |
| FR-003 | Paid-service credentials in the OS secret store; never in files on disk. | `keytar` → Windows Credential Manager. Targets: `Lumo/elevenlabs`, `Lumo/heygen`, `Lumo/s3` (optional). Accounts are always `default`. No cache in a module-level variable — each provider call fetches fresh. |
| FR-004 | Test action performs a lightweight authenticated round-trip. | ElevenLabs: `GET /v1/user`. HeyGen: `GET /v2/user/remaining_quota` (or equivalent current endpoint verified at implementation time). |

### Project management

| FR | WHAT (from spec) | HOW |
|----|------------------|-----|
| FR-007 | Project is a folder with a known, stable layout. | `<project>/project.json` (metadata), `<project>/state.db` (per-project SQLite via `better-sqlite3` in WAL mode), and subfolders `audio/takes`, `audio/tts`, `video/source`, `video/segments`, `video/avatar`, `scripts`, `renders`, `templates`, `logs`. Slug disambiguation via numeric suffix on collision. |
| FR-009 | Delete to OS recycle/trash, not hard delete. | `shell.trashItem` (Electron). |

### Script studio

| FR | WHAT | HOW |
|----|------|-----|
| FR-010 | AI assistant generates structured script; response validated against a published schema. | Claude Code CLI: `claude --print --output-format json --model claude-opus-4-7`. Zod schema `ScriptResponseSchema = z.object({ title, body, estimatedDurationSeconds, chapters? })` in `src/shared/schemas/script.ts`. |
| FR-013 | Selection-driven assist actions invoke the AI assistant once with diff preview. | One system prompt per action in `src/main/services/assistPrompts.ts`. Monaco editor selection → `scripts.assist` IPC → Claude Code → diff preview component → explicit Apply gate. |

### Voice lab

| FR | WHAT | HOW |
|----|------|-----|
| FR-015 | Broadcast-grade mono recording. | 48 kHz mono 24-bit WAV via `MediaRecorder` + Web Audio API. Files at `audio/takes/<timestamp>.wav`. |
| FR-016 | Import common audio formats and normalise. | Drag-and-drop WAV/MP3/FLAC/M4A/OGG. Normalisation via bundled `ffmpeg-static` sidecar to the recording format. |
| FR-018 | Query voice service's PVC minimum at submit time. | ElevenLabs library helper `getPvcMinimumSeconds()` / `getIvcMinimumSeconds()` with cached fallbacks of 1800 s / 60 s (per `research.md` §2). |
| FR-021 | Persist voice-training jobs. | `jobs` row with `kind='voice_train'`, `provider='elevenlabs'`, polled until ready; toast via Electron `Notification` on completion. |

### Avatar lab

| FR | WHAT | HOW |
|----|------|-----|
| FR-023 | Tier selector drives importer, checks, and endpoint. | `src/renderer/screens/Avatar.tsx` branches on `tier: 'photo' \| 'instant'`. Endpoints: `POST /v2/photo_avatar/train` vs the Digital Twin video-avatar flow (exact path verified against `developers.heygen.com` at implementation time; captured in `research.md` §1). |
| FR-026 | Grab frame from video. | `ffmpeg -ss <t> -i <src> -frames:v 1 -y <out.png>`. |
| FR-027 | Quality heuristics with concrete thresholds. | `src/renderer/services/qualityHeuristics.ts` applies: video short-edge < 1080 px → warn; image short-edge < 1024 px → warn; face coverage < 90 % of sampled frames → warn; multi-face on any sampled frame → warn (video) / reject (image); inter-frame pixel delta > 15 % → warn; Laplacian variance < 120 → warn. Face detection via `@vladmandic/face-api` (TF.js WebGL). |
| FR-028 | Persist avatar-training jobs. | `jobs` row with `kind='avatar_train'`, `provider='heygen'`. |

### Avatar video generation

| FR | WHAT | HOW |
|----|------|-----|
| FR-033 | Pipeline: synthesise → transfer → generate → poll → download. | `src/main/workers/handlers/avatarVideo.ts` as one job (`kind='avatar_video'`). TTS to `<project>/audio/tts/<uuid>.mp3` via ElevenLabs `POST /v1/text-to-speech/{voice_id}`. Transfer via resolved `TransportKind`. Generate via HeyGen `/v2/video/generate` (Standard) or `/v2/video/av4/generate` (Avatar IV). Poll `/v1/video_status.get`. Download the resulting MP4 into `video/avatar/`. |
| FR-034 | Configurable audio transport with default + fallbacks. | `TransportKind = 'heygen' \| 's3' \| 'r2' \| 'cloudflared'`. Default `'heygen'` uploads to `POST https://upload.heygen.com/v1/asset` (raw binary, `Content-Type: audio/mpeg`, `X-API-KEY` header) and references the returned id as `audio_asset_id`. `'s3'`/`'r2'` via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` with 15 min TTL. `'cloudflared'` spawns `cloudflared tunnel run --url http://localhost:<port>`. Resolver order: configured default → remaining in `['heygen','s3','r2','cloudflared']` order. |

### Composition studio

| FR | WHAT | HOW |
|----|------|-----|
| FR-037 | Required template parts: schema, default values, duration, fps, composition root. | Every `.tsx` template MUST export `schema` (Zod), `defaultProps` (matching `schema`), `durationInFrames` (number or function), `fps` (number), `Composition` (React component). Missing export → `validity: 'invalid-missing-<exportName>'`. See `contracts/remotion-template.md`. |
| FR-039 | Schema → machine-readable description → AI assistant → validate response. | `zod-to-json-schema` produces JSON Schema from the Zod schema; sent to Claude Code as part of the prompt; response parsed by `template.schema.parse`. |
| FR-041 | Interactive preview + render into renders area. | `@remotion/player` in renderer (React component); `@remotion/renderer.renderMedia` in main. Output at `<project>/renders/<slug>-<iso-timestamp>.mp4` (Windows-safe filename — no colons). |
| FR-042 | Three named quality presets mapping to encoder settings. | Preset → ffmpeg flags: `fast = {preset: 'veryfast', crf: 26}`, `balanced = {preset: 'medium', crf: 22}`, `quality = {preset: 'slow', crf: 18}`. Audio: AAC 192 kbit/s default. Cancellation removes partial `.mp4` and any temp directories. |

### Jobs, notifications, persistence

| FR | WHAT | HOW |
|----|------|-----|
| FR-044 | Persisted jobs with back-off polling. | `jobs` SQLite table (columns per `data-model.md`). Single worker in `src/main/workers/jobQueue.ts`. Back-off schedule: 5 s → 10 s → 20 s → 40 s → 80 s → 120 s cap. Abort via `AbortSignal` on `jobs.cancel`. |
| FR-045 | Reconcile active jobs against services on launch. | `src/main/workers/reconciler.ts` runs before the queue accepts new work. |
| FR-047 | OS native notification on job completion. | Electron `Notification` API; platform ships Windows toasts. |

### Observability and errors

| FR | WHAT | HOW |
|----|------|-----|
| FR-052 | Structured, daily-rotated logs with credentials redacted. | JSONL at `%APPDATA%/Lumo/logs/YYYY-MM-DD.jsonl`. Rotation on first write of each day. Redactor at `src/main/services/redactor.ts` scrubs known shapes: ElevenLabs `xi-api-key`, HeyGen `x-api-key`, bearer tokens, AWS pre-signed URL `X-Amz-Signature=` params, Cloudflare tunnel hostnames. |

### Security and safety

| FR | WHAT | HOW |
|----|------|-----|
| FR-054 | No AI-assistant output ever executed as code. | Lint rule `no-eval`; CI grep fails on `eval(\|new Function(\|require\(` of a computed path under `src/`. Every AI-generated payload is JSON parsed once and validated by a Zod schema before any use. |
| FR-055 | Paths via runtime API, not string concat. | `path.resolve` / `path.join` (Node). Custom ESLint rule `.eslint-rules/no-string-concat-paths.cjs`. |
| FR-056 | Auto-update off for v1. | `electron-builder.yml` sets `publish: null`; no `autoUpdater` import in `src/main/`. |

### Success criteria — buildable contracts

| SC | WHAT | HOW |
|----|------|-----|
| SC-002 | Every async > 5 s shows one of progress / ETA / typical-time hint. | A shared component type at `src/renderer/components/AsyncFeedback.tsx` with discriminated union `kind: 'progress' \| 'eta' \| 'typical'`. Every screen that `await`s an operation expected to exceed 5 s MUST render an `<AsyncFeedback>` bound to the operation. CI grep fails the build if a renderer file awaits a known long-running IPC channel without `<AsyncFeedback>` in its JSX. |
| SC-006 | No credential ever outside the OS secret store. | Redactor fuzz test at `tests/integration/redactor-fuzz.test.ts` feeds 10 000 random strings shaped like known credentials and asserts zero escape. CI grep scans all JSONL log fixtures for the redactor's bypass patterns. |

Anything not listed above has no HOW worth pinning beyond what lives in `data-model.md` or `contracts/`.

## Project Structure

### Documentation (this feature)

```text
specs/001-lumo-v1/
├── plan.md                  # This file (/speckit.plan output)
├── spec.md                  # Feature spec (/speckit.specify output)
├── research.md              # Phase 0 output — 6 plan-time decisions resolved
├── data-model.md            # Phase 1 output — entities, tables, state machines, storage map
├── quickstart.md            # Phase 1 output — operator's first 5 minutes
├── contracts/               # Phase 1 output — interface contracts
│   ├── provider-wrappers.md # Typed wrapper per provider (Claude Code, ElevenLabs, HeyGen, Remotion, transport)
│   ├── ipc-bridge.md        # window.lumo.* channels between renderer and main
│   └── remotion-template.md # Required exports + prop-filling protocol
├── checklists/
│   └── requirements.md      # Spec quality checklist (all pass)
└── tasks.md                 # Phase 2 output — NOT created by /speckit.plan
```

### Source Code (repository root)

Single-project Electron app with three source trees (main, preload, renderer) sharing typed contracts:

```text
resources/
├── templates/                     # Bundled Remotion templates (.tsx)
│   ├── LogoIntro.tsx
│   ├── LowerThird.tsx
│   ├── FullExplainer.tsx
│   ├── TitleSlide.tsx
│   └── ChapterCard.tsx
└── ffmpeg/                        # ffmpeg-static resolves here at install time

src/
├── main/                          # Electron main process
│   ├── bootstrap.ts               # app lifecycle, window creation
│   ├── ipc/                       # typed IPC handlers, one file per channel group
│   │   ├── projects.ts
│   │   ├── credentials.ts
│   │   ├── voices.ts
│   │   ├── avatars.ts
│   │   ├── scripts.ts
│   │   ├── generate.ts
│   │   ├── compose.ts
│   │   ├── jobs.ts
│   │   ├── costs.ts
│   │   └── settings.ts
│   ├── providers/                 # One typed wrapper per external capability
│   │   ├── claudeCode.ts
│   │   ├── elevenlabs.ts
│   │   ├── heygen.ts
│   │   ├── transport.ts           # heygen (default) | s3 | r2 | cloudflared
│   │   └── remotion.ts            # bundler + renderer
│   ├── data/                      # SQLite layer
│   │   ├── db.ts                  # per-project connection pool
│   │   ├── migrations/
│   │   │   └── 0001_init.sql
│   │   └── repositories/          # one file per entity
│   │       ├── projects.ts
│   │       ├── voices.ts
│   │       ├── takes.ts
│   │       ├── avatars.ts
│   │       ├── segments.ts
│   │       ├── scripts.ts
│   │       ├── renders.ts
│   │       ├── jobs.ts
│   │       └── costs.ts
│   ├── workers/
│   │   ├── jobQueue.ts            # polls jobs with exponential back-off
│   │   ├── reconciler.ts          # on-launch reconciliation against each provider
│   │   └── handlers/              # one per long-running job kind
│   │       ├── voiceTrain.ts
│   │       ├── avatarTrain.ts
│   │       ├── avatarVideo.ts     # orchestrates TTS → upload → lip-sync → download in one job
│   │       └── render.ts
│   ├── services/                  # higher-order orchestration
│   │   ├── costEstimator.ts
│   │   ├── templateLoader.ts
│   │   ├── faceDetect.ts          # @vladmandic/face-api adapter (called from renderer via IPC)
│   │   └── redactor.ts            # secret-shape redaction for logs + errors
│   ├── logging/
│   │   └── jsonl.ts
│   └── platform/
│       ├── keychain.ts            # keytar wrapper
│       ├── paths.ts               # %APPDATA%\Lumo, projects-root resolution
│       └── notifier.ts            # Windows toast notifications
├── preload/
│   └── index.ts                   # exposes window.lumo.* typed bridge
├── renderer/                      # React UI (Vite-served in dev, file:// in prod)
│   ├── main.tsx
│   ├── App.tsx
│   ├── screens/
│   │   ├── Home.tsx
│   │   ├── Voice.tsx
│   │   ├── Avatar.tsx
│   │   ├── Script.tsx
│   │   ├── Generate.tsx
│   │   ├── Compose.tsx
│   │   ├── Jobs.tsx
│   │   └── Settings.tsx
│   ├── components/
│   │   ├── JobsTray.tsx
│   │   ├── CostPreview.tsx
│   │   ├── ProviderStatus.tsx
│   │   ├── WaveformMeter.tsx
│   │   ├── MonacoEditor.tsx
│   │   ├── RemotionPreview.tsx    # wraps @remotion/player
│   │   └── FaceDetectPanel.tsx
│   ├── hooks/
│   │   ├── useJobs.ts
│   │   ├── useCosts.ts
│   │   └── useKeyboardShortcuts.ts
│   └── lib/
│       └── lumo.ts                # strongly-typed proxy over window.lumo.*
├── shared/                        # types and schemas referenced by main + renderer
│   ├── schemas/                   # zod schemas for IPC inputs/outputs
│   │   ├── projects.ts
│   │   ├── scripts.ts
│   │   └── ...
│   └── types/
└── bin/
    └── smoke.ts                   # internal end-to-end smoke script

tests/
├── contract/                      # zod schema + wrapper shape tests (no network)
│   ├── providers/
│   │   ├── claudeCode.test.ts
│   │   ├── elevenlabs.test.ts
│   │   ├── heygen.test.ts
│   │   └── transport.test.ts
│   ├── ipc/
│   │   └── bridge.test.ts
│   └── remotion-template.test.ts
├── integration/                   # real or recorded HTTP fixtures; file I/O allowed
│   ├── jobQueue.test.ts
│   ├── reconciler.test.ts
│   ├── costLedger.test.ts
│   └── projectsLifecycle.test.ts
├── ui/                            # Playwright-Electron; golden flows
│   ├── p1-end-to-end.spec.ts
│   ├── p2-pvc-training.spec.ts
│   ├── p3-avatar-training.spec.ts
│   ├── p4-compose.spec.ts
│   └── p5-cost-and-jobs.spec.ts
└── fixtures/
    ├── heygen/
    ├── elevenlabs/
    └── claudecode/

build/
├── electron-builder.yml
└── icons/

.specify/                          # Spec Kit artifacts (untouched by app build)
```

**Structure Decision**: Single-project Electron app with a clear main/preload/renderer split. The `shared/` tree holds Zod schemas and types referenced by both sides of the IPC boundary so every call is type-checked end-to-end. Providers are confined to `src/main/providers/` with no other module performing outbound network I/O (lint rule blocks inline `fetch()` elsewhere). Tests are categorised into contract (fast, offline), integration (SQLite + fixtures, no live network), and UI (Playwright-Electron against the built binary with recorded provider responses).

## Complexity Tracking

No constitutional violations; table intentionally left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Phase 0: Outline & Research

Complete. See [research.md](./research.md). Six open questions from the source spec resolved with decisions, rationale, and sources:

1. HeyGen API endpoint mapping — v2 endpoints; audio via `upload.heygen.com/v1/asset` referenced as `audio_asset_id`.
2. ElevenLabs PVC/IVC defaults — 30 min PVC hint, 1 min IVC hint; live-query at submit.
3. Remotion embed — `@remotion/player` inside the renderer; Studio is not embeddable.
4. Audio transport — HeyGen Upload Asset first; S3/R2 fallback; cloudflared last.
5. Face detection — `@vladmandic/face-api` in renderer, warn-only.
6. Claude Code subprocess — one per invocation; revisit stream-json only on measured churn.

Plus one bonus decision from the source spec: bundle ffmpeg via `ffmpeg-static`.

## Phase 1: Design & Contracts

Complete. Artifacts:

- **[data-model.md](./data-model.md)** — storage map (file layout + DB + keychain), every entity (Project, Voice, Take, Avatar, Segment, Script, Template, Render, Job, Cost entry, Credential target, Upload transport), column-level fields where durable, state machines for Voice/Avatar/Render/Job, cross-entity invariants, migration strategy.
- **[contracts/provider-wrappers.md](./contracts/provider-wrappers.md)** — typed interface per provider (`claudeCode`, `elevenlabs`, `heygen`, `remotion`, `transport`); cross-cutting rules (credentials at call time, verbatim errors, no retry, abort signals).
- **[contracts/ipc-bridge.md](./contracts/ipc-bridge.md)** — `window.lumo.*` channels grouped by domain (projects, credentials, voices, avatars, scripts, generate, compose, jobs, costs, settings); input validation via Zod; `jobs.onUpdate` as the only push channel.
- **[contracts/remotion-template.md](./contracts/remotion-template.md)** — required exports, loader behaviour (both bundled and per-project), prop-filling protocol (schema → JSON Schema → Claude Code → `schema.parse` with one retry on validation error → JSON editor on second failure), render contract, security invariants.

**Agent context update**: The PowerShell helper `update-agent-context.ps1` fails in this environment because it calls `New-TemporaryFile`, which is missing from the locally installed Windows PowerShell. The file `CLAUDE.md` at the repo root is therefore written directly by this command.

## Re-check Constitution (post-design)

Re-evaluating after Phase 1 artifacts exist:

- Provider wrappers (contracts/provider-wrappers.md) make inline `fetch()` impossible to land without a lint error — reinforces Non-negotiable #4.
- The IPC bridge (contracts/ipc-bridge.md) gates every long operation through `jobs.*`, making resumability a structural property, not a convention — reinforces Principle #4.
- The Remotion template contract (contracts/remotion-template.md) structurally forbids any path from model text to executable code — reinforces Principle #8 and the `no eval` non-negotiable.
- The data model's redaction step on `jobs.error` and the logger's redactor both target the same library of known secret shapes — reinforces Principle #3.

**Gate result (post-design)**: ✅ No regressions. No new complexity introduced. Plan complete; ready for `/speckit.tasks`.
