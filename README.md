# Lumo

Single-operator Windows desktop app that turns a prompt into a lip-synced
branded avatar video. Orchestrates Claude Code CLI (scripting), ElevenLabs
(voice), HeyGen (avatar), and Remotion (composition) into one local
workflow.

Built for one operator on one machine. No accounts, no cloud sync, no
telemetry. Every paid operation shows a cost preview first.

## Prerequisites

- **Windows 11 x64** — the only supported platform.
- **Node.js 20+** (`node --version`).
- **Claude Code CLI**, installed and authenticated.
  ```powershell
  winget install Anthropic.Claude
  claude /login
  ```
- **ElevenLabs account** — any tier works for text-to-speech; Creator or
  higher for Professional Voice Cloning.
- **HeyGen account** with API access — Pay-as-you-go, Pro, or Scale tier.
  Web-tier subscription is not required.

API keys for ElevenLabs and HeyGen are entered **in the app** at first use
and stored in Windows Credential Manager via `keytar`. They never touch
disk in plaintext and never appear in logs.

## Getting the code

```powershell
git clone https://github.com/KennyLowe/video-avatar.git
cd video-avatar
npm install
```

Native dependencies (`better-sqlite3`, `keytar`) are rebuilt against
Electron's Node ABI automatically by the `postinstall` hook.

If you're on a mapped network drive or UNC path, the install works but
running the app does not — Chromium's sandbox fails to initialise on
non-local paths. Clone to a local drive (e.g. `C:\video-avatar`).

## Running

```powershell
npm run dev        # Electron with hot reload — use this for iteration
npm run build      # production bundle into dist/
npm run package    # electron-builder — NSIS installer, portable exe, zip
```

On first launch the app:

1. Checks `claude --version` silently; shows a non-dismissible banner on
   the Home screen if Claude Code is missing or unauthenticated.
2. Prompts for a **projects root** folder. Every project lives as a
   sub-folder beneath it.
3. Requests provider keys progressively — only when the step that needs
   them is first used.

## First project (5–10 minutes of active time)

See [`specs/001-lumo-v1/quickstart.md`](./specs/001-lumo-v1/quickstart.md)
for the full walkthrough. The short version:

1. **Home** → New project.
2. **Script** (`Ctrl+3`) — prompt Claude for a script; review, approve.
3. **Generate** (`Ctrl+4`) — pick a stock voice + stock avatar, confirm
   the cost preview, click Run. Jobs tray (`Ctrl+J`) shows progress.
4. When the pipeline finishes, the avatar MP4 plays inline.

From there, custom voice training, custom avatar training, and branded
composition are each their own screen.

## Distribution formats

`npm run package` emits three artefacts into `out/`:

- **`Lumo-Portable-<version>.exe`** — single self-extracting exe, no
  install, no admin. Runs off a USB stick.
- **`Lumo-<version>-zip.zip`** — folder-shaped distribution. Unzip
  anywhere, run `Lumo.exe`.
- **`Lumo-Setup-<version>.exe`** — traditional NSIS installer, per-user
  install to `%LOCALAPPDATA%\Programs\Lumo`. No admin required.

None of the three are signed. Windows SmartScreen warns "unknown
publisher"; click **More info → Run anyway**. Code-signing with an EV
certificate is a release-gate decision the operator makes.

## Development gates

```powershell
npm run lint       # ESLint incl. Lumo's custom rules
npm run typecheck  # tsc --noEmit across all five project trees
npm run test       # vitest — contract + integration
npm run test:ui    # Playwright-Electron UI flows
```

All four run on every push via [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).
A red CI blocks further work per the constitution.

## Where things live

| What | Where |
|------|-------|
| App state (per project) | `<project>/lumo.db` + sibling folders |
| Provider credentials | Windows Credential Manager, target `Lumo/<provider>` |
| Logs | `%APPDATA%\Lumo\logs\<YYYY-MM-DD>.jsonl` (secrets redacted) |
| Settings | `%APPDATA%\Lumo\settings.json` |

## Documentation

- **Product intent, user flows, requirements**:
  [`specs/001-lumo-v1/spec.md`](./specs/001-lumo-v1/spec.md)
- **Implementation plan, FR→HOW mapping**:
  [`specs/001-lumo-v1/plan.md`](./specs/001-lumo-v1/plan.md)
- **Operator walkthrough**:
  [`specs/001-lumo-v1/quickstart.md`](./specs/001-lumo-v1/quickstart.md)
- **Project constitution** (principles, non-negotiables, invariants):
  [`.specify/memory/constitution.md`](./.specify/memory/constitution.md)
- **Contributor / agent context**:
  [`CLAUDE.md`](./CLAUDE.md)

## Licence

UNLICENSED. Not open-source, not distributed, not supported. If you've
been given access, treat it as a personal tool.
