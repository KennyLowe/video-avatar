# Feature Specification: Lumo v1 — Operator-driven avatar video pipeline

**Feature Branch**: `001-lumo-v1`
**Created**: 2026-04-17
**Status**: Draft
**Input**: User description: "in this folder is a spec.md file. Read it and use this as the spec for this project." (source document: `/spec.md` at repo root)

## User Scenarios & Testing *(mandatory)*

Stories are ordered so that each one delivers standalone operator value. Implementing only P1 yields a usable app that can take a prompt and return an MP4 of a talking avatar. P2, P3, P4, P5 each add independently testable capability on top.

### User Story 1 - End-to-end avatar video from prompt, using stock voice and stock avatar (Priority: P1)

A single operator on a fresh Windows 11 machine types a prompt, gets back a script, approves it, picks a generation mode, and receives an MP4 of a stock HeyGen avatar speaking the script in a stock voice. No training required. This is the minimum viable slice of the pipeline and proves every external integration is wired end-to-end.

**Why this priority**: This is the load-bearing capability. If it works, the app has demonstrated script generation, TTS, audio transport to HeyGen, lip-sync generation, and job persistence. Every other story is either enrichment (higher-quality inputs) or polish around this core. Without P1 working, nothing else matters.

**Independent Test**: On a clean install with Claude Code authenticated and ElevenLabs + HeyGen API keys configured, operator enters a one-line prompt in the script studio, accepts the generated script, selects a stock voice and stock avatar, clicks Run, and within the provider's published SLA receives an MP4 in the project's renders folder. The MP4 plays and the audio is lip-synced to the avatar.

**Acceptance Scenarios**:

1. **Given** a new project with no trained voice and no trained avatar, **When** the operator generates a script, picks a stock voice + stock avatar + Standard mode, and runs the pipeline, **Then** the app produces an MP4 at `<project>/video/avatar/<id>.mp4` with lip-synced audio matching the script, and a cost preview was shown before the run.
2. **Given** an in-flight avatar video job, **When** the operator closes the app and reopens it, **Then** the job reappears in the jobs tray with its correct status, polling resumes, and on completion the MP4 is downloaded and a Windows toast notification fires.
3. **Given** an invalid audio upload transport configuration (no S3/R2 and no cloudflared available), **When** the operator runs the pipeline, **Then** the app surfaces the specific transport failure with the provider's verbatim error and a concrete next-step suggestion, and no partial MP4 is written.

---

### User Story 2 - Train and use a custom Professional Voice Clone (Priority: P2)

The operator records or imports voice samples, marks good takes, submits them for Professional Voice Clone (PVC) training, closes the app, and hours later finds a production-quality voice attached to the project. Subsequent avatar videos use that voice instead of the stock voice.

**Why this priority**: Custom voice is the primary differentiator for spoken-register content and is the spec's "standard path." It is independently testable (the voice can be previewed with any text before being used in a full video) but depends on P1 existing only at the point of first use in a full render.

**Independent Test**: Operator records ≥ 30 minutes of good takes in-app (or imports equivalent audio), submits for PVC training, closes the app, reopens hours later, and the voice appears in the voices list with status "ready." A 10-second preview of that voice saying arbitrary text plays inline.

**Acceptance Scenarios**:

1. **Given** a project with zero good takes, **When** the operator attempts to submit for PVC training, **Then** the submit button is disabled, the UI explains the current-vs-required minutes, and no request is sent to ElevenLabs.
2. **Given** a PVC job submitted three hours ago, **When** the operator reopens the app, **Then** the worker reconciles the job status with ElevenLabs before accepting any new work, and the operator is notified of completion via a Windows toast.
3. **Given** an Instant Voice Clone (IVC) quick-test action, **When** the operator invokes it, **Then** the UI labels it as "for testing the pipeline only, not recommended for final production" and completes in seconds.

---

### User Story 3 - Train and use a custom HeyGen avatar (Priority: P3)

The operator picks a HeyGen avatar tier (Photo Avatar or Instant Avatar), imports source material, optionally selects clean segments, and submits for training. On completion the trained avatar is attached to the project and used in subsequent generations.

**Why this priority**: Custom avatar is the second differentiator. Photo Avatar is fast; Instant Avatar requires 2–5 minutes of clean video. Both paths are independently testable — the trained avatar can produce a 5-second preview saying a canned phrase.

**Independent Test**: Operator selects Instant Avatar, imports 2+ minutes of video, marks clean segments, submits for training, receives the trained avatar back, and renders a 5-second preview of it speaking a canned phrase in a default voice.

**Acceptance Scenarios**:

1. **Given** a 1080p video with a face detected on all sampled frames, **When** the operator imports it, **Then** the quality heuristics pass and the importer allows segment selection.
2. **Given** a video with motion or multiple faces detected on > 10% of sampled frames, **When** the operator imports it, **Then** the app surfaces a warning with the specific failing check, and the operator can still proceed explicitly.
3. **Given** a submitted avatar-train job, **When** the operator cancels it from the jobs tray, **Then** the app best-effort cancels the remote HeyGen resource and marks the job canceled locally.

---

### User Story 4 - Compose a branded final video with intro, outro, and overlays (Priority: P4)

The operator picks a Remotion template, writes a natural-language prompt ("Dell blue #0076CE, title 'Azure Local rack awareness', subtitle 'Kenny Lowe — Dell TME'"), and Lumo fills the template's props, previews the composition, and renders a composed MP4 with the avatar clip as the body.

**Why this priority**: Composition is pure enrichment over P1's raw avatar clip. It is independently testable with any MP4 as the body (the avatar clip can be stock output or a placeholder).

**Independent Test**: Operator picks the FullExplainer template, enters a prompt describing brand colour and titles, and renders a composed MP4 where the intro animation runs, the body avatar clip plays, and the outro animation runs, all styled with the requested brand colour.

**Acceptance Scenarios**:

1. **Given** a template's Zod schema and default props, **When** Claude Code returns a JSON object that fails schema validation, **Then** Lumo retries once with the validation error appended, and on a second failure surfaces the error and opens a JSON editor for manual prop editing.
2. **Given** a custom `.tsx` template dropped into `<project>/templates/` that is missing the `defaultProps` export, **When** the operator opens the template picker, **Then** the template is listed as invalid with the specific missing export named, and is not loadable.
3. **Given** a render in progress, **When** the operator clicks cancel, **Then** the render stops within seconds and no partial output file remains in `renders/`.

---

### User Story 5 - Operational polish: project management, cost visibility, jobs tray, settings (Priority: P5)

The operator manages multiple projects, sees month-to-date spend per provider, reviews job history, exports a CSV ledger, and configures render defaults, upload transport, and log retention. Delete is safe (Recycle Bin, two-step confirm).

**Why this priority**: These are ergonomics. Missing any one degrades daily use but does not block producing a video. Each sub-capability (cost export, project duplicate, settings changes) is independently testable.

**Independent Test**: Operator creates a project, produces a small paid operation, opens the cost panel, verifies month-to-date reflects the operation, exports a CSV, and the CSV contains a row with the expected provider, units, and USD estimate. Separately, operator deletes a project and recovers it from the Windows Recycle Bin.

**Acceptance Scenarios**:

1. **Given** a paid operation (TTS or avatar-video generation), **When** it completes, **Then** a row is appended to the costs ledger with timestamp, provider, operation, units, unit kind, USD estimate, project id, and job id, and the month-to-date figure updates everywhere it is displayed.
2. **Given** the operator clicks Delete on a project, **When** the two-step confirmation is completed, **Then** the project folder is moved to Windows Recycle Bin (not hard-deleted) and disappears from the Home screen.
3. **Given** a log level set to "trace," **When** any provider call fires, **Then** the request (with secrets redacted) and response are written to today's JSONL log, and rotated logs older than the configured retention are removed.

---

### Edge Cases

- **Claude Code missing or unauthenticated at launch**: Home screen shows a non-dismissible banner with the exact shell command to fix (`winget install Anthropic.Claude` or `claude /login`) and a Recheck button. No other feature is reachable until resolved.
- **ElevenLabs or HeyGen key rejected at Test**: The Test button surfaces the provider's verbatim error message; the key is not saved; the operator remains on the key-entry screen.
- **Operator closes laptop mid-training**: Any active PVC or avatar-train job is persisted in the `jobs` table; on next launch, the worker reconciles with the provider before accepting new jobs, and the operator sees the current status in the tray.
- **PVC submission below minimum minutes**: Submit is disabled; the UI states current vs required and refuses to submit.
- **Audio transport has no S3/R2 credentials and cloudflared is not on PATH**: Pipeline fails fast at the upload step with a specific actionable error; no HeyGen call is attempted.
- **Claude Code returns malformed JSON for a script or template props**: For scripts, the raw response is shown with an edit affordance. For template props, retry once with the validation error appended; on second failure surface the error and open a JSON editor.
- **Operator cancels an in-flight avatar video**: App calls the provider's cancel endpoint best-effort; local job status becomes `canceled`; no partial MP4 is downloaded.
- **Two projects share a name slug**: The app disambiguates with a numeric suffix on the folder; `project.json` retains the operator's exact name.
- **Provider returns an error containing a secret** (e.g., echoes back the API key): The app redacts known secret shapes before logging and before surfacing to the UI.
- **Regenerate on an already-rendered avatar video**: Warns of repeat cost with the dollar estimate before re-running.

## Requirements *(mandatory)*

### Functional Requirements

**Setup and credentials**

- **FR-001**: The system MUST verify at launch that the Claude Code CLI is installed and authenticated (`claude --version`) without requesting any Anthropic credential from the operator, and MUST block all other features until verified.
- **FR-002**: The system MUST request each paid-provider API key (ElevenLabs, HeyGen) progressively at the point of first use, not in a monolithic onboarding form.
- **FR-003**: The system MUST store provider API keys in the Windows Credential Manager under named targets (`Lumo/elevenlabs`, `Lumo/heygen`), never in configuration files, environment files, or logs.
- **FR-004**: The system MUST provide a Test action on each key-entry screen that makes a lightweight authenticated call to the provider and reports plan name and/or month-to-date usage when the provider exposes them.
- **FR-005**: The system MUST offer a Provider Status page summarising per-provider: authenticated yes/no, plan name, month-to-date usage, and a link to the provider's dashboard.

**Project management**

- **FR-006**: The system MUST let the operator choose a projects-root directory and MUST own every sub-path beneath it (naming, nesting, cleanup).
- **FR-007**: Each project MUST be a folder with a known layout: `project.json`, `state.db`, and standard sub-folders for audio takes, TTS output, source video, segmented video, avatar video, scripts, renders, optional custom templates, and logs.
- **FR-008**: The Home screen MUST list projects with last-modified, last-render thumbnail, and per-project actions: open, rename, duplicate, delete, and reveal in Explorer.
- **FR-009**: Delete MUST require an explicit two-step confirmation that types or matches the project name, and MUST move the project folder to the Windows Recycle Bin rather than hard-deleting.

**Script studio**

- **FR-010**: The system MUST generate scripts by invoking the Claude Code CLI with the default model `claude-opus-4-7`, producing JSON that conforms to a published schema (title, body, estimated duration, optional chapters).
- **FR-011**: The script editor MUST show a spoken-word linter that flags parenthetical asides, bullet lists, URL literals, and acronyms without first-use expansion.
- **FR-012**: The system MUST display live word count, character count, and estimated spoken duration using the operator-configured words-per-minute default.
- **FR-013**: The system MUST offer selection-driven assist actions (Tighten, Less corporate, Break into chapters, Add hook, Convert jargon) that each invoke Claude Code once and present a diff preview that the operator MUST accept before it replaces the selection.
- **FR-014**: Every save of a script MUST write a new immutable version file `scripts/<slug>-v<n>.md`; prior versions MUST be browsable and restorable.

**Voice lab**

- **FR-015**: The system MUST record audio in 48 kHz mono 24-bit WAV, support pause/resume during recording, and show a live RMS + peak meter and live waveform.
- **FR-016**: The system MUST accept drag-and-drop import of WAV, MP3, FLAC, M4A, and OGG, normalising each to the recording format via the bundled ffmpeg sidecar.
- **FR-017**: The system MUST let the operator mark each take as good or bad, trim via in/out handles, and display running totals of good seconds and good minutes.
- **FR-018**: The system MUST offer Professional Voice Clone (PVC) training as the primary action, checking the current ElevenLabs PVC minimum-minutes threshold at submit time rather than hard-coding it.
- **FR-019**: The system MUST offer Instant Voice Clone (IVC) only as a clearly labelled "quick test" action, and the UI MUST discourage it for production output.
- **FR-020**: The system MUST refuse to submit either training job when the corresponding minimum is not met and MUST explain the gap numerically.
- **FR-021**: The system MUST persist the voice training job with `kind='voice_train'` and `tier` set, and MUST fire a Windows toast notification and move the voice from training to ready on completion.
- **FR-022**: The system MUST provide an inline "Say this: [text]" preview that generates a 10-second sample using the trained voice, and MUST support side-by-side A/B playback of two voices.

**Avatar lab**

- **FR-023**: The system MUST present a tier selector between Photo Avatar and Instant Avatar, and MUST drive the rest of the screen's UI (importer accepted types, quality checks, target endpoint) from that selection.
- **FR-024**: The system MUST accept drag-and-drop import for each tier's accepted types (images for Photo Avatar; MP4/MOV/WebM for Instant Avatar) and MUST display probe metadata (duration, resolution, frame rate, codec, file size) for videos.
- **FR-025**: The system MUST let the operator mark 1–N (in, out) segments per source video and extract each segment to disk without re-encoding where possible.
- **FR-026**: The system MUST offer a "grab frame from video" tool for Photo Avatar, producing a PNG from any point in an imported clip.
- **FR-027**: The system MUST run pre-upload quality heuristics: resolution, face-detection coverage, multi-face detection, and motion/sharpness estimates; failures MUST be informational warnings that the operator can override.
- **FR-028**: The system MUST persist the avatar training job with `kind='avatar_train'` and `tier` set, and MUST fire a completion notification with the trained `avatar_id` written to the avatars table.
- **FR-029**: The system MUST provide a 5-second preview of the trained avatar saying a canned phrase in the project's voice or a default HeyGen voice.

**Avatar video generation**

- **FR-030**: The Generate screen MUST require the operator to pick a voice, an avatar, a script, and a generation mode (Standard or Avatar IV) before the Run action becomes enabled.
- **FR-031**: The system MUST disable generation modes incompatible with the selected avatar tier, with an inline explanation of why.
- **FR-032**: Before the operator confirms a paid run, the system MUST display a cost preview showing ElevenLabs character count and credit burn, HeyGen estimated minutes and credit burn (including the Avatar IV premium-credit multiplier), total USD estimate, month-to-date per provider, and plan headroom.
- **FR-033**: Run pipeline MUST execute in order: TTS synthesis to a local file; upload of the audio via the configured transport (S3/R2, cloudflared tunnel, or direct if supported); HeyGen video-generation call with `avatar_id` and audio URL; background polling until completion; download of the resulting MP4 into `video/avatar/`.
- **FR-034**: The audio-upload transport MUST be configurable per project with at least S3/R2, local cloudflared tunnel, and direct-upload (where HeyGen supports it) as options.
- **FR-035**: A completed avatar video MUST offer an inline preview with a Regenerate action that warns of repeat cost, and an Approve-and-continue action that advances to the Compose screen.

**Composition studio**

- **FR-036**: The system MUST ship a library of seed Remotion templates in the app bundle: LogoIntro, LowerThird, FullExplainer, TitleSlide, ChapterCard.
- **FR-037**: Every template MUST expose `schema` (Zod), `defaultProps`, `durationInFrames`, `fps`, and a `Composition` React component. Templates missing any of these MUST be reported as invalid, naming the specific missing export, and MUST NOT be loadable.
- **FR-038**: The system MUST allow operators to drop custom `.tsx` templates into `<project>/templates/` and MUST apply the same validity check.
- **FR-039**: The prompt-to-props flow MUST convert the template's Zod schema to JSON Schema, send the JSON Schema + default props + operator prompt to Claude Code, and validate the returned JSON with `schema.parse()` before use.
- **FR-040**: On `schema.parse()` failure the system MUST retry once with the validation error appended to the prompt, and on second failure MUST surface the error and open a JSON editor for manual prop editing. The system MUST NEVER execute or evaluate model-generated code.
- **FR-041**: The Composition screen MUST embed an interactive preview with play/pause, scrub, and live props editing, and MUST render output via the Remotion renderer into `renders/<slug>-<timestamp>.mp4`.
- **FR-042**: Render settings MUST include resolution (1080p30 default, 1080p60, 4K30), codec (h264, h265), quality preset (fast/balanced/quality), and audio bitrate, and renders MUST be cancellable.

**Jobs, notifications, and persistence**

- **FR-043**: The system MUST display a persistent Jobs tray at the bottom of every window that collapses to count + most-recent status and expands (click or `Ctrl+J`) to a full list with provider, kind, elapsed time, progress, cancel, and show-log per entry.
- **FR-044**: Every long-running external job MUST be persisted with provider, provider job id, kind, status, created-at, last-polled-at, input reference, output path, and error. A single background worker MUST poll active jobs with exponential back-off capped at 2 minutes.
- **FR-045**: On app launch, the worker MUST reconcile the status of every active persisted job with its provider before accepting new work.
- **FR-046**: Every long-running job MUST offer a cancel action that best-effort cleans up the remote resource.
- **FR-047**: The system MUST fire a Windows toast notification on completion or failure of any job marked notify (default: all long jobs).

**Cost and usage**

- **FR-048**: Every paid provider call MUST show a cost preview before it fires: estimated units, equivalent USD at the current plan, and month-to-date for that provider.
- **FR-049**: The system MUST maintain a costs ledger with timestamp, provider, operation, units, unit kind, USD estimate, project id, and job id, and MUST offer CSV export of that ledger.
- **FR-050**: A Cost & Usage panel MUST show per-provider month-to-date totals sourced from both the local ledger and the provider's reported usage when the provider's API exposes it.

**Settings**

- **FR-051**: A Settings screen MUST expose: provider keys + re-test, Claude Code defaults (model, temperature, override list), upload-transport configuration, render defaults, projects root, log folder/retention/level, and appearance (light/dark/system + density).

**Observability and errors**

- **FR-052**: All logs MUST be written as JSON Lines to `%APPDATA%\Lumo\logs\<YYYY-MM-DD>.jsonl`, rotated daily, with secrets redacted from request and response bodies before write.
- **FR-053**: Every provider-originated error surfaced to the operator MUST include the provider's verbatim error message and one concrete actionable next-step suggestion. Swallowed exceptions and generic "Something went wrong" text MUST be treated as defects.

**Security and safety**

- **FR-054**: The system MUST NEVER evaluate model-generated code (`eval`, `new Function`, dynamic `require` of generated paths) at any point.
- **FR-055**: All file-system paths MUST be constructed via `path.resolve` and `path.join`; string-concatenated paths MUST be treated as defects.
- **FR-056**: Auto-update MUST be off by default for v1; releases MUST ship as manual installers.

**Navigation**

- **FR-057**: The system MUST provide single-key top-level navigation: Home (`Ctrl+0`), Voice (`Ctrl+1`), Avatar (`Ctrl+2`), Script (`Ctrl+3`), Generate (`Ctrl+4`), Compose (`Ctrl+5`), Jobs (`Ctrl+J`), Settings (`Ctrl+,`).
- **FR-058**: Every screen MUST have one primary action with a visible keyboard shortcut; destructive actions MUST require explicit confirmation referencing the target object's name.

### Key Entities *(include if feature involves data)*

- **Project**: A named folder under the projects root with a metadata file (name, created-at, brand colour, logo reference, default voice reference, default avatar reference) and a per-project SQLite database. Owns every artifact produced within it.
- **Voice**: A trained voice attached to a project. Attributes: provider (`elevenlabs`), provider voice id, tier (`ivc`|`pvc`), display name, sample duration in seconds, created-at.
- **Avatar**: A trained avatar attached to a project. Attributes: provider (`heygen`), provider avatar id, tier (`photo`|`instant`), source reference (image path or segment list), created-at.
- **Take**: A recorded or imported audio file used as training material for a voice. Attributes: path, duration, mark (good|bad), trim in/out, source (record|import).
- **Segment**: A labelled cut from a source video used as training material for an instant avatar. Attributes: source file reference, in/out timestamps, extracted path.
- **Script**: A versioned markdown script generated and edited in the studio. Attributes: title, body, word count, estimated spoken seconds, parent version reference (nullable), created-at, updated-at.
- **Template**: A Remotion composition definition, either shipped in the app bundle or dropped into a project's templates folder. Attributes: id, source path, schema, default props, duration in frames (or function), fps, validity status.
- **Render**: An output video. Kinds: `avatar_clip` (TTS+lip-sync output) and `composed` (full composition output). Attributes: kind, linked script/voice/avatar/template references, generation mode (for avatar clips), output path, status.
- **Job**: A persistent record of a long-running external operation. Attributes: provider, provider job id, kind (`voice_train`|`avatar_train`|`tts`|`avatar_video`|`render`), input reference, output path, status, last-polled-at, error, created-at.
- **Cost entry**: A row on the ledger recording a paid operation. Attributes: linked job, provider, operation, units, unit kind (`characters`|`credits`|`seconds`), USD estimate, recorded-at.
- **Credential target**: A named entry in the Windows Credential Manager holding a provider API key. Targets: `Lumo/elevenlabs`, `Lumo/heygen`.
- **Upload transport configuration**: Per-project selection between S3/R2 (with operator-owned bucket creds), local cloudflared tunnel, or direct provider upload where supported. Used to make TTS audio reachable by HeyGen.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A cold operator on a fresh Windows 11 machine, with Claude Code already authenticated and accounts with ElevenLabs and HeyGen, can complete the end-to-end path (install → keys → record voice → train PVC → train avatar → generate script → produce lip-synced MP4 → compose intro/outro → export final MP4) within a single working day without opening a terminal, editing a config file, or moving files by hand.
- **SC-002**: Between the moment the operator clicks Run on the Generate screen and the moment an approved lip-synced MP4 is playable in-app, the operator performs no manual filesystem step and sees progress, an ETA, or a "typically takes N minutes" hint at all times.
- **SC-003**: When the app is closed mid-training, 100% of in-flight long-running jobs reappear in the jobs tray with correct status on next launch, and complete to the same final state they would have reached if the app had stayed open.
- **SC-004**: Every paid operation displays a cost preview with USD estimate and month-to-date before it runs; the operator can abandon the operation from the preview screen at zero cost.
- **SC-005**: Every error surfaced by the app names the provider, includes the provider's verbatim message, and proposes at least one specific next step. Zero occurrences of generic "Something went wrong" text in shipped UI strings.
- **SC-006**: No API key or other secret ever appears in any log file, error message, or file on disk outside Windows Credential Manager. Verified by scanning log fixtures for known secret shapes and by code-level enforcement in the logger.
- **SC-007**: The operator can produce a composed final MP4 from a one-line prompt in under 15 minutes of active attention (excluding provider-side training and rendering wait time), once voice and avatar are already trained.
- **SC-008**: Every primary action has a keyboard shortcut visible in its button label, and the six core screens are reachable in a single keystroke from anywhere in the app.
- **SC-009**: Every generated artifact that will be consumed downstream (scripts, Remotion props) is reviewable by the operator and requires explicit acceptance before the app acts on it. Measured by code-level gate: no consumption path exists that bypasses review for user stories P1–P4.
- **SC-010**: Deleting a project always results in the folder being recoverable from the Windows Recycle Bin; no code path hard-deletes a project folder.

## Assumptions

- **Claude Code CLI is already installed and authenticated** on the operator's machine via Claude Pro Max. Lumo verifies at launch but does not manage those credentials and does not accept an Anthropic API key.
- **HeyGen is API-only.** The operator subscribes to HeyGen's API tier (Pay-as-you-go, Pro, or Scale). No separate web-tier subscription is assumed.
- **ElevenLabs is accessed via a single API key** entered once by the operator.
- **Professional Voice Clone (PVC) is the standard voice path**; Instant Voice Clone (IVC) exists only as a quick-test affordance.
- **HeyGen's human-review "Studio-grade" avatar tier is out of scope for v1.** Only Photo Avatar and Instant Avatar are supported.
- **Remotion compositions are typed templates, never runtime-generated code.** Claude Code produces only JSON props matching a template's Zod schema; parsed and validated before render.
- **Technology stack is locked by the project constitution**: Electron + React + TypeScript + Vite; `better-sqlite3` for state; `keytar` for secrets; `ffmpeg` as a bundled sidecar; Windows 11 x64 only. These are product requirements for v1, not implementation choices.
- **Single operator, single machine.** No accounts, no cloud sync, no analytics, no telemetry, no shared-project features.
- **Operator pays providers directly.** No in-app billing, purchase, or invoicing flow.
- **No publishing integrations.** Upload to YouTube, LinkedIn, Vimeo, or public S3 is out of scope for v1.
- **English-only UI for v1.**
- **Auto-update is off for v1**; releases ship as manual installers.
- **Network connectivity is required** for every paid-provider operation; offline operation is not a v1 goal.
- **Claude Code default model is `claude-opus-4-7`**, configurable per invocation in settings, not per app build.
