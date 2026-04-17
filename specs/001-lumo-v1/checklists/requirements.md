# Specification Quality Checklist: Lumo v1 — Operator-driven avatar video pipeline

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-04-17
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
  - Note: The spec names Electron, React, TypeScript, Vite, `better-sqlite3`, `keytar`, `ffmpeg`, Claude Code CLI, ElevenLabs, HeyGen, and Remotion. These are **product requirements locked by the project constitution**, not implementation choices for this feature. The Assumptions section calls this out explicitly. All other technical detail (endpoints, code snippets, SQL DDL) has been lifted out and will be decided at plan time.
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
  - Note: Given the operator IS the developer, "non-technical stakeholder" is interpreted as "any reader who hasn't read the source architecture notes." User stories and success criteria read without reference to code.
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
  - Note: SC-001 mentions ElevenLabs, HeyGen, and Claude Code because those are the external services the product depends on by contract — not implementation internals. The measurability (single working day, no terminal, no manual file moves) is fully testable.
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
  - Note: Non-features are listed in Assumptions ("out of scope for v1"). v2 work (non-linear compositions, multi-scene, publishing integrations) is explicitly excluded.
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification
  - Note: Same caveat as Content Quality, item 1. Provider names are product contract; code-level detail is not in the spec.

## Notes

- Items marked incomplete require spec updates before `/speckit.clarify` or `/speckit.plan`.
- Source document preserved at repo root `spec.md` for reference; the authoritative feature spec is this folder's `spec.md`.
- The six "Open questions to resolve at plan time" from the source document (HeyGen endpoint mapping, Remotion embed approach, audio upload transport default, face-detection library, Claude Code subprocess management, ffmpeg packaging) are correctly scoped to the plan phase and are not [NEEDS CLARIFICATION] items on this spec.
- **Post-`/speckit.analyze` remediation (2026-04-17)**: FR-001 split into installed vs authenticated probes with concrete classification; FR-011 / FR-013 coverage confirmed in `tasks.md` T051 / T052 / T054; FR-027 thresholds pinned (1080p / 90% face / 15% motion / Laplacian 120); FR-034 renamed transport `direct` → `heygen` and enumerated full option list; FR-042 preset→CRF mapping pinned; SC-002 rewritten as a structural `AsyncFeedback` component contract. No requirements added or removed; changes are clarifications only.
