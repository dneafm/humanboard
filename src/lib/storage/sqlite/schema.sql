PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'inbox',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  stage TEXT NOT NULL,
  section_key TEXT,
  confidence INTEGER NOT NULL DEFAULT 5,
  maturity INTEGER NOT NULL DEFAULT 0,
  next_action TEXT,
  last_reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goal_roadmap_items (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(goal_id) REFERENCES goals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_idea_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  idea_id TEXT,
  title TEXT NOT NULL,
  hypothesis TEXT,
  status TEXT NOT NULL,
  result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  uri TEXT NOT NULL UNIQUE,
  content_hash TEXT,
  mime_type TEXT,
  import_status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_imported_at TEXT
);

CREATE TABLE IF NOT EXISTS source_snippets (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  snippet_type TEXT NOT NULL,
  content TEXT NOT NULL,
  start_ref TEXT,
  end_ref TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entity_links (
  id TEXT PRIMARY KEY,
  from_entity_type TEXT NOT NULL,
  from_entity_id TEXT NOT NULL,
  to_entity_type TEXT NOT NULL,
  to_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  explanation TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  recommended_action TEXT,
  decision TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  action_kind TEXT NOT NULL,
  model_name TEXT NOT NULL,
  prompt_excerpt TEXT,
  raw_output TEXT NOT NULL,
  accepted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ideas_stage ON ideas(stage);
CREATE INDEX IF NOT EXISTS idx_ideas_last_reviewed ON ideas(last_reviewed_at);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_entity_links_from ON entity_links(from_entity_type, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_to ON entity_links(to_entity_type, to_entity_id);
CREATE INDEX IF NOT EXISTS idx_review_events_entity ON review_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_source_snippets_source ON source_snippets(source_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_target ON ai_runs(target_entity_type, target_entity_id);
