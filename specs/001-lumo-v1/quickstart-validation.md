# Quickstart Validation

**Date**: 2026-04-18
**Task**: T142
**Installer under test**: `out/Lumo-Setup-0.0.0.exe` (253 MB, built from commit
at HEAD via `npm run build && npx electron-builder --win`).
**Environment**: dev box (not a clean Windows 11 VM — see caveat below).

This document walks each section of `quickstart.md` against the current
tree, confirms the claim matches the code, and calls out any step that
cannot be validated without a live account / fresh VM.

## Scope note

The quickstart's full end-to-end flow requires:

1. A clean Windows 11 install with no prior `%APPDATA%\Lumo` state.
2. Real Claude Code CLI authenticated via Pro Max.
3. Live ElevenLabs + HeyGen credentials with spend authorisation.

Those three together can only be exercised by the operator on their own
machine. This validation covers **what the code actually does** against
**what the doc claims**, plus a hands-off installer smoke (artifact
exists, size is sane, NSIS wrapper intact).

## Section-by-section verification

### Prerequisites

| Claim | Verified? | How |
|-------|-----------|-----|
| Windows 11 x64 | ✅ | `build/electron-builder.yml` targets `nsis:x64` only. |
| Claude Code CLI via Pro Max | ✅ | `src/main/providers/claudeCode.ts` spawns `claude --print --output-format json --model`; no embedded auth. |
| ElevenLabs account | ✅ | `src/main/providers/elevenlabs.ts` expects `xi-api-key` per `authedHeaders()`. |
| HeyGen API access | ✅ | `src/main/providers/heygen.ts` expects `X-Api-Key` per `authedHeaders()`. |

### Install

| Claim | Verified? | How |
|-------|-----------|-----|
| Installer ships ffmpeg + Chromium | ✅ | `asarUnpack` includes `ffmpeg-static` + `ffprobe-static`; Remotion's `@remotion/compositor-win32-x64-msvc` (which carries Chromium binary) is packaged into `resources/app.asar.unpacked`. Confirmed from electron-builder output during packaging. |
| Claude banner on launch | ✅ | `src/renderer/components/ClaudeBanner.tsx` driven by the Home screen; `src/main/ipc/credentials.ts` exposes a health-check IPC. |
| Projects-root picker | ✅ | `src/renderer/screens/Home.tsx:pickRoot()` invokes `lumo.settings.pickProjectsRoot`. |

### P1 stock-voice / stock-avatar flow

| Step | Verified? | How |
|------|-----------|-----|
| Create project | ✅ | `src/main/data/projects.ts:createProject` + Home UI. |
| Script prompt + Generate → Claude returns | ✅ | `src/main/ipc/scripts.ts` → `claudeCode.invoke`. Round-trip is covered by `tests/contract/providers/claudeCode.test.ts`. |
| Key entry first time → Test → save | ✅ | `src/renderer/components/KeyEntryDialog.tsx` + `src/main/ipc/credentials.ts`. Keys persist to `keytar` only (Principle #3). |
| Cost preview (characters + credits + USD + MTD) | ✅ | `src/main/services/costEstimator.ts` + `CostPreview.tsx`; cost rows written by `avatarVideo` handler after each paid step. |
| Jobs tray shows pipeline | ✅ | `src/renderer/components/JobsTray.tsx` + `useJobs` hook + `jobEvents.ts` push channel. |
| Windows toast on completion | ✅ | `src/main/platform/notifier.ts`. Fires from each handler's success path. |
| Inline MP4 player | ✅ | `src/renderer/screens/Generate.tsx` renders `<video>` on render ready. |

### Compose (P4)

| Step | Verified? | How |
|------|-----------|-----|
| `FullExplainer` template registered | ✅ | `resources/templates/FullExplainer.tsx` + `resources/templates/Root.tsx`. |
| Prompt → Claude → JSON validated against schema | ✅ | `src/main/services/templateProps.ts` runs `schema.parse` on every payload. |
| Live preview in `@remotion/player` | ✅ | `src/renderer/components/RemotionPreview.tsx`. |
| Render defaults 1080p30 / h264 / balanced | ✅ | `src/shared/schemas/settings.ts:DEFAULT_APP_SETTINGS.renderDefaults`. |
| Output lands in `<project>/renders/` | ✅ | `src/main/workers/handlers/render.ts:rendersDir`. |

### Voice training (P2)

| Step | Verified? | How |
|------|-----------|-----|
| Record / import / mark good-bad / trim | ✅ | `Voice.tsx` + `src/renderer/services/audioRecorder.ts`. |
| Good-minutes counter visible | ✅ | `Voice.tsx:minutes/seconds` from `TakesRepository.goodSecondsTotal`. |
| "Train PVC" button with `Ctrl+Enter` | ✅ | Phase-8 Block-5 fix added `useKeyboardShortcuts` + `<kbd>` hint. |
| Job survives restart via reconciler | ✅ | `src/main/workers/reconciler.ts` polls `getVoiceStatus(providerJobId)` and lands the voice row in `ready`/`failed` before the queue resumes. Integration-tested by `tests/integration/reconciler-p1.test.ts`. |

### Avatar training (P3)

| Step | Verified? | How |
|------|-----------|-----|
| Tier picker + importer | ✅ | `Avatar.tsx` `<select value={tier}>`. |
| Quality heuristics inline, informational | ✅ | `src/renderer/services/qualityHeuristics.ts` + `FaceDetectPanel.tsx`. |
| Train button + persist + toast | ✅ | `src/main/workers/handlers/avatarTrain.ts`. |

### Things-worth-knowing

| Claim | Verified? |
|-------|-----------|
| Jobs survive restart | ✅ Reconciler + integration test. |
| Cost preview before every paid run | ✅ Enforced by the structural pattern in each paid-call screen. |
| Verbatim errors | ✅ `tests/contract/providerErrors.test.ts` asserts the invariant for 6 shapes. |
| Every primary action has a shortcut | ✅ Audit passes — see `accessibility-audit.md`. |
| Logs at `%APPDATA%\Lumo\logs\`, secrets redacted | ✅ `logging/jsonl.ts` + 10 000-sample redactor fuzz. |
| Delete-to-Recycle-Bin | ✅ `projects.ts:deleteProject` uses `shell.trashItem`; integration-tested. |

## What this document does NOT cover

- **Actual install on a clean Windows 11 VM** — requires a VM. The
  installer binary has been produced at
  `S:/video-avatar/out/Lumo-Setup-0.0.0.exe` and packages without
  errors; file-level smoke (size, asar integrity, NSIS stub) is good.
- **Live end-to-end pipeline with real provider spend** — requires
  operator credentials. Every component is contract-tested against
  the provider's documented error/success shapes; real-world spend
  can only happen on the operator's machine.

These are tracked as a release-gate item, separate from the spec-
completion gate.

## Outcome

Every claim in `quickstart.md` that can be verified against the code
is verified. The two deferrals above are known and intentional —
they cannot be closed from CI or from this dev machine.
