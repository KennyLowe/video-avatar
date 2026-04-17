# Feature Specification: Lumo v1 — Operator-driven avatar video pipeline

**Feature Branch**: `001-lumo-v1`
**Created**: 2026-04-17
**Status**: Draft
**Input**: User description: "in this folder is a spec.md file. Read it and use this as the spec for this project." (source document: `/spec.md` at repo root)

## About this document

This specification defines **what** the product does and **why** it matters. It deliberately does not name libraries, CLI invocations, endpoint URLs, credential-store target strings, file formats, field names, model identifiers, ffmpeg flags, or any other mechanism. Those choices are implementation decisions that belong in `plan.md` (see §Technical Requirements there) and may change without invalidating anything in this document.

A future reader — future-you, a different AI assistant, a teammate you haven't met — should be able to read this spec, understand the product's behaviour end-to-end, and still disagree productively about how to build it.

Product-level dependencies on specific external services (the AI assistant, the voice-cloning service, the avatar-generation service, the composition rendering engine) are named where doing so clarifies intent. Swapping any of them is a v2-scale product decision; the spec calls that out in the Assumptions section rather than in every requirement.

## User Scenarios & Testing *(mandatory)*

Stories are ordered so that each one delivers standalone operator value. Implementing only P1 yields a usable app that can take a prompt and return a video of a talking avatar. P2, P3, P4, P5 each add independently testable capability on top.

### User Story 1 - End-to-end avatar video from prompt, using stock voice and stock avatar (Priority: P1)

A single operator on a fresh machine types a prompt, gets back a script, approves it, picks a generation mode, and receives a video of a stock avatar speaking the script in a stock voice. No training required. This is the minimum viable slice of the pipeline and proves every external integration is wired end-to-end.

**Why this priority**: This is the load-bearing capability. If it works, the app has demonstrated script generation, speech synthesis, audio delivery to the avatar service, lip-sync generation, and job persistence. Every other story is either enrichment (higher-quality inputs) or polish around this core. Without P1 working, nothing else matters.

**Independent Test**: On a clean install with the AI assistant authenticated and voice-service and avatar-service credentials configured, the operator enters a one-line prompt in the script studio, accepts the generated script, selects a stock voice and stock avatar, clicks Run, and within the services' published SLAs receives a video file in the project's renders area. The video plays and the audio is lip-synced to the avatar.

**Acceptance Scenarios**:

1. **Given** a new project with no trained voice and no trained avatar, **When** the operator generates a script, picks a stock voice + stock avatar + Standard mode, and runs the pipeline, **Then** the app produces a video in the project's avatar-clip area with lip-synced audio matching the script, and a cost preview was shown before the run.
2. **Given** an in-flight avatar-video job, **When** the operator closes the app and reopens it, **Then** the job reappears in the jobs tray with its correct status, polling resumes, and on completion the video is downloaded and an OS native notification fires.
3. **Given** an invalid audio-transfer configuration (no operator-configured alternatives available when the default is unreachable), **When** the operator runs the pipeline, **Then** the app surfaces the specific transfer failure with the service's verbatim error and a concrete next-step suggestion, and no partial video is written.

---

### User Story 2 - Train and use a custom Professional Voice Clone (Priority: P2)

The operator records or imports voice samples, marks good takes, submits them for Professional Voice Clone (PVC) training, closes the app, and hours later finds a production-quality voice attached to the project. Subsequent avatar videos use that voice instead of the stock voice.

**Why this priority**: Custom voice is the primary differentiator for spoken-register content and is the standard production path. It is independently testable (the voice can be previewed with any text before being used in a full video) but depends on P1 existing only at the point of first use in a full render.

**Independent Test**: Operator records the voice-service's minimum duration of good takes in-app (or imports equivalent audio), submits for PVC training, closes the app, reopens hours later, and the voice appears in the voices list with status "ready." A short preview of that voice saying arbitrary text plays inline.

**Acceptance Scenarios**:

1. **Given** a project with zero good takes, **When** the operator attempts to submit for PVC training, **Then** the submit button is disabled, the UI explains the current-vs-required duration, and no request is sent to the voice service.
2. **Given** a PVC job submitted hours ago, **When** the operator reopens the app, **Then** the worker reconciles the job status with the voice service before accepting any new work, and the operator is notified of completion via an OS native notification.
3. **Given** an Instant Voice Clone (IVC) quick-test action, **When** the operator invokes it, **Then** the UI labels it as "for testing the pipeline only, not recommended for final production" and completes in seconds.

---

### User Story 3 - Train and use a custom avatar (Priority: P3)

The operator picks an avatar tier (Photo Avatar or Instant Avatar), imports source material, optionally selects clean segments, and submits for training. On completion the trained avatar is attached to the project and used in subsequent generations.

**Why this priority**: Custom avatar is the second differentiator. Photo Avatar is fast; Instant Avatar requires several minutes of clean video. Both paths are independently testable — the trained avatar can produce a short preview saying a canned phrase.

**Independent Test**: Operator selects Instant Avatar, imports the minimum required duration of video, marks clean segments, submits for training, receives the trained avatar back, and renders a short preview of it speaking a canned phrase in a default voice.

**Acceptance Scenarios**:

1. **Given** a video with sufficient resolution and a face detected on all sampled frames, **When** the operator imports it, **Then** the quality heuristics pass and the importer allows segment selection.
2. **Given** a video with motion or multiple faces detected on more than 10% of sampled frames, **When** the operator imports it, **Then** the app surfaces a warning with the specific failing check, and the operator can still proceed explicitly.
3. **Given** a submitted avatar-train job, **When** the operator cancels it from the jobs tray, **Then** the app best-effort cancels the remote resource and marks the job canceled locally.

---

### User Story 4 - Compose a branded final video with intro, outro, and overlays (Priority: P4)

The operator picks a composition template, writes a natural-language prompt describing the desired brand treatment, and the system fills the template's properties, previews the composition, and renders a composed final video with the avatar clip as the body.

**Why this priority**: Composition is pure enrichment over P1's raw avatar clip. It is independently testable with any video file as the body (the avatar clip can be stock output or a placeholder).

**Independent Test**: Operator picks the full-explainer template, enters a prompt describing brand colour and titles, and renders a composed video where the intro animation runs, the body avatar clip plays, and the outro animation runs, all styled with the requested brand colour.

**Acceptance Scenarios**:

1. **Given** a template's validation schema and default properties, **When** the AI assistant returns a property set that fails schema validation, **Then** the system retries once with the validation error appended, and on a second failure surfaces the error and opens a structured editor for manual property editing.
2. **Given** an operator-provided template that is missing a required part (validation schema, default values, duration definition, frame rate, or composition root), **When** the operator opens the template picker, **Then** the template is listed as invalid with the specific missing part named, and is not loadable.
3. **Given** a render in progress, **When** the operator clicks cancel, **Then** the render stops within seconds and no partial output file remains in the renders area.

---

### User Story 5 - Operational polish: project management, cost visibility, jobs tray, settings (Priority: P5)

The operator manages multiple projects, sees current-period spend per service, reviews job history, exports a cost ledger, and configures render defaults, audio-transfer transport, and log retention. Delete is safe (recycle/trash, two-step confirm).

**Why this priority**: These are ergonomics. Missing any one degrades daily use but does not block producing a video. Each sub-capability (cost export, project duplicate, settings changes) is independently testable.

**Independent Test**: Operator creates a project, produces a small paid operation, opens the cost panel, verifies current-period usage reflects the operation, exports the ledger, and the export contains a row with the expected service, units, and USD estimate. Separately, operator deletes a project and recovers it from the OS recycle/trash facility.

**Acceptance Scenarios**:

1. **Given** a paid operation, **When** it completes, **Then** a row is appended to the costs ledger with timestamp, service, operation, units, unit kind, USD estimate, project identifier, and job identifier, and the current-period figure updates everywhere it is displayed.
2. **Given** the operator clicks Delete on a project, **When** the two-step confirmation is completed, **Then** the project folder is moved to the operating system's recycle/trash facility (not hard-deleted) and disappears from the Home screen.
3. **Given** a log level set to its most verbose setting, **When** any external-service call fires, **Then** the request (with credentials redacted) and response are written to the current day's log file, and rotated logs older than the configured retention are removed.

---

### Edge Cases

- **AI assistant missing or unauthenticated at launch**: Home shows a non-dismissible banner identifying which check failed, with the exact operator-facing remediation command and a Recheck button. No other feature is reachable until resolved.
- **Paid-service credential rejected at Test**: The Test action surfaces the service's verbatim error message; the credential is not saved; the operator remains on the entry screen.
- **Operator closes laptop mid-training**: Any active training job is persisted in the job queue; on next launch, the worker reconciles with the service before accepting new jobs, and the operator sees the current status in the tray.
- **Voice-training submission below minimum duration**: Submit is disabled; the UI states current vs required and refuses to submit.
- **All configured audio-transfer transports unavailable**: Pipeline fails fast at the upload step with a specific actionable error; no avatar-video call is attempted.
- **AI assistant returns malformed output**: For scripts, the raw response is shown with an edit affordance. For template properties, retry once with the validation error appended; on second failure surface the error and open a structured editor.
- **Operator cancels an in-flight avatar video**: App calls the service's cancel endpoint best-effort; local job status becomes `canceled`; no partial video is downloaded.
- **Two projects share a name slug**: The app disambiguates with a numeric suffix on the folder; the project's display name retains the operator's exact wording.
- **Service returns an error containing a credential** (e.g., echoes back the key): The app redacts known credential shapes before logging and before surfacing to the UI.
- **Regenerate on an already-rendered avatar video**: Warns of repeat cost with the USD estimate before re-running.

## Requirements *(mandatory)*

### Functional Requirements

**Setup and credentials**

- **FR-001**: The system MUST verify at launch that its AI-assistance dependency is both **installed** on the operator's machine and **authenticated** under the operator's own pre-existing subscription. The system MUST NOT solicit an AI-service credential from the operator. On either check failing, Home MUST render a non-dismissible banner identifying which check failed, presenting the exact operator-facing remediation, and blocking all other features until a Recheck succeeds.
- **FR-002**: The system MUST request each paid-service credential progressively at the point of first use, not in a monolithic onboarding form.
- **FR-003**: Paid-service credentials MUST be stored in the operating system's dedicated secret store. Credentials MUST NOT appear in any file on disk outside that store (no environment files, no configuration files, no log entries), and MUST NOT surface in any error message.
- **FR-004**: Each credential-entry screen MUST provide a Test action that performs a lightweight authenticated round-trip with the service and reports whichever of {plan name, current-period usage} the service exposes. The credential MUST NOT be persisted until the Test succeeds.
- **FR-005**: A Service Status view MUST summarise, per external service: authenticated yes/no, plan name, current-period usage (when available), and a link to the service's account dashboard.

**Project management**

- **FR-006**: The system MUST let the operator choose a projects-root directory and MUST own every sub-path beneath it (naming, nesting, cleanup).
- **FR-007**: Each project MUST be a single filesystem folder containing its own metadata, state, and artifact sub-folders for: recorded audio takes, generated speech, imported source video, extracted video segments, generated avatar video, scripts, final renders, optional operator-provided composition templates, and logs. The internal layout is owned by the application and MUST be stable across app versions.
- **FR-008**: The Home screen MUST list projects with last-modified time, last-render thumbnail, and per-project actions: open, rename, duplicate, delete, reveal in filesystem.
- **FR-009**: Delete MUST require an explicit two-step confirmation that types or matches the project name, and MUST move the project folder to the operating system's recycle/trash facility rather than hard-deleting.

**Script studio**

- **FR-010**: The system MUST generate scripts from an operator prompt by invoking the AI assistant. The response MUST be a structured object containing at minimum a title, script body, estimated spoken duration, and optional chapter markers, and MUST be validated against a published schema before any downstream use.
- **FR-011**: The script editor MUST show a spoken-word linter that flags: parenthetical asides, bullet-list syntax, bare URL literals, and acronyms without a first-use expansion.
- **FR-012**: The script editor MUST display live word count, character count, and estimated spoken duration using the operator-configured words-per-minute default.
- **FR-013**: The system MUST offer selection-driven assist actions covering at minimum: tighten this paragraph, make this less corporate, break into chapters, add a one-line hook, convert jargon to plain English. Each invokes the AI assistant once; the diff MUST be previewed and the operator MUST explicitly accept before it replaces the selection.
- **FR-014**: Every save of a script MUST write a new immutable version artifact; prior versions MUST be browsable and restorable.

**Voice lab**

- **FR-015**: The system MUST capture voice recordings at the fidelity required by the voice-cloning service (monaural, broadcast-grade), support pause and resume during recording, and show a live audio-level meter and live waveform.
- **FR-016**: The system MUST accept drag-and-drop import of common operator-sourced audio formats (at minimum WAV, MP3, FLAC, M4A, OGG) and MUST normalise them into the internal recording format before use.
- **FR-017**: The system MUST let the operator mark each take as good or bad, trim via in/out handles, and display running totals of good duration.
- **FR-018**: The system MUST offer Professional Voice Clone (PVC) training as the primary action, and MUST check the voice-cloning service's current PVC minimum duration at submission time rather than hard-coding it.
- **FR-019**: The system MUST offer Instant Voice Clone (IVC) only as a clearly labelled "quick test" action; the UI MUST discourage it for production output.
- **FR-020**: The system MUST refuse to submit either training job when the corresponding minimum is not met, and MUST explain the gap numerically.
- **FR-021**: The system MUST persist every voice-training submission as a long-running job, MUST fire an OS native notification on completion, and MUST mark the voice ready for use only on successful completion.
- **FR-022**: The system MUST provide an inline preview that generates a short sample using the trained voice against arbitrary operator-supplied text, and MUST support side-by-side playback of two voices.

**Avatar lab**

- **FR-023**: The system MUST present a tier selector between Photo Avatar and Instant Avatar, and the selection MUST drive the rest of the screen's UI: the importer's accepted file types, the pre-upload quality checks, and the avatar-service endpoint invoked on submission.
- **FR-024**: The system MUST accept drag-and-drop import for each tier's accepted types (images for Photo Avatar; video for Instant Avatar) and MUST display probe metadata (duration, resolution, frame rate, codec, file size) for video imports.
- **FR-025**: The system MUST let the operator mark 1–N (in, out) segments per source video and extract each segment to disk without re-encoding where possible.
- **FR-026**: The system MUST offer a "grab frame from video" tool for Photo Avatar, producing a still-image file from any point in an imported clip.
- **FR-027**: The system MUST run pre-upload quality heuristics and present any failure as an informational warning that the operator can override, or — where noted — as a block. Concrete thresholds:
  - **Resolution**: warn if video short-edge is below 1080 px; warn if image short-edge is below 1024 px.
  - **Face-detection coverage**: for video, sample 1 frame per second (cap 60 samples) and warn if fewer than 90% contain exactly one detected face; warn separately if any sampled frame detects more than one face. For image, **reject** (not warn) if no face or multiple faces are detected.
  - **Motion**: for video, warn if the mean inter-frame pixel delta across sampled frames exceeds 15% of image area — indicates camera or background movement.
  - **Sharpness**: warn if image sharpness falls below a documented threshold (applied to imported images, and to the middle frame of each selected video segment).
- **FR-028**: The system MUST persist every avatar-training submission as a long-running job and MUST fire an OS native notification on completion; the trained avatar's service-side identifier is recorded on completion.
- **FR-029**: The system MUST provide a short-duration preview of the trained avatar speaking a canned phrase, using the project's trained voice if available or a default voice otherwise.

**Avatar video generation**

- **FR-030**: The Generate screen MUST require the operator to pick a voice, an avatar, a script, and a generation mode (Standard or Avatar IV) before Run becomes enabled.
- **FR-031**: The system MUST disable generation modes incompatible with the selected avatar tier, with an inline explanation of the incompatibility.
- **FR-032**: Before the operator confirms a paid run, the system MUST display a cost preview showing, per service: estimated units consumed, equivalent USD estimate, current-period usage, and remaining plan headroom where the service exposes it.
- **FR-033**: Run pipeline MUST execute in order: speech synthesis to a local file; transfer of the synthesised audio to the avatar service via the configured transport; avatar-video generation call; background polling until the service reports completion; download of the resulting video file into the project's avatar-clip area.
- **FR-034**: The audio-transfer mechanism to the avatar service MUST be configurable per project, with at least these options: the avatar service's own asset-upload facility (default); operator-owned cloud object storage with a short-TTL pre-signed URL; and an operator-controlled local tunnel as a last-resort fallback. The resolver MUST try the configured default first and fall back to alternatives in a documented order.
- **FR-035**: A completed avatar video MUST offer an inline preview with a Regenerate action that warns of repeat cost, and an Approve-and-continue action that advances the workflow to composition.

**Composition studio**

- **FR-036**: The system MUST ship a library of seed composition templates covering at minimum: a logo-and-title intro, a lower-third overlay, a full intro-body-outro explainer, a single-title slide, and a chapter-card transition.
- **FR-037**: Every composition template MUST expose a validation schema, a set of default values, a duration definition, a frame rate, and a composition root. Templates missing any of these MUST be reported as invalid with the specific missing item named, and MUST NOT be loadable.
- **FR-038**: The system MUST allow operators to drop their own composition templates into a per-project templates folder, and MUST apply the same validity check as for bundled templates.
- **FR-039**: The prompt-to-properties flow MUST derive a machine-readable description of the template's schema, send it along with the operator's prompt and the template's default values to the AI assistant, and validate the response against the schema before use.
- **FR-040**: On validation failure the system MUST retry once with the validation error appended to the prompt; on a second failure the system MUST surface the error and open a structured editor pre-populated with the invalid response so the operator can correct it manually. The system MUST NEVER execute or interpret AI-assistant output as code.
- **FR-041**: The Composition screen MUST embed an interactive preview supporting play, pause, scrub, and live edits to template properties, and MUST render output into the project's renders area.
- **FR-042**: Render settings MUST include resolution (default 1080p30; also 1080p60 and 4K30), codec (default h264; also h265), audio bitrate, and three named quality presets that trade render speed for output quality (fast, balanced, quality — balanced is the default). Renders MUST be cancellable, and a cancelled render MUST leave no partial file behind.

**Jobs, notifications, and persistence**

- **FR-043**: The system MUST display a persistent Jobs tray at the bottom of every window that collapses to a count and the most-recent status, and expands (click or keyboard shortcut) to a full list with per-job service, kind, elapsed time, progress, cancel, and log-link affordances.
- **FR-044**: Every long-running external operation MUST be persisted with enough state to be resumed across app restarts (at minimum: service, service-assigned job identifier, kind, status, timestamps, input reference, output path, error). A single background worker MUST poll active jobs with back-off.
- **FR-045**: On app launch, the worker MUST reconcile the status of every active persisted job with its service before accepting new work.
- **FR-046**: Every long-running job MUST offer a cancel action that best-effort cleans up the remote resource.
- **FR-047**: The system MUST fire an OS native notification on completion or failure of any job marked notify-on-complete; long jobs MUST default to notify-on-complete.

**Cost and usage**

- **FR-048**: Every paid-service call MUST show a cost preview before it fires: estimated units, equivalent USD at the current plan rate, and current-period usage for that service.
- **FR-049**: The system MUST maintain a costs ledger with, per entry: timestamp, service, operation, units, unit kind, USD estimate, project identifier, and job identifier, and MUST offer export of that ledger.
- **FR-050**: A Cost and Usage view MUST show per-service current-period totals from both the local ledger and the service's own reported usage, side by side, wherever the service exposes that value via its API.

**Settings**

- **FR-051**: A Settings screen MUST expose: service credentials (entry + re-test + status); defaults for the AI assistant (model, temperature, override list for experimentation); audio-transfer transport configuration; render defaults; projects root; log folder, retention, and level; and appearance.

**Observability and errors**

- **FR-052**: All logs MUST be written in a structured, machine-parseable line format to a daily-rotated file. External-service request and response bodies MUST pass through a redactor that strips known credential shapes before write.
- **FR-053**: Every service-originated error surfaced to the operator MUST include the service's verbatim error message and one concrete actionable next step. Swallowed exceptions and generic "Something went wrong" text MUST be treated as defects.

**Security and safety**

- **FR-054**: The system MUST NEVER execute, evaluate, or interpret AI-assistant output as code. Generated output is only ever consumed as data, and only after passing a published schema validator.
- **FR-055**: All filesystem paths MUST be constructed through the runtime's path-resolution API. String-concatenated paths MUST be treated as defects.
- **FR-056**: Automatic background self-update MUST be off by default for v1; releases MUST ship as manual operator-initiated installations.

**Navigation**

- **FR-057**: The system MUST provide single-key top-level navigation to Home, Voice, Avatar, Script, Generate, Compose, Jobs, and Settings.
- **FR-058**: Every screen MUST have exactly one primary action with a visible keyboard shortcut; destructive actions MUST require explicit confirmation that references the target object's name.

### Key Entities

Conceptual entities only. Field-level schemas, on-disk encoding, and table layout live in `data-model.md`.

- **Project**: A single-folder workspace that contains everything produced under one named piece of work. Owns its own metadata, state, and artifacts.
- **Voice**: A trained voice attached to a project, identified by its tier (professional or quick-test) and its identifier assigned by the voice-cloning service.
- **Avatar**: A trained avatar attached to a project, identified by its tier (photo or instant) and its identifier assigned by the avatar service.
- **Take**: A single recorded or imported audio file considered as voice-training material. Carries a good/bad marking and optional trim points.
- **Segment**: A labelled cut from a source video considered as avatar-training material. Carries in/out timestamps and an extracted file path.
- **Script**: A versioned spoken-register script generated and edited in the studio. Every save produces an immutable new version; prior versions are restorable.
- **Composition template**: A declarative recipe for a video composition — its validation schema, default property values, duration, frame rate, and a composition root. Can be bundled with the app or operator-provided per project.
- **Render**: A video artifact produced either by the avatar-video pipeline (an avatar clip) or by the composition pipeline (a composed final). Carries the generation parameters that produced it.
- **Job**: A persisted record of a long-running external operation (voice training, avatar training, avatar-video generation, composition render). Survives app restarts. Reconciled against the relevant service on next launch.
- **Cost entry**: A ledger row recording a paid operation: timestamp, service, operation kind, units consumed, unit kind, USD estimate, and the job and project that produced it.
- **Service credential**: A persistent, machine-only secret that authenticates the operator to an external paid service. Held exclusively in the operating system's dedicated secret store.
- **Audio-transfer configuration**: A per-project selection of how synthesised speech is delivered to the avatar service, with a default and an ordered list of fallbacks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A cold operator on a fresh machine, with the AI assistant already authenticated and credentials for the voice-cloning and avatar services configured, can complete the end-to-end path (install → credentials → record voice → train PVC → train avatar → generate script → produce lip-synced video → compose intro/outro → export final video) within a single working day without opening a terminal, editing a configuration file, or moving files by hand.
- **SC-002**: Between the moment the operator clicks Run on the Generate screen and the moment an approved lip-synced video is playable in-app, the operator performs no manual filesystem step. Every asynchronous operation expected to exceed 5 seconds MUST display exactly one of (a) a linear progress indicator with percentage, (b) a numeric ETA derived from the service's reported progress, or (c) a "typically takes N minutes" hint sourced from observed service averages. This is a structural contract, enforced at the component level, not a manual inspection.
- **SC-003**: When the app is closed mid-training, 100% of in-flight long-running jobs reappear in the jobs tray with correct status on next launch, and complete to the same final state they would have reached if the app had stayed open.
- **SC-004**: Every paid operation displays a cost preview with USD estimate and current-period usage before it runs; the operator can abandon the operation from the preview screen at zero cost.
- **SC-005**: Every error surfaced by the app names the service, includes the service's verbatim message, and proposes at least one specific next step. Zero occurrences of generic "Something went wrong" text in shipped UI strings.
- **SC-006**: No credential or other secret ever appears in any log file, error message, or file on disk outside the operating system's dedicated secret store. Verified by scanning log fixtures for known credential shapes and by code-level enforcement in the logger.
- **SC-007**: The operator can produce a composed final video from a one-line prompt in under 15 minutes of active attention (excluding service-side training and rendering wait time), once voice and avatar are already trained.
- **SC-008**: Every primary action has a keyboard shortcut visible in its button label, and the top-level screens are reachable in a single keystroke from anywhere in the app.
- **SC-009**: Every generated artifact that will be consumed downstream (scripts, composition properties) is reviewable by the operator and requires explicit acceptance before the app acts on it. Measured by code-level gate: no consumption path exists that bypasses review for user stories P1–P4.
- **SC-010**: Deleting a project always results in the folder being recoverable from the operating system's recycle/trash facility; no code path hard-deletes a project folder.

## Assumptions

- **The AI assistant is pre-installed and pre-authenticated** on the operator's machine under the operator's own subscription. Lumo verifies this at launch but does not manage those credentials and does not accept an AI-service API key.
- **The avatar service is used via its API tier** (no separate web-subscription is assumed).
- **The voice-cloning service is accessed via a single operator-supplied API credential.**
- **Professional Voice Clone is the standard voice-production path**; Instant Voice Clone exists only as a quick-test affordance.
- **The avatar service's human-reviewed premium tier is out of scope for v1.** Only the self-serve Photo Avatar and Instant Avatar tiers are supported.
- **Composition templates are typed declarative recipes, never runtime-generated code.** The AI assistant produces only structured property values matching a template's schema; values are validated before render.
- **The technology stack is locked by the project constitution, not by this specification** — target operating system, desktop runtime, state store, secret store, logging format, media-processing pipeline, composition renderer, and specific external services are constitutional decisions. This specification states product-level requirements and remains valid if any component of the stack is swapped, as long as the requirements are still met.
- **Named product dependencies**: the AI assistant is Claude Code (the CLI tool); the voice-cloning service is ElevenLabs; the avatar-generation service is HeyGen; the composition rendering engine is Remotion. Swapping any of these is a v2-scale product change.
- **Single operator, single machine.** No accounts, no cloud sync, no analytics, no telemetry, no shared-project features.
- **Operator pays external services directly.** No in-app billing, purchase, or invoicing flow.
- **No publishing integrations.** Upload to YouTube, LinkedIn, Vimeo, or public object storage is out of scope for v1.
- **English-only UI for v1.**
- **Automatic self-update is off for v1**; releases ship as manual operator-initiated installations.
- **Network connectivity is required** for every paid-service operation; offline operation is not a v1 goal.
