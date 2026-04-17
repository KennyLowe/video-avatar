# Spec — Lumo

## One-line summary

A Windows desktop application that turns a prompt into a lip-synced, branded avatar video, using Claude Code for all AI work, ElevenLabs for voice, HeyGen for avatar, and Remotion for composition.

## Primary user

A single operator (the developer/owner). Not multi-tenant. Not shipped to an app store.

## Assumptions

- **Claude Code CLI is already installed and authenticated** via Claude Pro Max on the operator's machine. Lumo verifies this at launch but does not manage those credentials and never asks for an Anthropic API key.
- **HeyGen is API-only.** The operator subscribes to HeyGen's API tier (Pay-as-you-go, Pro, or Scale). There is no web-subscription dual setup.
- **ElevenLabs is API-accessed** via a key the operator enters once.
- **Professional Voice Clone (PVC) is the standard voice-training path.** Instant Voice Clone (IVC) is available as a labelled "quick test" mode only, and the UI discourages it for production output.

## End-to-end flow (the "happy path")

1. **First launch.** Lumo introduces itself, asks for a projects root directory, silently checks that Claude Code CLI is installed and authenticated, and shows a provider status panel (ElevenLabs and HeyGen not yet configured; Claude Code ✓).
2. **Create project.** Operator names a project ("Q1 Azure Local explainer"), optionally uploads a logo and picks a brand colour.
3. **Voice.** Operator records or imports audio samples, marks good takes, and submits them to ElevenLabs for PVC training. Training runs as a background job (hours). On completion, the `voice_id` is attached to the project.
4. **Avatar.** Operator picks a HeyGen avatar tier, imports source material appropriate to that tier, and submits for training. Training runs as a background job. On completion, the `avatar_id` is attached to the project.
5. **Script.** Operator prompts the script studio; Claude Code returns a speaker-register script; operator edits in a Monaco editor.
6. **Avatar video.** Operator picks voice + avatar + script and a generation mode (Standard vs Avatar IV). Lumo runs ElevenLabs TTS, uploads the audio, triggers HeyGen lip-sync, and drops the MP4 into the project.
7. **Composition.** Operator picks Remotion templates (intro / outro / overlays) and prompts for each; Claude Code fills props; Lumo renders the final composed MP4.
8. **Export.** Final MP4 is copied to an operator-chosen destination.

Each step is independently usable. An operator can open the script studio on day one and never train an avatar, or train an avatar and never touch scripts.

## Screens / navigation

Top-level screens, reachable by keyboard shortcut:

- **Home** (`Ctrl+0`) — recent projects, new project, global settings access.
- **Voice** (`Ctrl+1`) — record, import, takes, clones.
- **Avatar** (`Ctrl+2`) — tier picker, import, segments, trained avatars.
- **Script** (`Ctrl+3`) — prompt, editor, versions.
- **Generate** (`Ctrl+4`) — pick voice + avatar + script + mode, produce lip-synced clip.
- **Compose** (`Ctrl+5`) — pick Remotion template, prompt for props, preview, render.
- **Jobs** (`Ctrl+J`) — persistent tray at the bottom of every screen, expandable to a full panel.
- **Settings** (`Ctrl+,`) — keys, defaults, projects root, logs.

## Feature specifications

### F1. Setup & credentials

- **First run** presents a welcome panel explaining what each provider does, roughly what it costs at typical usage, and what is configured vs pending.
- **Claude Code** — no UI input. Lumo runs `claude --version` at launch. If missing or unauthenticated, a banner on Home explains the exact shell command to fix it (`winget install Anthropic.Claude` or `claude /login`). A "Recheck" button re-runs the verification.
- **ElevenLabs** — key entry at the point of first use (first time the operator submits a voice for cloning or runs TTS). A "Test" button calls `GET /v1/user` and reports plan name and month-to-date credit usage. Key stored in Credential Manager under target `Lumo/elevenlabs`.
- **HeyGen API** — key entry at first avatar-lab use. A "Test" button calls `GET /v2/avatars` or equivalent. Key stored in Credential Manager under target `Lumo/heygen`.
- **Provider status page** (reachable from Settings) shows per provider: authenticated yes/no, plan name (if retrievable), month-to-date usage (if retrievable), quick link to the provider's dashboard.

### F2. Project management

- A project is a folder: `<projects-root>/<slug>/` containing:
  - `project.json` — metadata (name, created_at, brand colour, logo path, voice_id ref, avatar_id ref).
  - `state.db` — per-project SQLite.
  - `audio/takes/`, `audio/tts/`, `video/source/`, `video/segments/`, `video/avatar/`, `scripts/`, `renders/`, `templates/` (optional custom Remotion templates), `logs/`.
- Home screen lists projects with last-modified, last-render thumbnail, and quick actions: open, rename, duplicate, delete, reveal in Explorer.
- Delete is a two-step confirmation; the folder is moved to Windows Recycle Bin, not hard-deleted.

### F3. Voice lab

- **Record:** Single-button record with live RMS + peak meter, live waveform, pause/resume, post-record trim with in/out handles. Input device picker defaults to the system default; a dropdown enumerates all available audio inputs. Format: 48 kHz mono, 24-bit WAV, written to `audio/takes/<timestamp>.wav`.
- **Import:** Drag-and-drop WAV/MP3/FLAC/M4A/OGG. Imports are normalized to the record format via the bundled `ffmpeg` sidecar.
- **Takes:** Each file is a take. Per-take: play, scrub, trim, rename, mark good/bad, delete. Always-visible readouts: total good seconds, total good minutes.
- **Train voice:**
  - **Primary action: "Train Professional Voice Clone (PVC)"** — requires good takes totalling the current ElevenLabs PVC minimum (check at submission time via a provider helper; the app does not hardcode the threshold). On submit, Lumo concatenates the good takes, uploads to ElevenLabs, persists the job with `kind='voice_train'` and `tier='pvc'`, and surfaces the job in the tray. PVC training is **known to take hours**; the UI shows "typically 2–4 hours" and the operator can close the app.
  - **Secondary action: "Quick test with IVC"** — labelled explicitly as "for testing the pipeline only, not recommended for final production". Instant; uses a minimum of one good take ≥ 60 seconds.
  - UI refuses to submit either if the minimum isn't met and explains why.
- **Completion handling:** A Windows toast notification fires. The voice moves from "training" to "ready" in the voices list. The `voice_id` is written to `voices` table with metadata (tier, sample seconds, model ID).
- **Preview:** "Say this: [text]" control that generates a 10-second sample using the voice and plays it inline. Side-by-side playback of two voices for A/B.
- **Cost preview:** Before any TTS generation call, show estimated characters, estimated credits, equivalent USD at the current plan, and running month-to-date.

### F4. Avatar lab

- **Tier selector (primary UI on this screen):** operator picks one of:

  | Tier | Training input | Notes |
  |---|---|---|
  | **Photo Avatar** | 1 high-resolution portrait | Quickest to train; lower motion fidelity. |
  | **Instant Avatar** | ~2–5 minutes of clean video clip | Higher identity fidelity; trained once, reused. |

  (HeyGen's human-review "Studio" tier is explicitly out of scope per the constitution.)

  The selector drives the rest of the screen's UI: the importer accepts images for Photo Avatar and video for Instant Avatar; the quality checks differ; the HeyGen endpoint called at submit time differs.

- **Import (video path, Instant Avatar):** drag-and-drop MP4/MOV/WebM. Probe with `ffprobe` to display duration, resolution, frame rate, codec, file size. A timeline view with a preview player lets the operator mark 1–N (in, out) segments per source file. Segments are extracted with `ffmpeg` to `video/segments/<source>-<n>.mp4` without re-encoding where possible.
- **Import (image path, Photo Avatar):** drag-and-drop JPG/PNG, or a "grab frame from video" tool that opens a scrubber over an imported clip and lets the operator export the current frame as a PNG.
- **Quality heuristics (pre-upload):**
  - *Video:* resolution check (warn below 1080p), face detection on sampled frames (warn if no face detected on ≥ 10% of sampled frames or if multiple faces detected), motion estimate (warn if camera or background appears to be moving substantially).
  - *Image:* resolution check (warn below 1024 px on the short edge), face detection (reject if no face or multiple faces), sharpness estimate.
  Warnings are informational; the operator can proceed anyway.
- **Train avatar:** Submit to the HeyGen endpoint appropriate to the selected tier. Persist job with `kind='avatar_train'` and `tier` set. Notification on completion; `avatar_id` stored in `avatars` table.
- **Preview:** Generate a 5-second sample video of the avatar saying a canned phrase ("Hi, I'm $name and this is a Lumo test render"), using the project's voice if present or a default HeyGen voice otherwise. Uses the project's default generation mode.

### F5. Script studio

- **Prompt area** with:
  - A free-text prompt box.
  - A template dropdown (Explainer, Demo walkthrough, Announcement, Internal update, Custom).
  - Tone: Conversational / Technical / Formal.
  - Target length: 30s / 1 min / 2 min / 3 min / 5 min / custom WPM and duration.
- **Generate** invokes Claude Code:
  ```
  claude --print --output-format json --model claude-opus-4-7
  ```
  The system prompt enforces spoken-register output: short sentences, natural contractions, no list syntax, optional inline pause hints like `[pause]` or SSML `<break>`. Output schema (Zod):
  ```ts
  const ScriptResponseSchema = z.object({
    title: z.string(),
    body: z.string(),
    estimatedDurationSeconds: z.number(),
    chapters: z.array(z.object({
      title: z.string(),
      startLine: z.number()
    })).optional()
  });
  ```
- **Editor:** Monaco in markdown mode with a spoken-word linter (flags parenthetical asides, bullet lists, URL literals, acronyms without first-use expansion, etc.). Live word count, character count, estimated spoken duration at the operator's configured WPM.
- **Claude Code assist commands** (selection-driven):
  - "Tighten this paragraph"
  - "Make this sound less corporate"
  - "Break into chapters with H2 headings"
  - "Add a one-line hook"
  - "Convert jargon to plain English"
  Each is a one-shot Claude Code invocation; the diff is previewed and requires operator acceptance before replacing the selection.
- **Versioning:** Every save writes `scripts/<slug>-v<n>.md`. Previous versions are browsable and restorable.

### F6. Avatar video generation

- Screen is a four-column picker: voice, avatar, script, **generation mode**. All project-scoped.

- **Generation mode selector:**

  | Mode | Engine | Cost profile | Best for |
  |---|---|---|---|
  | **Standard** | HeyGen standard avatar video | Lower per-minute cost on API plans | Most production content |
  | **Avatar IV** | HeyGen Avatar IV (premium) | Premium credits (heavy) | Hero content, presentations |

  The mode selector maps to the appropriate HeyGen API endpoint and payload at submit time. If the chosen avatar tier is not compatible with the chosen mode (check against current HeyGen API capabilities at plan time), the UI disables the incompatible option and explains why.

- **Cost preview panel:** Given the chosen script length, voice, avatar, and mode, show:
  - ElevenLabs: character count, credit burn, USD estimate.
  - HeyGen: estimated minutes, credit burn (including premium-credit multiplier for Avatar IV), USD estimate.
  - Total USD, month-to-date, and plan headroom.

- **Run pipeline** button executes:
  1. ElevenLabs `POST /v1/text-to-speech/{voice_id}` with the script body and configured voice settings. MP3 streamed to `audio/tts/<uuid>.mp3`. Show progress.
  2. Make the MP3 reachable by HeyGen. Transport is configurable per project, with three options:
     - **S3/R2** (recommended if creds present) — upload to an operator-owned bucket, return a pre-signed URL with short TTL.
     - **Local tunnel** — spin up an ephemeral HTTP server on a random port and expose via `cloudflared tunnel run --url http://localhost:<port>`; return the cloudflared URL.
     - **Direct upload** (if the current HeyGen API supports multipart upload for audio) — resolve at plan time by checking current docs.
  3. HeyGen video-generation endpoint appropriate to the selected mode, with `avatar_id` and `audio_url`. Job persisted with `kind='avatar_video'`.
  4. Background worker polls HeyGen until `status=completed`; MP4 is downloaded to `video/avatar/<script_id>-<uuid>.mp4`.

- **Preview:** Inline MP4 player with a "regenerate" button (warns of repeat cost) and an "approve and continue to compose" button.

### F7. Composition studio (Remotion)

- **Template library** ships as `.tsx` files bundled with the app in `resources/templates/`. Each template exports:
  ```ts
  export const schema: z.ZodObject<...>;
  export const defaultProps: z.infer<typeof schema>;
  export const durationInFrames: number | ((props: ...) => number);
  export const fps: number;
  export const Composition: React.FC<z.infer<typeof schema>>;
  ```
- **Seed templates (v1):**
  - `LogoIntro` — 4s logo-plus-title card with colour accent and brand subtitle.
  - `LowerThird` — name/title overlay with in/out animations, designed to layer over an avatar clip.
  - `FullExplainer` — intro + avatar body + outro in one composition, accepting an avatar-clip path and chapter markers.
  - `TitleSlide` — single slide with heading and subheading.
  - `ChapterCard` — full-screen chapter marker.
- **Custom templates:** Operator can drop their own `.tsx` files into `<project>/templates/`. Templates that fail to expose `schema` + `defaultProps` + `Composition` + `durationInFrames` + `fps` are reported as invalid with the specific missing export and are not loadable.
- **Prompt-to-props flow:**
  1. Operator picks a template.
  2. Operator writes a natural-language prompt: e.g. "Dell blue (#0076CE), title 'Azure Local rack awareness', subtitle 'Kenny Lowe — Dell TME', logo from project."
  3. Lumo sends to Claude Code: the prompt, the template's Zod schema converted to JSON Schema via `zod-to-json-schema`, the `defaultProps` as a starting point, and a system prompt instructing JSON-only output.
  4. Response is validated with `schema.parse()`. Parse failures retry once with the validation error appended to the prompt; a second failure surfaces the error and lets the operator edit the props manually in a JSON editor.
- **Preview:** Embed `@remotion/player` for interactive preview. Scrubbing, play/pause, props editing in a side panel.
- **Render:**
  - `@remotion/renderer.renderMedia()` into `renders/<slug>-<timestamp>.mp4`.
  - Render settings: resolution (1080p30 default, 1080p60, 4K30), codec (h264, h265), quality preset (fast / balanced / quality), audio bitrate.
  - Progress shown inline; render is cancellable.
- **Composing multiple clips:** v1 ships one "assembled composition" template that accepts an intro template ref, an avatar clip path, an outro template ref, and optional lower-third overlays. More sophisticated sequencing waits for v2.

### F8. Jobs tray

- Bottom-of-window strip, always visible. Collapsed: shows count of active jobs and the most recent one's status. Expanded (click or `Ctrl+J`): full list of active and recent jobs.
- Per job: provider icon, kind (PVC training / Avatar training / TTS / Avatar video / Render), elapsed time, progress (if known), cancel button, "show log" button.
- Jobs persist across app restarts. On launch, the worker reconciles with each provider (polls status for any active `provider_job_id`) before accepting new jobs.
- Completed jobs linger in the tray for 60 seconds with a "done" state, then move to the history panel accessible via the Jobs screen.
- Windows toast notifications fire on completion / failure of any job marked "notify" (default: all long jobs).

### F9. Cost & usage

- Per-provider running totals for the current calendar month, sourced from both the operator's ledger (Lumo's own estimates) and the provider's reported usage (where APIs allow).
- Pre-operation previews on every paid call (see F3, F4, F6, F7).
- Exportable CSV of the ledger with columns `timestamp, provider, operation, units, unit_kind, usd_estimate, project_id, job_id`.

### F10. Settings

- **Providers:** key entry and re-test per provider. Claude Code status (read-only).
- **Claude Code:** default model (`claude-opus-4-7`), default temperature, override list for experimentation.
- **Upload transport:** S3/R2 credentials, cloudflared path, or direct (if supported). Per-project override available in project settings.
- **Render defaults:** resolution, codec, preset.
- **Projects root:** folder picker.
- **Logs:** open folder, set retention (default 14 days), set level (info / debug / trace).
- **Appearance:** light / dark / system. Compact density toggle.

## Data model (per project `state.db`)

Non-exhaustive; final column set to be decided at plan time.

```sql
CREATE TABLE voices (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,               -- 'elevenlabs'
  provider_voice_id TEXT NOT NULL,
  tier TEXT NOT NULL,                   -- 'ivc' | 'pvc'
  name TEXT NOT NULL,
  sample_seconds INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE avatars (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,               -- 'heygen'
  provider_avatar_id TEXT NOT NULL,
  tier TEXT NOT NULL,                   -- 'photo' | 'instant'
  source_ref TEXT NOT NULL,             -- path to source image or segment list JSON
  created_at INTEGER NOT NULL
);

CREATE TABLE scripts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  estimated_seconds INTEGER NOT NULL,
  parent_version_id INTEGER,            -- nullable; NULL for root
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (parent_version_id) REFERENCES scripts(id)
);

CREATE TABLE renders (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,                   -- 'avatar_clip' | 'composed'
  script_id INTEGER,
  voice_id INTEGER,
  avatar_id INTEGER,
  generation_mode TEXT,                 -- 'standard' | 'avatar_iv' (avatar_clip only)
  template_id TEXT,                     -- composed only
  output_path TEXT NOT NULL,
  status TEXT NOT NULL,                 -- 'pending' | 'running' | 'done' | 'failed'
  created_at INTEGER NOT NULL
);

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_job_id TEXT,
  kind TEXT NOT NULL,                   -- 'voice_train' | 'avatar_train' | 'tts' | 'avatar_video' | 'render'
  input_ref TEXT,
  output_path TEXT,
  status TEXT NOT NULL,
  last_polled_at INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE costs (
  id INTEGER PRIMARY KEY,
  job_id INTEGER,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  units INTEGER NOT NULL,
  unit_kind TEXT NOT NULL,              -- 'characters' | 'credits' | 'seconds'
  usd_estimate REAL NOT NULL,
  recorded_at INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
```

## Key flows in code terms

### Script generation

```ts
const resp = await claudeCode.invoke({
  model: 'claude-opus-4-7',
  systemPrompt: SCRIPT_SYSTEM_PROMPT,
  prompt: buildScriptPrompt(userPrompt, tone, targetDuration),
  outputFormat: 'json',
});
const parsed = ScriptResponseSchema.parse(resp);
await db.saveScript(parsed);
```

### Remotion prop filling

```ts
const template = await loadTemplate(templateName);
const jsonSchema = zodToJsonSchema(template.schema);

const resp = await claudeCode.invoke({
  model: 'claude-opus-4-7',
  systemPrompt: REMOTION_PROPS_SYSTEM_PROMPT,
  prompt: [
    userPrompt,
    `\nReturn JSON matching this schema:\n${JSON.stringify(jsonSchema, null, 2)}`,
    `\nDefault values:\n${JSON.stringify(template.defaultProps, null, 2)}`,
  ].join('\n'),
  outputFormat: 'json',
});

const props = template.schema.parse(resp);
await renderMedia({
  composition: template.id,
  serveUrl: bundleServeUrl,
  inputProps: props,
  outputLocation: renderPath,
  codec: 'h264',
});
```

### Avatar video generation

```ts
const audio = await elevenlabs.tts({
  voiceId: project.voiceId,
  text: script.bodyMd,
});
const audioPath = await writeBuffer(audio, tmpAudioPath);
const audioUrl = await uploadTransport.put(audioPath, remoteKey);

const job = await heygen.generateVideo({
  avatarId: project.avatarId,
  audioUrl,
  mode: chosenMode,                  // 'standard' | 'avatar_iv'
  dimensions: settings.dimensions,   // e.g. { width: 1920, height: 1080 }
});

await db.jobs.insert({
  provider: 'heygen',
  providerJobId: job.id,
  kind: 'avatar_video',
  inputRef: script.id,
  status: 'running',
});
// Worker polls until status === 'completed', downloads MP4 to video/avatar/
```

### PVC training submission

```ts
const takes = await db.voices.takesMarkedGood(projectId);
const concatenated = await ffmpeg.concatWav(takes.map(t => t.path));

const submission = await elevenlabs.createPVC({
  name: `${project.name} — ${operator.name}`,
  files: [concatenated],
});

await db.jobs.insert({
  provider: 'elevenlabs',
  providerJobId: submission.id,
  kind: 'voice_train',
  inputRef: takes.map(t => t.id).join(','),
  status: 'running',
});
// Worker polls ElevenLabs until the voice is available; writes voice_id to voices table
// and fires a Windows toast notification
```

## Acceptance criteria (v1 "done")

Lumo v1 is done when a cold operator on a fresh Windows 11 machine — with Claude Code already installed and authenticated via Pro Max, plus accounts with ElevenLabs and HeyGen API — can, within a single working day and without opening a terminal or editing a file by hand:

1. Install the app.
2. Enter the ElevenLabs and HeyGen API keys (progressive, as each is first needed).
3. Record ≥ 30 minutes of voice samples in-app, mark them good, submit for PVC training, close the app, come back later, and find the voice ready.
4. Import 2+ minutes of video, pick clean segments, submit for Instant Avatar training, and receive it back trained.
5. Generate a 2-minute explainer script via a single prompt.
6. Produce a lip-synced MP4 from that script using their voice and avatar.
7. Prompt the app for an intro and outro and render a composed final MP4.

All seven must succeed without the operator opening a terminal, editing a config file, or copying files between folders by hand.

## Explicit non-features (v1)

- No YouTube / LinkedIn / Vimeo upload.
- No collaborative editing.
- No multi-track timeline.
- No non-English UI.
- No in-app billing.
- No HeyGen Studio-grade (human-review) avatar tier.

## Open questions to resolve at plan time

1. **HeyGen endpoint mapping** per tier and mode — which concrete endpoints to call for Photo Avatar training, Instant Avatar training, Standard generation, and Avatar IV generation. Confirm against current HeyGen API docs.
2. **Remotion embed approach** — `@remotion/player` scrubber in the React shell vs embedded Remotion Studio via `webview`. Pick based on bundle size and UX quality.
3. **Audio upload transport default** — S3/R2 vs cloudflared vs (if supported) HeyGen direct multipart. Verify current HeyGen upload options.
4. **Face-detection library** — `@vladmandic/face-api` vs a bundled ONNX model vs skip (if HeyGen's own upload validation is sufficient and we're OK with server-side rejection as the quality gate).
5. **Claude Code subprocess management** — single long-lived process with a JSON-line protocol vs one subprocess per invocation. Start with per-invocation for simplicity; revisit if throughput hurts.
6. **ffmpeg packaging** — bundle the static build via `ffmpeg-static` npm package vs require a system install. Default to bundled.
