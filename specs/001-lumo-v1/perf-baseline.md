# Performance Baseline: Lumo v1

**Date**: 2026-04-17
**Status**: Stub — measurement pass pending first post-install run.

This file captures the targets stated in `plan.md` under Performance Goals
and the method for measuring each. Actual numbers are recorded in the
**Observed** column once the packaged installer runs on the operator's
machine.

---

## Targets

| Metric | Target | Method | Observed |
|--------|--------|--------|----------|
| Script generation round-trip (p95) | ≤ 5 s over average home broadband | Instrument `src/main/providers/claudeCode.ts` to log `ts.call_start` and `ts.call_end`; run 50 typical prompts (200–800 tokens) from the Script studio and take the 95th percentile. | TBD |
| Avatar video end-to-end (typical, 30 s clip) | 1–5 min (HeyGen SLA-bound) | Log `jobs.submitted_at` → `jobs.completed_at` for 10 successful `avatar_video` jobs. Record mean + p95. | TBD |
| Remotion render (1080p30, 60 s composed piece, 8-core) | ≤ 2 min | Log render handler wall time for 5 runs of the same composition from the Compose screen. Machine spec captured in the run metadata. | TBD |
| App cold start (to first paint) | ≤ 3 s | Packaged installer only. `app.whenReady()` → `did-finish-load` from `BrowserWindow`. Measured on the operator's development box (Windows 11, Ryzen-class or better). | TBD |

## Method notes

- Timestamps come from the JSONL logger (`src/main/logging/jsonl.ts`) —
  no separate telemetry pipeline exists and none will be added for v1.
- Redaction applies to all measurement logs, so credentials in error
  paths during timing don't leak.
- The Script-studio measurement uses the operator's real Claude Code
  subprocess; no mock SLA is simulated.
- Any observed number that exceeds its target by more than 25 % is
  tracked as a fresh task against the relevant handler, not fixed
  silently.

## Next step

After the first operator installer run produces numbers, populate the
**Observed** column and commit. If any metric misses its target, file
a task against the specific handler (`scriptPrompt`, `avatarVideo`,
`render`, or bootstrap) rather than adjusting the target.
