<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.1.0
Rationale: MINOR — new Governance sub-item added ("Continuous integration
  gate"). No existing principle, non-negotiable, or invariant altered.

Modified principles: none
Added sections:
  - Governance → "Continuous integration gate" (new sub-item, after
    Compliance review)
Removed sections: none

Templates audited:
  - .specify/templates/plan-template.md      ✅ no change needed (Constitution
      Check gate references the file generically and resolves at runtime)
  - .specify/templates/spec-template.md      ✅ no change needed
  - .specify/templates/tasks-template.md     ✅ no change needed
  - .specify/templates/checklist-template.md ✅ no change needed
  - .specify/templates/agent-file-template.md ✅ no change needed

Follow-up TODOs:
  - Working name "Lumo" still flagged by the disclaimer below. Decide
    before first commit whether to rename; a rename is a PATCH bump.

Prior amendments
================
v1.0.0 (2026-04-17): First formal version pin. Principles and invariants were
  already in force; this amendment added the missing Governance section and
  version footer so the document conforms to the Spec Kit template contract.
-->

# Constitution — Lumo

> Working name. Rename before commit 1 if you want.

## Purpose

Lumo is a single-operator Windows desktop application that turns an idea into a rendered, lip-synced, branded avatar video without the operator leaving the app. It orchestrates four external capabilities:

- **Claude Code CLI** (local subprocess, default model `claude-opus-4-7`) — all AI reasoning: scripts, edits, Remotion prop generation, suggestions. Authenticated via an existing Claude Pro Max subscription on the operator's machine; Lumo does not own those credentials.
- **ElevenLabs** — voice cloning (Professional Voice Clone is the standard path) and text-to-speech.
- **HeyGen** — avatar training (operator-selectable tier) and audio-driven lip-synced video generation. **API subscription only**; no separate web-tier subscription is required or assumed.
- **Remotion** — programmatic React-based composition and rendering.

Lumo is a personal tool. Design decisions optimize for one operator on one machine, not for a market, a team, or eventual SaaS-ification.

## Principles

1. **Boring tech, sharp edges hidden.** Electron + React + TypeScript + Vite. `better-sqlite3`. `zod`. `keytar`. `ffmpeg` as a bundled sidecar. Pick the library everyone picks. The interesting work is in pipeline wiring, not the stack.
2. **One operator, one machine.** No accounts, no cloud sync, no analytics, no telemetry. State lives in the project folder and `%APPDATA%\Lumo`.
3. **Secrets never touch disk in plaintext.** Provider API keys go in Windows Credential Manager via `keytar`. Never in `.env`, never in a settings JSON, never logged, never surfaced in error messages.
4. **Every long-running external job is resumable.** PVC training runs for hours; HeyGen renders can take minutes to tens of minutes. If the operator closes the laptop mid-job, the job survives. Jobs are persisted with provider job IDs and polled by a single background worker on launch.
5. **Errors are explicit, actionable, and verbatim.** Surface the provider's error message plus one concrete next-step suggestion. "Something went wrong" is a defect. Swallowed exceptions are a defect.
6. **Async by default for long jobs, sync for short jobs.** No blocking modal spinners on anything that could take more than five seconds. A persistent jobs tray at the bottom of every window shows active work.
7. **AI output is always reviewable before it's consumed.** Generated scripts, generated Remotion props, generated edits — the operator sees the result, approves, and only then does the app act on it.
8. **Remotion components are typed templates, never free-form generated code.** Each template ships as a `.tsx` file with an exported Zod `schema` and `defaultProps`. Claude Code produces only a JSON object matching the schema. The app validates with `schema.parse()` before render. No `eval`. No dynamic `.tsx` emission at runtime.
9. **Linear first, non-linear later.** v1 flow is: onboarding → voice → avatar → script → generate → compose → render. Remixing, branching, and multi-scene compositions come in v2.
10. **No feature ships in v1 that cannot be demonstrated end-to-end in v1.** Half-implemented screens are worse than missing screens.

## Non-negotiables

- **Platform:** Windows 11 x64. No macOS, no Linux, no cross-platform target.
- **Language:** TypeScript throughout. Minimal native (Rust or C++) code only if keychain or audio recording genuinely requires it. No `.js` files committed.
- **Runtime:** Electron, Node 20+, Vite for dev, `electron-builder` for packaging.
- **No `eval`** of any model-generated code, ever. No `new Function(...)`, no dynamic `require` of generated paths.
- **One typed SDK wrapper per provider.** `src/providers/claudeCode.ts`, `src/providers/elevenlabs.ts`, `src/providers/heygen.ts`. No inline `fetch()` calls in UI components or elsewhere.
- **All filesystem paths are absolute and normalized** via `path.resolve` and `path.join`. Never string-concatenate paths.
- **Claude Code default model is `claude-opus-4-7`.** Configurable per invocation, not per app build.
- **Every paid operation shows a cost preview before it runs**, and a running month-to-date total for that provider.
- **No feature requires the operator to edit a config file, open a terminal, or move files by hand** between steps of a normal workflow.

## Technical invariants

- **State:** SQLite via `better-sqlite3` for project metadata, job queue, cost ledger, and history. Filesystem for blobs (audio takes, video clips, renders). Windows Credential Manager for secrets via `keytar`.
- **Logs:** Structured JSON Lines to `%APPDATA%\Lumo\logs\<YYYY-MM-DD>.jsonl`. Rotated daily. Secrets never appear. API responses that embed secrets are redacted before logging.
- **Long jobs:** Persisted to a `jobs` table with `provider`, `provider_job_id`, `kind`, `status`, `created_at`, `polled_at`, `input_ref`, `output_path`, `error`. A single worker polls active jobs on exponential back-off (5s → 2min cap). On app launch, the worker reconciles state with each provider before accepting new jobs.
- **Cancellation:** Every long job has a cancel path that best-effort cleans up the remote resource.
- **Claude Code subprocess contract:** `claude --print --output-format json --model <model>`. System prompts and user prompts over 4 KB go via stdin. stdout is parsed as JSON; stderr is captured to the log. Per-call timeouts are enforced. Lumo assumes `claude` is on `PATH` and authenticated.
- **Auto-update:** Off by default for v1. Releases are manual installers.

## UX invariants

- **Progressive disclosure of setup.** ElevenLabs and HeyGen API keys are requested at the step that first needs them — not in a monolithic onboarding form. Claude Code availability is checked silently at launch; the operator is only interrupted if it is missing or unauthenticated.
- **One primary action per screen.** One obvious button. Destructive actions require an explicit confirmation with the object's name.
- **Keyboard-first.** Every primary action has a visible shortcut. Navigation between the six core screens is a single keystroke.
- **Cost preview before spend.** Any paid call shows estimated units, estimated USD, and the running month-to-date for that provider.
- **The app owns disk layout.** The operator picks a projects root. Everything inside is Lumo's responsibility to name, nest, and clean up.
- **Latency is never mysterious.** Every async operation shows progress, an ETA, or a "typically takes N minutes / hours" hint.

## Scope boundary

**Out of scope for v1:**

- macOS, Linux, or web deployment.
- Multi-user, team, or shared-project features.
- Publishing / upload integrations (YouTube, LinkedIn, Vimeo, public S3).
- Real-time frame-level editing of avatar video.
- HeyGen's human-review "Studio-grade" avatar tier.
- Multi-track timeline editing.
- Non-English UI.
- In-app purchase or billing flows. The operator pays providers directly.

## Definition of done for v1

A cold operator on a fresh Windows 11 machine — with Claude Code already installed and authenticated via Pro Max, plus accounts with ElevenLabs and HeyGen API — can, within a single working day and without opening a terminal or editing a file by hand, produce a composed, lip-synced MP4 of themselves reading an AI-generated script with a custom intro and outro.

## Governance

This constitution supersedes any informal convention, comment, or prior README
statement it contradicts. Principles, Non-negotiables, and Technical/UX
invariants are binding on every change to this repository.

**Authority.** The sole operator is both author and reviewer. Because there is
no second human gate, the operator MUST self-enforce the principles during code
review of their own PRs and MUST record any deliberate deviation in the PR
description with a link to the principle or invariant being bent.

**Amendment procedure.**

1. Propose the change as an edit to this file in the same PR as the code that
   requires it. Never amend the constitution in a standalone "cleanup" PR.
2. Prepend or update the Sync Impact Report HTML comment at the top of this
   file with: old → new version, list of modified/added/removed sections, and
   any template files that need to follow.
3. Bump the version per the policy below and update the footer's
   `Last Amended` date to the commit date (ISO `YYYY-MM-DD`).
4. Propagate the change: any template in `.specify/templates/` whose gates or
   task categories reference an altered principle MUST be updated in the same
   commit.

**Versioning policy.** Semantic versioning applied to governance, not code.

- **MAJOR** — a principle, non-negotiable, or invariant is removed or
  redefined in a backward-incompatible way (e.g. dropping "No `eval`",
  swapping the target platform, allowing plaintext secrets).
- **MINOR** — a new principle, non-negotiable, invariant, or top-level section
  is added, or existing guidance is materially expanded.
- **PATCH** — wording, typo, clarification, or reordering with no change in
  meaning. Renaming the project qualifies as PATCH.

**Compliance review.** Every PR description MUST confirm either "no
constitutional impact" or list the principles/invariants touched. The
`/speckit.plan` Constitution Check gate is the enforcement point for new
features; it MUST fail closed if a plan contradicts a principle without a
recorded deviation.

**Continuous integration gate.** After every push to any branch on the
GitHub remote, the triggered GitHub Actions run MUST be watched to
completion before any further work is planned or executed on that branch.
A run whose `conclusion` is anything other than `success` counts as a
failure and blocks forward progress until remediated. A step allowed to
pass via `continue-on-error: true` MUST either (a) resolve to `success`
on the next push once the underlying cause lands, or (b) be removed with
a one-line justification in the same commit that removes it. Silent
`continue-on-error` that never resolves is a defect. Ignoring a red CI
to keep moving — "it's just the tests", "the build step doesn't matter
yet" — is a defect. The operator is the reviewer here; the CI is the
only independent second opinion we have, and discarding it defeats the
purpose of having it.

**Precedence.** When this file conflicts with a README, a code comment, or a
template, this file wins until the conflicting artifact is updated in a
follow-up commit.

**Version**: 1.1.0 | **Ratified**: 2026-04-17 | **Last Amended**: 2026-04-17
