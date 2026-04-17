# Lumo

Single-operator Windows desktop app that turns a prompt into a lip-synced branded avatar video.

Private repository. Not open-source, not distributed, not supported. Built for one operator on one machine.

## Getting started

- **Product intent, user flows, requirements**: [`specs/001-lumo-v1/spec.md`](./specs/001-lumo-v1/spec.md)
- **Operator walkthrough (first 5 minutes)**: [`specs/001-lumo-v1/quickstart.md`](./specs/001-lumo-v1/quickstart.md)
- **Implementation plan and tech-to-requirement mapping**: [`specs/001-lumo-v1/plan.md`](./specs/001-lumo-v1/plan.md)
- **Contributor / agent context**: [`CLAUDE.md`](./CLAUDE.md)
- **Project constitution (principles, non-negotiables, invariants)**: [`.specify/memory/constitution.md`](./.specify/memory/constitution.md)

## Running locally

```bash
npm install
npm run dev        # launches Electron with hot reload
npm run lint       # ESLint incl. Lumo's custom rules
npm run typecheck  # tsc --noEmit across main / preload / renderer
npm run test       # vitest (contract + integration)
npm run test:ui    # Playwright-Electron UI flows
npm run package    # electron-builder — Windows NSIS installer
```

Native dependencies (`better-sqlite3`, `keytar`) are rebuilt against Electron's Node ABI automatically by the `postinstall` hook.
