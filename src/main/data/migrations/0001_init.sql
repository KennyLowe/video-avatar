-- Initial per-project schema. Mirrors data-model.md; one row per SQLite file
-- per project. Columns are deliberately lean — we add indexes only when a
-- query measurably needs them.

CREATE TABLE voices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('elevenlabs')),
  provider_voice_id TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('pvc', 'ivc')),
  name TEXT NOT NULL,
  sample_seconds INTEGER NOT NULL,
  job_id INTEGER,
  status TEXT NOT NULL CHECK (status IN ('training', 'ready', 'failed', 'canceled')),
  created_at INTEGER NOT NULL
);

CREATE TABLE takes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('record', 'import')),
  duration_seconds INTEGER NOT NULL,
  trim_start_ms INTEGER NOT NULL DEFAULT 0,
  trim_end_ms INTEGER NOT NULL DEFAULT 0,
  mark TEXT NOT NULL CHECK (mark IN ('good', 'bad', 'unmarked')) DEFAULT 'unmarked',
  created_at INTEGER NOT NULL
);

CREATE TABLE avatars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('heygen')),
  provider_avatar_id TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('photo', 'instant')),
  source_ref TEXT NOT NULL,
  job_id INTEGER,
  status TEXT NOT NULL CHECK (status IN ('training', 'ready', 'failed', 'canceled')),
  created_at INTEGER NOT NULL
);

CREATE TABLE segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_path TEXT NOT NULL,
  extracted_path TEXT NOT NULL,
  in_ms INTEGER NOT NULL,
  out_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  estimated_seconds INTEGER NOT NULL,
  parent_version_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (parent_version_id) REFERENCES scripts(id)
);

CREATE INDEX scripts_slug_version ON scripts (slug, version);

CREATE TABLE script_chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  script_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
);

CREATE TABLE renders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('avatar_clip', 'composed')),
  script_id INTEGER,
  voice_id INTEGER,
  avatar_id INTEGER,
  generation_mode TEXT CHECK (generation_mode IN ('standard', 'avatar_iv')),
  template_id TEXT,
  props_json TEXT,
  output_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'failed', 'canceled')),
  created_at INTEGER NOT NULL
);

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('elevenlabs', 'heygen', 'remotion')),
  provider_job_id TEXT,
  kind TEXT NOT NULL CHECK (
    kind IN ('voice_train', 'avatar_train', 'tts', 'avatar_video', 'render')
  ),
  input_ref TEXT,
  output_path TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed', 'canceled')),
  last_polled_at INTEGER,
  next_poll_at INTEGER,
  attempt INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  notify_on_complete INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX jobs_status ON jobs (status);
CREATE INDEX jobs_next_poll ON jobs (status, next_poll_at);

CREATE TABLE costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  provider TEXT NOT NULL CHECK (provider IN ('elevenlabs', 'heygen')),
  operation TEXT NOT NULL CHECK (
    operation IN ('tts', 'pvc_train', 'ivc_train', 'avatar_train', 'avatar_video_standard', 'avatar_video_iv')
  ),
  units INTEGER NOT NULL,
  unit_kind TEXT NOT NULL CHECK (unit_kind IN ('characters', 'credits', 'seconds', 'minutes')),
  usd_estimate REAL NOT NULL,
  recorded_at INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE INDEX costs_recorded ON costs (recorded_at);
