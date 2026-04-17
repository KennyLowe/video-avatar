# Data Model: Lumo v1

This document specifies the conceptual entities used by Lumo, their on-disk
location, their authoritative store, and the state transitions they undergo.
Concrete SQL column types and indexes are finalised in migration files; this
document is the contract between the spec and the implementation.

## Storage map

| Kind | Store | Notes |
|------|-------|-------|
| Project metadata | `<project>/project.json` | Human-readable, edited by app only. |
| Per-project rows (voices, avatars, takes, segments, scripts, renders, jobs, costs) | `<project>/state.db` (SQLite via `better-sqlite3`) | Single file per project. WAL mode. |
| App-global settings | `%APPDATA%\Lumo\settings.json` | Projects root, default model, render defaults, transport defaults. |
| Provider API keys | Windows Credential Manager | Targets `Lumo/elevenlabs`, `Lumo/heygen`. No copy on disk. |
| Logs | `%APPDATA%\Lumo\logs\YYYY-MM-DD.jsonl` | JSONL, rotated daily, secrets redacted. |
| Audio takes | `<project>/audio/takes/<ts>.wav` | 48 kHz mono 24-bit WAV. |
| TTS output | `<project>/audio/tts/<uuid>.mp3` | Transient; retained until job lifecycle closes. |
| Source video | `<project>/video/source/<original-name>` | Imported as-is. |
| Video segments | `<project>/video/segments/<source>-<n>.mp4` | Extracted by ffmpeg. |
| Avatar clips | `<project>/video/avatar/<script_id>-<uuid>.mp4` | Downloaded from HeyGen. |
| Scripts | `<project>/scripts/<slug>-v<n>.md` | Immutable versioned file per save. |
| Remotion renders | `<project>/renders/<slug>-<timestamp>.mp4` | Final composed videos. |
| Custom templates | `<project>/templates/<name>.tsx` | Operator-provided Remotion templates. |

## Entities

### Project (`project.json` + folder convention)

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | Opaque, generated on create. |
| `name` | string | Operator-provided display name. Not unique. |
| `slug` | string | Derived from name, disambiguated with numeric suffix if needed. Folder name. |
| `createdAt` | ISO 8601 | |
| `brandColor` | hex string | Optional (`#RRGGBB`). |
| `logoPath` | relative path | Optional, relative to project root. |
| `defaultVoiceId` | integer | FK to `voices.id` in project state.db, nullable. |
| `defaultAvatarId` | integer | FK to `avatars.id` in project state.db, nullable. |
| `uploadTransport` | enum | `s3` \| `r2` \| `cloudflared` \| `direct`. Overrides app-global default. |

**Invariants**
- `slug` matches `^[a-z0-9][a-z0-9-]{0,63}$`. Renames rewrite `project.json` only; the folder is never moved underneath the operator.
- Delete is soft: folder is moved to Windows Recycle Bin.

### Voice (`voices` table in project `state.db`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `provider` | TEXT | `'elevenlabs'` only in v1. |
| `provider_voice_id` | TEXT | Assigned by provider. Nullable until training completes. |
| `tier` | TEXT | `'pvc'` \| `'ivc'`. |
| `name` | TEXT | Operator-provided display name. |
| `sample_seconds` | INTEGER | Total good seconds submitted. |
| `job_id` | INTEGER | FK to `jobs.id` for the training job. |
| `status` | TEXT | `'training'` \| `'ready'` \| `'failed'` \| `'canceled'`. |
| `created_at` | INTEGER | Unix seconds. |

**State machine**
- `training` → `ready` (on job completion, provider_voice_id populated)
- `training` → `failed` (on job failure, error on the job row)
- `training` → `canceled` (on operator cancel)

### Take (`takes` table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `path` | TEXT | Relative to project root. |
| `source` | TEXT | `'record'` \| `'import'`. |
| `duration_seconds` | INTEGER | Post-trim. |
| `trim_start_ms` | INTEGER | 0 if not trimmed. |
| `trim_end_ms` | INTEGER | Original duration if not trimmed. |
| `mark` | TEXT | `'good'` \| `'bad'` \| `'unmarked'`. |
| `created_at` | INTEGER | |

**Invariants**
- `path` always absolute-resolved on read via `path.resolve(projectRoot, row.path)`.
- Files deleted from disk but still present in the table become rows with `path_missing=1` on next scan.

### Avatar (`avatars` table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `provider` | TEXT | `'heygen'`. |
| `provider_avatar_id` | TEXT | Populated on completion. |
| `tier` | TEXT | `'photo'` \| `'instant'`. |
| `source_ref` | TEXT | For `'photo'`: path to image. For `'instant'`: JSON array of segment row ids. |
| `job_id` | INTEGER | FK to `jobs.id` for the training job. |
| `status` | TEXT | `'training'` \| `'ready'` \| `'failed'` \| `'canceled'`. |
| `created_at` | INTEGER | |

### Segment (`segments` table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `source_path` | TEXT | Original imported video. |
| `extracted_path` | TEXT | Extracted segment file. |
| `in_ms` | INTEGER | |
| `out_ms` | INTEGER | |
| `created_at` | INTEGER | |

### Script (`scripts` table + files)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `slug` | TEXT | Used for the filename. |
| `version` | INTEGER | Monotonic per `slug`. |
| `title` | TEXT | From Claude Code JSON response. |
| `body_md` | TEXT | Full markdown body (duplicated on disk). |
| `word_count` | INTEGER | Computed on save. |
| `estimated_seconds` | INTEGER | From Claude Code response; recomputed if body edited. |
| `parent_version_id` | INTEGER | Nullable; FK to `scripts.id`. |
| `created_at` | INTEGER | |
| `updated_at` | INTEGER | |

**Invariants**
- Every save writes a new row AND a new file; rows are never mutated after insert (append-only).
- `chapters` (if any) are stored as a separate `script_chapters` table keyed by `script_id`.

### Template (in-memory; no persistence except custom paths)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Filename without extension. |
| `sourcePath` | absolute path | Bundled or per-project. |
| `schema` | Zod object | From `export const schema`. |
| `defaultProps` | object | From `export const defaultProps`. |
| `durationInFrames` | number \| function | From export. |
| `fps` | number | From export. |
| `Composition` | React component | From export. |
| `validity` | enum | `'valid'` \| `'invalid-missing-<export>'`. |

**Bundled templates (v1)**: `LogoIntro`, `LowerThird`, `FullExplainer`, `TitleSlide`, `ChapterCard`.

### Render (`renders` table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `kind` | TEXT | `'avatar_clip'` \| `'composed'`. |
| `script_id` | INTEGER | FK, nullable for composed with no script. |
| `voice_id` | INTEGER | FK, avatar_clip only. |
| `avatar_id` | INTEGER | FK, avatar_clip only. |
| `generation_mode` | TEXT | `'standard'` \| `'avatar_iv'`, avatar_clip only. |
| `template_id` | TEXT | Composed only. |
| `props_json` | TEXT | Composed only; the validated JSON passed to Remotion. |
| `output_path` | TEXT | Absolute-resolved on read. |
| `status` | TEXT | `'pending'` \| `'running'` \| `'done'` \| `'failed'` \| `'canceled'`. |
| `created_at` | INTEGER | |

**State machine**
- `pending` → `running` (worker picks up or renderer starts)
- `running` → `done` (file written, status finalised)
- `running` → `failed` (error on job row)
- `running` → `canceled` (operator cancel; partial file removed)

### Job (`jobs` table — the persistent work queue)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `provider` | TEXT | `'elevenlabs'` \| `'heygen'` \| `'remotion'`. |
| `provider_job_id` | TEXT | Populated when provider confirms submission. Remotion jobs leave this null. |
| `kind` | TEXT | `'voice_train'` \| `'avatar_train'` \| `'tts'` \| `'avatar_video'` \| `'render'`. |
| `input_ref` | TEXT | JSON describing inputs (script_id, voice_id, etc.). |
| `output_path` | TEXT | Populated on success. |
| `status` | TEXT | `'queued'` \| `'running'` \| `'done'` \| `'failed'` \| `'canceled'`. |
| `last_polled_at` | INTEGER | Unix seconds; null until first poll. |
| `next_poll_at` | INTEGER | Exponential back-off schedule. |
| `attempt` | INTEGER | Poll attempt counter. |
| `error` | TEXT | Verbatim provider error on failure. |
| `notify_on_complete` | INTEGER | 0 or 1. Default 1 for long jobs. |
| `created_at` | INTEGER | |

**Polling policy**
- Back-off: 5s, 10s, 20s, 40s, 80s, 120s cap.
- On launch, any job with `status IN ('queued','running')` is reconciled with the provider before new jobs are accepted.

### Cost entry (`costs` table)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `job_id` | INTEGER | FK, nullable (preview-only rows can exist for abandoned operations if we choose to track them; v1 only writes on execution). |
| `provider` | TEXT | |
| `operation` | TEXT | `'tts'` \| `'pvc_train'` \| `'ivc_train'` \| `'avatar_train'` \| `'avatar_video_standard'` \| `'avatar_video_iv'`. |
| `units` | INTEGER | |
| `unit_kind` | TEXT | `'characters'` \| `'credits'` \| `'seconds'` \| `'minutes'`. |
| `usd_estimate` | REAL | |
| `recorded_at` | INTEGER | |

**Derived views**
- Month-to-date per provider: `SUM(usd_estimate) WHERE recorded_at >= start_of_current_month`.
- CSV export: all columns plus `project_id` from the enclosing project folder.

### Credential target (in Windows Credential Manager)

Not a row; a named target retrieved via `keytar`.

| Target | Secret | Account |
|--------|--------|---------|
| `Lumo/elevenlabs` | API key | `default` |
| `Lumo/heygen` | API key | `default` |
| `Lumo/s3` (optional) | `{accessKeyId, secretAccessKey}` JSON | `default` |

### Upload transport configuration

Not a row; a selected enum plus any dependent config.

| Value | Dependent config |
|-------|------------------|
| `s3` | Bucket, region, path prefix, credentials target `Lumo/s3`. |
| `r2` | Same shape as `s3`, different endpoint. |
| `cloudflared` | Binary path (resolved at startup; override in settings). |
| `direct` | None. Only usable if HeyGen's current API accepts multipart audio. |

## Cross-entity invariants

- **Orphan check on launch**: any `renders` or `jobs` row referencing a missing file surfaces a non-fatal warning on Home; the operator can clear orphans from Settings.
- **Delete cascade (within a project)**: deleting a script does not cascade to renders or jobs; those rows remain with a `parent_deleted=1` flag to preserve cost history.
- **Paths**: every `*_path` column stores a project-relative path; the data layer absolute-resolves on every read via `path.resolve(projectRoot, relativePath)`.
- **No secret ever written**: insert/update on `jobs.error` passes the string through a redactor that strips known secret shapes (bearer tokens, API-key prefixes, pre-signed URL signatures).

## Migrations

- `0001_init.sql` — all tables above.
- Migration runner reads applied versions from `schema_migrations(version INTEGER PK, applied_at INTEGER)` and applies any missing files in order at project open.
- New projects run all migrations atomically inside a transaction.
