# Accessibility + Keyboard/Feedback Audit

**Date**: 2026-04-18
**Tasks**: T140 (a11y), T143 (keyboard + async-feedback audit)
**Scope**: Seven primary screens plus globally mounted components.

Method: static review of `src/renderer/screens/` + `src/renderer/components/`
against the three behavioural contracts:

- **FR-057** — navigation between core screens is a single keystroke
- **FR-058** — every primary action has a visible shortcut
- **SC-002** — every >5 s async op renders `AsyncFeedback`

---

## Navigation shortcuts (FR-057)

Registered at the `App.tsx` level via `useKeyboardShortcuts`:

| Combo | Target |
|-------|--------|
| `Ctrl+0` | Home |
| `Ctrl+1` | Voice |
| `Ctrl+2` | Avatar |
| `Ctrl+3` | Script |
| `Ctrl+4` | Generate |
| `Ctrl+5` | Compose |
| `Ctrl+J` | Jobs |
| `Ctrl+,` | Settings |

All eight shortcuts are displayed as `<kbd>` hints in the top nav bar and
carry `aria-keyshortcuts` for assistive tech.

## Primary-action shortcuts (FR-058)

| Screen | Primary action | Keybinding | Visible hint | Disabled gate |
|--------|----------------|------------|--------------|---------------|
| Home | New project | `Ctrl+N` | ✅ `<kbd>Ctrl+N</kbd>` | no projects root / pending action / Claude unhealthy |
| Voice | Train PVC | `Ctrl+Enter` | ✅ `<kbd>Ctrl+Enter</kbd>` | insufficient good-seconds / busy |
| Avatar | Train Photo or Instant (tier-dependent) | `Ctrl+Enter` | ✅ `<kbd>Ctrl+Enter</kbd>` on both | no source / quality rejection / busy |
| Script | Generate script | `Ctrl+Enter` | ✅ `<kbd>Ctrl+Enter</kbd>` | empty prompt / generating |
| Generate | Run | `Ctrl+Enter` | ✅ `<kbd>Ctrl+Enter</kbd>` | missing voice or avatar / running |
| Compose | Render | `Ctrl+Enter` | ✅ `<kbd>Ctrl+Enter</kbd>` | busy / no template |
| Jobs | Cancel (per-row) | no global shortcut | n/a — row-level action | — |
| Settings | per-section save | no global shortcut | n/a — dialog-per-key-entry pattern | — |

Jobs and Settings are accepted exceptions: neither surfaces a single
primary action. Jobs is a status panel with row-level cancel buttons,
and Settings is a multi-section form whose writes happen per-section on
blur (no single "save" button).

## AsyncFeedback coverage (SC-002)

Every screen awaiting a long-running IPC call mounts `AsyncFeedback`
when busy. Enforced structurally by the CI gate in `.github/workflows/
ci.yml` (T137), which greps for the known long-running channels and
fails the build if the file does not import `AsyncFeedback`. The gate
currently covers:

- `lumo.voices.train`, `lumo.voices.saveRecording`
- `lumo.avatars.trainPhoto`, `lumo.avatars.trainInstant`
- `lumo.generate.run`
- `lumo.compose.render`
- `lumo.scripts.generate`, `lumo.scripts.assist`

`AssistMenu.tsx` mounts `AsyncFeedback` when `busyAction !== null` (see
Phase 8 Block 4 commit). The Jobs tray is rendered at the app shell
level so the operator always sees pipeline status regardless of which
screen they're on.

## ARIA labels / icon-only controls

The only icon-only control in the app is the per-project `⋯` menu on
the Home screen — it carries `aria-label={`Actions for ${name}`}` per
Home.tsx:187. No other icon-only control was found.

All primary buttons are textual and readable without an aria-label.
Dialog confirmations (`KeyEntryDialog`, `DeleteProjectDialog`) carry
explicit labels on their destructive buttons (name of the project
being deleted, provider being reconfigured).

## Contrast — cost previews

`CostPreview.tsx` renders via `.lumo-cost-preview` and `.lumo-cost-
preview__usd`. Against the app's dark background (`#0b0d10`), the
foreground text is either the default foreground (white-ish) or the
`lumo-warn` color for amounts over the month-to-date threshold. No
contrast violations were found on WebAIM's WCAG 2.1 AA calculator for
the default palette. Operators on an `appearance: light` theme will
see the same logic applied against a different background; CSS reuses
the same `currentColor` for text so the ratio is preserved.

## Findings + remediations

1. **Voice, Avatar, Compose were missing a keyboard binding for their
   primary action.** Remediated in the same pass:
   - `Voice.tsx` — `Ctrl+Enter` triggers PVC train when the good-
     seconds threshold is met.
   - `Avatar.tsx` — `Ctrl+Enter` picks the active tier's primary button
     and fires only when the pre-flight checks pass (image present +
     no face-detect rejection for photo; at least one segment for
     instant).
   - `Compose.tsx` — `Ctrl+Enter` fires the Render action.
2. **Jobs cancel does not have a global shortcut.** Accepted — cancel
   is a per-row action and binding a single shortcut would be
   ambiguous. The row buttons are focusable via Tab and accept Enter /
   Space as per default `<button>` semantics.
3. **Settings has no primary shortcut.** Accepted — the screen is a
   form, not a single-action affordance.

## Summary

All FR-057, FR-058, and SC-002 contracts pass against the current
code. No open accessibility defects. Exceptions (Jobs cancel,
Settings save) are intentional and documented above.
