# Quickstart: Lumo v1

The operator's first five minutes, for a fresh install on a clean Windows 11
machine.

## Prerequisites

- Windows 11 x64.
- **Claude Code CLI installed and authenticated** via Claude Pro Max. If not:
  ```pwsh
  winget install Anthropic.Claude
  claude /login
  ```
- An ElevenLabs account (any tier; PVC is on Creator and up).
- A HeyGen account with API access (Pay-as-you-go, Pro, or Scale).

## Install

1. Download the current `Lumo-Setup-<version>.exe` installer from the Releases folder.
2. Run the installer. It ships its own copy of `ffmpeg` and Chromium.
3. Launch Lumo. On first launch:
   - Lumo runs `claude --version` silently. A non-dismissible banner appears on Home if it fails.
   - Lumo prompts for a **projects root** directory. Pick a folder with plenty of disk; Lumo will own every sub-path.

## First project: stock-voice / stock-avatar end-to-end (≤ 10 minutes of active time)

This is User Story P1 from the spec. It proves the pipeline without requiring voice or avatar training.

1. **Create a project.** Home → New Project. Name it anything (e.g. `Demo`).
2. **Script** (`Ctrl+3`). Enter a one-line prompt:
   > "A 30-second explainer of what Lumo is and why someone would use it."
   Pick tone = Conversational, target length = 30s. Click Generate. Claude Code returns a script; review and approve.
3. **Generate** (`Ctrl+4`). Pick:
   - **Voice**: one of ElevenLabs' stock voices (no training needed). First time you land here, Lumo prompts for the ElevenLabs key. Paste it; click Test; save on success.
   - **Avatar**: one of HeyGen's stock avatars. First time, Lumo prompts for the HeyGen API key. Paste it; click Test; save on success.
   - **Mode**: Standard.
4. Review the cost preview (character count, credit burn, USD estimate, month-to-date). Click Run.
5. The Jobs tray (`Ctrl+J`) shows the pipeline: `tts → upload → avatar_video`. HeyGen typical time is 1–3 minutes for 30 s output.
6. On completion a Windows toast fires. An inline MP4 player opens on the Generate screen. Play it.

You have a lip-synced MP4 of a stock avatar reading an AI-generated script. Total active time: a few minutes; total wall time: however long HeyGen takes.

## Next: add a branded intro/outro (Compose, P4)

1. **Compose** (`Ctrl+5`). Pick the `FullExplainer` template.
2. Prompt in natural language, e.g.:
   > "Dell blue #0076CE, title 'What Lumo does', subtitle 'Kenny Lowe', body is the avatar clip I just made."
3. Lumo sends the prompt + the template's schema + the starting props to Claude Code. The returned JSON is validated; on failure a JSON editor opens with the error.
4. Preview scrubs in the inline `@remotion/player`. Adjust props live.
5. Click Render. Render settings default to 1080p30 / h264 / balanced. The output MP4 lands in `<project>/renders/`.

## Next: train a custom voice (P2)

1. **Voice** (`Ctrl+1`). Pick your input device. Click Record.
2. Record natural-register passages totalling at least **30 minutes of marked-good audio**. You can record in short chunks; Lumo concatenates at submit time.
3. Mark each take as good (space) or bad (b). The "good minutes" counter is always visible.
4. Click **Train Professional Voice Clone (PVC)**. The UI shows "typically 2–4 hours." Close the app.
5. On next launch the worker reconciles; on completion a Windows toast fires. The voice appears in the Generate screen's voice picker.

## Next: train a custom avatar (P3)

1. **Avatar** (`Ctrl+2`). Pick the tier:
   - **Photo Avatar**: drop in a 1024 px+ portrait or grab a frame from an imported clip.
   - **Instant Avatar**: import 2–5 minutes of clean on-camera video; mark 1–N clean segments.
2. Quality heuristics run inline; warnings are informational (you can proceed).
3. Click Train. The job persists. On completion a toast fires and the avatar appears in the Generate screen's avatar picker.

## Things worth knowing

- **Jobs survive restarts.** Anything long-running (PVC, avatar train, avatar video, render) is safe to close the app on.
- **Cost preview before every paid run.** You can always abandon at the preview screen for zero cost.
- **Errors are verbatim.** If ElevenLabs or HeyGen rejects a request, you see the provider's message plus one concrete next step.
- **Every primary action has a shortcut.** The shortcut is visible on the button itself; top-level screens are reachable with `Ctrl+0..5`, `Ctrl+J`, `Ctrl+,`.
- **Logs** live at `%APPDATA%\Lumo\logs\`. Secrets are redacted.
- **Delete a project?** Home → right-click → Delete → type the project name. It goes to Windows Recycle Bin, not `/dev/null`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Home banner: "Claude Code not found" | `claude` not on PATH | `winget install Anthropic.Claude`, then click Recheck on the banner. |
| Home banner: "Claude Code not authenticated" | Never logged in, or Pro Max session expired | `claude /login`, then Recheck. |
| ElevenLabs Test fails with 401 | Wrong key or wrong plan | Paste the correct key from ElevenLabs → Settings → API Keys; save. |
| HeyGen Test fails with 401 or 403 | Wrong key, or no API tier on the account | In HeyGen → Settings → API, confirm you're on Pay-as-you-go or Pro; regenerate the key. |
| Generate run fails at "upload" | All configured transports unavailable | Settings → Upload Transport. HeyGen upload is the default; if it's down, provide S3/R2 creds or install `cloudflared`. |
| Composition render fails with "invalid template" | A dropped `.tsx` is missing a required export | Check the Template picker's invalid tab; it lists the specific missing export. |
