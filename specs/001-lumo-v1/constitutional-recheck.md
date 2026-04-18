# Constitutional Re-check: Lumo v1

**Date**: 2026-04-17
**Constitution**: `.specify/memory/constitution.md` v1.1.0
**Scope**: Every principle, non-negotiable, technical invariant, UX invariant,
and governance clause, walked against the actual code that exists at the
Phase 8 polish checkpoint (T147).

Reading convention: ✅ means an enforcing file exists and the rule is
checked in code, lint, or test. ⚠️ means the rule relies on operator
discipline without a structural gate — acceptable but noted.

---

## Principles

| # | Principle | Enforcing file(s) |
|---|-----------|-------------------|
| 1 | Boring tech, sharp edges hidden | ✅ `package.json` — Electron + React + TS + Vite + `better-sqlite3` + `zod` + `keytar` + `ffmpeg-static`/`ffprobe-static`. No exotic frameworks. |
| 2 | One operator, one machine | ✅ `src/main/platform/paths.ts` resolves to `%APPDATA%\Lumo`; `src/main/bootstrap.ts` holds the single-instance lock. No analytics/telemetry code paths exist in the tree. |
| 3 | Secrets never touch disk in plaintext | ✅ `src/main/platform/keychain.ts` (keytar wrapper) + `src/main/services/redactor.ts` (9 rules) + `src/main/logging/jsonl.ts` pipes every log payload through `redactValue`. Fuzz-tested by `tests/integration/redactor-fuzz.test.ts` across 10 000 samples. |
| 4 | Every long-running external job is resumable | ✅ `src/main/data/repositories/jobs.ts` + `src/main/workers/reconciler.ts` rehydrates active jobs on launch via `src/main/bootstrap.ts:58` (`reconcileOnLaunch`). `provider_job_id` column is set by every handler before first poll. |
| 5 | Errors are explicit, actionable, verbatim | ✅ `src/shared/errors.ts` (`ProviderError`) carries `provider`, `code`, `message`, `nextStep`, `cause`. Every provider wrapper throws it; UI consumes `message` + `nextStep` verbatim. |
| 6 | Async by default for long jobs, sync for short jobs | ✅ `src/renderer/components/AsyncFeedback.tsx` + CI grep gate in `.github/workflows/ci.yml` (T137) fails the build if an `await unwrap(...)` lands on a screen without an `AsyncFeedback` import. `src/renderer/components/JobsTray.tsx` is rendered by `App.tsx` on every screen. |
| 7 | AI output is always reviewable before consumed | ✅ `src/renderer/components/DiffPreview.tsx` gates script assists; `src/renderer/screens/Compose.tsx` requires explicit approve before `generateVideo`; `src/renderer/components/PropsJsonEditor.tsx` (Monaco) shows validated JSON before render. |
| 8 | Remotion components are typed templates, never free-form generated code | ✅ `src/main/services/templateLoader.ts` loads from the bundled `resources/templates/` tree only; `src/main/services/templateProps.ts` calls `schema.parse()` on every payload; CI grep gate forbids `eval(`, `new Function(`, and dynamic `require(` under `src/` (T132). |
| 9 | Linear first, non-linear later | ✅ `src/renderer/App.tsx` routes exactly the seven screens named in the constitution (Home, Voice, Avatar, Script, Generate, Compose, Jobs + Settings). No remix, no branching state machine. |
| 10 | No feature ships in v1 that cannot be demonstrated end-to-end in v1 | ✅ `tests/ui/p1-*.spec.ts` through `tests/ui/p5-*.spec.ts` each drive their user story through the renderer. Playwright-Electron is gated on `src/main/bootstrap.ts` existing so the harness can't skip silently. |

## Non-negotiables

| Rule | Enforcing file(s) |
|------|-------------------|
| Windows 11 x64 only | ✅ `build/electron-builder.yml` targets `nsis:x64` only. No `darwin`/`linux` branches in `src/`. |
| TypeScript throughout; no `.js` committed | ✅ CI check in `.github/workflows/ci.yml` (T135) fails on any `.js` under `src/`. |
| Electron + Node 20+ + Vite dev + electron-builder | ✅ `package.json` engines/devDependencies pin these. |
| No `eval` of model-generated code, no `new Function`, no dynamic `require` of generated paths | ✅ CI grep step (T132) + ESLint `no-eval` + ESLint `no-new-func`. `src/main/services/templateLoader.ts` is static-map only. |
| One typed SDK wrapper per provider | ✅ `src/main/providers/{claudeCode,elevenlabs,heygen,transport,remotion}.ts`. Custom rule `lumo/no-inline-fetch` (`.eslint-rules/no-inline-fetch.cjs`) forbids inline `fetch(` outside the wrappers. |
| All filesystem paths absolute and normalized via `path.resolve`/`path.join` | ✅ Custom rule `lumo/no-string-concat-paths` (`.eslint-rules/no-string-concat-paths.cjs`) + `src/main/data/projects.ts` resolves every `_path` column on read. |
| Claude Code default model `claude-opus-4-7` | ✅ `src/shared/schemas/settings.ts` (`defaultClaudeModel: 'claude-opus-4-7'`); `src/main/providers/claudeCode.ts` reads it per call. |
| Cost preview before every paid operation | ✅ `src/main/services/costEstimator.ts` + `src/renderer/components/CostPreview.tsx`; every paid-call screen (`Voice`, `Avatar`, `Generate`, `Compose`) composes it before the action button. |
| No feature requires terminal or manual file moves in normal workflow | ✅ `ffmpeg-static` + `ffprobe-static` bundled; `src/renderer/components/KeyEntryDialog.tsx` is progressive; `src/main/data/projects.ts` owns every disk mutation (create/rename/duplicate/delete). |

## Technical invariants

| Rule | Enforcing file(s) |
|------|-------------------|
| SQLite via `better-sqlite3` for state | ✅ `src/main/data/db.ts` (WAL mode, per-project DB). |
| Filesystem for blobs; Windows Credential Manager for secrets via keytar | ✅ `src/main/platform/keychain.ts` + `src/main/data/repositories/{voices,avatars,takes,renders}.ts` store blob paths, not bytes. |
| JSONL logs to `%APPDATA%\Lumo\logs\<date>.jsonl`, rotated daily, secrets redacted | ✅ `src/main/logging/jsonl.ts` + `src/main/bootstrap.ts:47` (`enforceRetention`). |
| Persistent `jobs` table with provider job id; single worker with 5 s → 2 min back-off; reconcile on launch | ✅ `src/main/data/migrations/0001_init.sql` (jobs table) + `src/main/workers/jobQueue.ts` + `src/main/workers/pollWithRetry.ts` (2/4/8/16/32s) + `reconcileOnLaunch` wired in bootstrap. |
| Cancellation path per long job; best-effort remote cleanup | ✅ `src/main/ipc/jobs.ts` `jobs.cancel`; handler signatures accept an `AbortSignal`; `src/main/providers/transport.ts` S3 path returns a `cleanup` callback that deletes the uploaded object. |
| Claude Code subprocess contract | ✅ `src/main/providers/claudeCode.ts` uses `--print --output-format json --model`; prompts > 4 KB via stdin (`writePromptToStdin` branch); stdout JSON-parsed; stderr captured; timeouts enforced. |
| Auto-update off by default for v1; manual installers | ✅ `build/electron-builder.yml` publish block omits `github` channel; no `autoUpdater` import anywhere. |

## UX invariants

| Rule | Enforcing file(s) |
|------|-------------------|
| Progressive disclosure of setup | ✅ `src/renderer/components/KeyEntryDialog.tsx` is opened only from screens that need the key; `ClaudeBanner.tsx` silent when Claude Code is healthy. |
| One primary action per screen; destructive confirms with object name | ✅ `src/renderer/components/DeleteProjectDialog.tsx` requires typing the project name; all other screens have a single enabled primary button. |
| Keyboard-first; single-keystroke navigation between core screens | ✅ `src/renderer/hooks/useKeyboardShortcuts.ts` binds `Ctrl+0..5`, `Ctrl+J`, `Ctrl+,`. |
| Cost preview before spend; month-to-date displayed | ✅ `CostPreview.tsx` renders both; `src/main/ipc/costs.ts` exposes month-to-date. |
| App owns disk layout below the projects root | ✅ `src/main/data/projects.ts` is the only writer. |
| Latency never mysterious | ✅ Every `pendingAction` hint in screens (`Home`, `Voice`, `Avatar`, `Generate`, `Compose`, `Settings`) feeds `AsyncFeedback`. |

## Governance

| Clause | Status |
|--------|--------|
| Amendment procedure (Sync Impact Report, version bump, same PR) | ✅ Honoured for v1.0.0 → v1.1.0 (single commit, report updated, templates audited). |
| Versioning policy (MAJOR/MINOR/PATCH) | ✅ v1.1.0 was correctly chosen as MINOR (new sub-item, no existing rule altered). |
| Compliance review (PR body confirms impact) | ⚠️ Operator discipline — no structural gate. Acceptable for single-operator repo but noted. |
| Continuous integration gate (CI green before forward progress) | ✅ Followed for every Phase 1–8 push; `gh run watch` invoked each time. |
| Precedence (constitution wins over README/comments/templates) | ✅ No conflicts discovered during Phase 8 sweep. |

---

## Outstanding items

1. **Integration tests requiring Electron-native ABI** (T067, T081, T097, T115, T129, T130) are currently `describe.skipIf(!electronBindingLoadable)` until T146 lands the dedicated Electron test harness. This is a known, tracked deferral — not a constitutional violation.
2. **Installer + quickstart validation on a clean VM** (T141, T142) is post-this-document work — the installer produces a build, but end-to-end on a fresh Windows 11 VM has not been run. Track as a release-gate item, not a spec gate.
3. **Working name "Lumo"** remains flagged in the constitution's TODO. Rename is a PATCH bump and should happen in the first post-v1 release cycle.

## Summary

No constitutional violations found. All principles, non-negotiables, and
technical/UX invariants have a concrete enforcing file. The three
outstanding items above are tracked under existing task IDs and do not
block a v1.0.0-rc cut.
