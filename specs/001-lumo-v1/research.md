# Phase 0 Research: Lumo v1

Resolves the six plan-time questions flagged in the source spec. Each section
records the decision, the rationale, the alternatives rejected, and — where
applicable — the live-documentation sources consulted.

## 1. HeyGen API endpoint mapping (2026)

**Decision**: Use HeyGen API v2 endpoints. Upload audio via `POST https://upload.heygen.com/v1/asset` (raw binary body) and reference the returned id as `audio_asset_id`. Use `/v2/video/generate` for Standard avatar video and `/v2/video/av4/generate` for Avatar IV.

**Rationale**

- HeyGen v1/v2 endpoints are supported through at least late 2026; API-only use is explicitly supported on Pro / Scale / Enterprise plans, matching Lumo's "API subscription only" constraint.
- Avatar IV requires a pre-uploaded `image_key`; the same asset-upload primitive serves audio for both tracks, keeping transport logic uniform.
- Photo Avatar and Instant Avatar ("Digital Twin") training share a `group → train → poll status` shape. Exact training paths (especially Instant Avatar consent-video flow) change more often than the generate paths, so the implementation verifies them against `developers.heygen.com` at feature-build time.

**Endpoint mapping**

| Flow | Method | Path | Required fields |
|------|--------|------|-----------------|
| Photo Avatar — train | POST | `/v2/photo_avatar/train` | `group_id` (created via prior group-creation call) |
| Instant Avatar — train | POST | `/v2/video_avatar/...` | Consent video + name (exact path verified at implementation) |
| Asset upload (audio, image) | POST | `https://upload.heygen.com/v1/asset` | Raw binary body, `Content-Type: audio/mpeg` or `image/png`, `X-API-KEY` header |
| Standard generation | POST | `/v2/video/generate` | `video_inputs[]` with character + voice; audio via `audio_url` XOR `audio_asset_id` |
| Avatar IV generation | POST | `/v2/video/av4/generate` | `image_key` + script or audio asset |
| Video status poll | GET | `/v1/video_status.get?video_id=...` | |

**Alternatives considered**

- Multipart upload on the generate call — rejected. Generate requires `audio_url` XOR `audio_asset_id`; neither accepts multipart inline.
- Wait for v3 API — rejected. Not announced, and v2 is stable.

**Sources**

- https://docs.heygen.com/reference/create-an-avatar-video-v2
- https://docs.heygen.com/reference/upload-asset
- https://docs.heygen.com/changelog/new-avatar-iv-endpoints-create-avatar-iv-video
- https://docs.heygen.com/docs/photo-avatars-api
- https://docs.heygen.com/docs/video-avatars-api

## 2. ElevenLabs PVC / IVC minimum audio duration

**Decision**: Display a UI hint of **30 minutes** as the PVC floor (1–3 hours optimal) and **1 minute** as the IVC floor. Query the live provider at submit time and treat server-side validation as authoritative; hints are only for the record/import screens, never a gate on submission.

**Rationale**

- ElevenLabs docs consistently cite 30 min as the PVC floor with diminishing returns past ~60 min. Showing it up front prevents wasted record sessions.
- IVC accepts as little as 30 s in practice, but 1 min is the documented recommendation and a safer display default.
- Thresholds have drifted historically; hard-coding risks silently mis-blocking the operator.

**Alternatives considered**

- Hard-code a single number in the UI — rejected; drifts.
- Block the record UI behind a live API call — rejected; unnecessary round-trip and breaks offline-in-progress record work.

**Sources**

- https://elevenlabs.io/docs/creative-platform/voices/voice-cloning/professional-voice-cloning
- https://elevenlabs.io/docs/creative-platform/voices/voice-cloning/instant-voice-cloning

## 3. Remotion embed approach

**Decision**: Embed `@remotion/player` inside the Electron renderer. Do not attempt to embed Remotion Studio.

**Rationale**

- Remotion's own docs state Studio is not designed for embedding and requires its own backend; wrapping Player gives us scrub, prop-editing, and live re-render via React state without a webview boundary.
- Single-bundle React component avoids keyboard-shortcut collisions with Electron menus and lets Lumo's chrome surround the preview exactly.
- Licensing is the same whether we use Player or Studio, so not a differentiator.

**Alternatives considered**

- Studio via webview — rejected; not licensed for embedding, requires separate dev server.
- Headless render-only previews — rejected; loses live prop editing, which is the core of the composition UX.

**Sources**

- https://www.remotion.dev/docs/miscellaneous/embed-studio
- https://www.remotion.dev/docs/license

## 4. Audio-upload transport for HeyGen video generation

**Decision**: Default transport is **HeyGen's own Upload Asset API** (`POST https://upload.heygen.com/v1/asset`, raw binary) referenced by `audio_asset_id`. Fallback order: HeyGen upload → operator-owned S3/R2 pre-signed URL → cloudflared tunnel.

**Rationale**

- The generate API accepts `audio_asset_id`, so keeping audio inside HeyGen's asset store removes a whole class of egress/CORS/TLS edge cases for a single-operator desktop app.
- S3/R2 pre-signed URLs are a clean fallback if an operator already runs a bucket or HeyGen upload has a transient outage.
- cloudflared is a last-resort dev aid — painful to productise and introduces a runtime binary dependency, so it sits at the bottom of the fallback order rather than the top.

**Alternatives considered**

- Multipart-upload on the generate call — rejected; not a generate-call option. Generate requires `audio_url` XOR `audio_asset_id`.
- Cloudflared as default — rejected; fragile and requires a sidecar process per run.

**Sources**

- https://docs.heygen.com/reference/upload-asset
- https://docs.heygen.com/reference/create-an-avatar-video-v2
- https://docs.heygen.com/docs/using-audio-source-as-voice

## 5. Face-detection library for pre-upload quality gates

**Decision**: `@vladmandic/face-api` running in the renderer (TF.js WebGL backend), warn-only.

**Rationale**

- Feature is advisory; false negatives are tolerable, so a well-maintained JS library beats a custom ONNX pipeline on integration cost.
- Runs entirely in-renderer with no native bindings — keeps Electron packaging simple (no per-arch rebuilds, unlike `onnxruntime-node`).
- Models are ~6–10 MB lazy-loaded; trivial next to Remotion + Chromium footprint.
- Skipping local detection and relying on HeyGen's upload validation pushes failures to the end of a slow upload — poor operator UX.

**Alternatives considered**

- `onnxruntime-node` + bundled model — rejected; native-binding packaging burden and no quality win for a warn-only gate.
- Rely on HeyGen validation only — rejected; feedback arrives after upload, wasting time and bandwidth.
- `Human` library (face-api's successor) — reasonable but larger and broader than the one check we need; revisit if multi-face/liveness becomes a requirement.

**Sources**

- https://github.com/vladmandic/face-api
- https://www.npmjs.com/package/@vladmandic/face-api

## 6. Claude Code subprocess management

**Decision**: One subprocess per invocation. `claude --print --output-format json --model <model>`. Revisit stream-json long-lived mode only if measured startup cost dominates a real workflow.

**Rationale**

- `--print` is the documented, stable headless path. Stream-json input mode exists but is explicitly under-documented (see anthropics/claude-code#24594) — a reliability risk for a shipping app.
- Per-invocation processes give trivial cancellation (kill the child), clean concurrency (spawn N), and per-call resource isolation.
- Claude Code startup is on the order of a few hundred ms; negligible next to HeyGen/ElevenLabs latencies that dominate each step.
- A long-lived subprocess would need session-state management, framing-error recovery, and back-pressure — significant complexity for a v1 single-operator app.

**Alternatives considered**

- Long-lived `--input-format stream-json --output-format stream-json` — rejected for v1; reconsider if profiling shows subprocess churn matters.
- Claude Agent SDK in-process — viable future path, out of scope while v1 standardises on the CLI contract.

**Sources**

- https://code.claude.com/docs/en/headless
- https://github.com/anthropics/claude-code/issues/24594
- https://platform.claude.com/docs/en/api/sdks/cli

## Bonus: ffmpeg packaging (flagged in source spec)

**Decision**: Bundle via `ffmpeg-static` npm package.

**Rationale**

- Constitution forbids requiring the operator to edit PATH or touch config. A system-installed ffmpeg is operator work.
- `ffmpeg-static` resolves to a platform-appropriate binary at install time; Electron Builder copies it into the installer.
- Binary size (~70 MB) is acceptable against a v1 installer that already ships Chromium.

**Alternatives considered**

- System ffmpeg — rejected; shifts burden onto operator.
- `@ffmpeg/ffmpeg` (WASM) — rejected; materially slower for concat and segment extraction.

## Summary: technical context after research

- **Language**: TypeScript 5.x strict.
- **Runtime**: Electron 31+ with Node 20+.
- **Build**: Vite for renderer, `electron-builder` for installer packaging.
- **State**: `better-sqlite3` (one DB per project), `keytar` for secrets, filesystem for blobs.
- **AI**: Claude Code CLI via per-invocation subprocess. Default model `claude-opus-4-7`.
- **Voice**: ElevenLabs REST (PVC + IVC + TTS).
- **Avatar**: HeyGen v2 REST; audio via `upload.heygen.com/v1/asset` referenced by `audio_asset_id`.
- **Composition**: Remotion with `@remotion/player` in renderer; `@remotion/renderer` in main for output.
- **Face detection**: `@vladmandic/face-api` in renderer, warn-only.
- **ffmpeg**: bundled via `ffmpeg-static`.
- **Target**: Windows 11 x64 only.

No unresolved `NEEDS CLARIFICATION` remains. Plan proceeds to Phase 1.
