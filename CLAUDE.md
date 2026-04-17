# Claude Code context — Lumo v1

Active feature: `specs/001-lumo-v1/`.
Authoritative documents:
- [Constitution](./.specify/memory/constitution.md)
- [Spec](./specs/001-lumo-v1/spec.md)
- [Plan](./specs/001-lumo-v1/plan.md)
- [Research](./specs/001-lumo-v1/research.md)
- [Data model](./specs/001-lumo-v1/data-model.md)
- [Contracts](./specs/001-lumo-v1/contracts/)

## Product in one line

Windows 11 desktop app (single operator) that turns a prompt into a lip-synced
branded avatar video via Claude Code (AI), ElevenLabs (voice), HeyGen (avatar),
and Remotion (composition).

## Stack (locked by the constitution)

- **Language**: TypeScript 5.5+ strict. No `.js` in `src/`.
- **Runtime**: Electron 31+, Node 20+, Vite 5 for dev, `electron-builder` for installer.
- **State**: `better-sqlite3` (one DB per project) + `keytar` (Windows Credential Manager) + filesystem for blobs.
- **Validation**: `zod` everywhere that data crosses a boundary (IPC, provider response, template props).
- **AI**: Claude Code CLI invoked per-call — `claude --print --output-format json --model claude-opus-4-7`. Default model `claude-opus-4-7`, configurable per invocation, not per build.
- **Voice**: ElevenLabs REST. PVC is the standard path; IVC is a labelled quick-test.
- **Avatar**: HeyGen v2 REST. Audio uploaded via `upload.heygen.com/v1/asset` and referenced by `audio_asset_id`.
- **Composition**: `@remotion/player` inside the renderer for preview; `@remotion/renderer` + `@remotion/bundler` in main for output.
- **Face detection**: `@vladmandic/face-api` in the renderer, warn-only.
- **ffmpeg**: bundled via `ffmpeg-static`.

## Repo layout (main paths)

- `src/main/` — Electron main. Subfolders: `ipc/`, `providers/`, `data/`, `workers/`, `services/`, `logging/`, `platform/`.
- `src/preload/` — `window.lumo.*` bridge.
- `src/renderer/` — React UI. Screens: Home, Voice, Avatar, Script, Generate, Compose, Jobs, Settings.
- `src/shared/` — Zod schemas + types shared across main/renderer.
- `resources/templates/` — bundled Remotion templates.
- `tests/` — `contract/`, `integration/`, `ui/` (Playwright-Electron), `fixtures/`.

## Non-negotiables (Claude: do not violate)

- **No `eval`**, no `new Function`, no dynamic `require` of generated paths. Ever.
- **Secrets never touch disk in plaintext.** Use `keytar` only. Redact before logging or surfacing errors.
- **One typed wrapper per provider.** No inline `fetch()` outside `src/main/providers/`.
- **All paths** go through `path.resolve` / `path.join`. No string-concatenated paths.
- **Every long external job** persists with a provider job id and is polled by the single worker; on app launch the worker reconciles before accepting new work.
- **Every paid operation** shows a cost preview (units + USD + month-to-date) before running.
- **Errors are verbatim.** Surface the provider's `.message` plus one concrete next step. Swallowed exceptions are defects.
- **Remotion templates are typed contracts, not generated code.** Claude produces JSON only; `schema.parse` gates every render.

## Active feature's five user stories (by priority)

1. **P1** — End-to-end avatar MP4 from prompt using stock voice + stock avatar.
2. **P2** — Train and use a custom PVC voice.
3. **P3** — Train and use a custom HeyGen avatar.
4. **P4** — Compose branded final with Remotion intro/outro/overlays.
5. **P5** — Operational polish (cost ledger, jobs tray, project management, settings).

P1 alone is a viable MVP. Each subsequent story is independently testable.

## Conventions

- File names: PascalCase React components, camelCase for everything else.
- Test naming: `<unit>.test.ts` for contract/integration, `pN-<scenario>.spec.ts` for Playwright.
- Zod schemas live under `src/shared/schemas/`; types are inferred, not hand-written.
- Logs: JSONL to `%APPDATA%\Lumo\logs\<YYYY-MM-DD>.jsonl`.
- Keychain targets: `Lumo/elevenlabs`, `Lumo/heygen`, `Lumo/s3` (optional).

## What to do when stuck

- Re-read the section of `specs/001-lumo-v1/spec.md` that covers the failing requirement (FR-###).
- If the decision is architectural, check `specs/001-lumo-v1/research.md`.
- If the decision is a contract, check `specs/001-lumo-v1/contracts/`.
- If none of those resolve it, surface the question; do not invent policy.

<!-- Do not edit below this line unless you are the Spec Kit tooling. -->
<!-- SPECIFY:BEGIN -->
<!-- SPECIFY:END -->
