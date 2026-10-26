CREATE TABLE projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, goal TEXT NOT NULL,
  constraints_json TEXT NOT NULL CHECK(json_valid(constraints_json)),
  version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE sources (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), origin TEXT NOT NULL,
  title TEXT NOT NULL, published_at TEXT, retrieved_at TEXT NOT NULL, version INTEGER NOT NULL,
  sha256 TEXT NOT NULL, disclosure TEXT NOT NULL CHECK(disclosure IN ('local_only','codex_allowed','public')),
  UNIQUE(id, project_id)
);
CREATE TABLE source_fragments (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, project_id TEXT NOT NULL,
  location_json TEXT NOT NULL CHECK(json_valid(location_json)), sha256 TEXT NOT NULL, text TEXT NOT NULL,
  UNIQUE(id, project_id), FOREIGN KEY(source_id, project_id) REFERENCES sources(id, project_id)
);
CREATE TABLE knowledge_entries (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK(kind IN ('user_statement','source_statement','hypothesis','inference','calculation','decision')),
  verification TEXT NOT NULL CHECK(verification IN ('unverified','verified','disputed','needs_review','unknown')),
  text TEXT NOT NULL, scope TEXT NOT NULL, version INTEGER NOT NULL,
  disclosure TEXT NOT NULL CHECK(disclosure IN ('local_only','codex_allowed','public')),
  calculation_json TEXT CHECK(calculation_json IS NULL OR json_valid(calculation_json)), UNIQUE(id, project_id)
);
CREATE TABLE evidence_refs (
  entry_id TEXT NOT NULL, fragment_id TEXT NOT NULL, project_id TEXT NOT NULL, source_version INTEGER NOT NULL,
  PRIMARY KEY(entry_id, fragment_id),
  FOREIGN KEY(entry_id, project_id) REFERENCES knowledge_entries(id, project_id),
  FOREIGN KEY(fragment_id, project_id) REFERENCES source_fragments(id, project_id)
);
CREATE TABLE proposals (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), base_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected','conflict')),
  changes_json TEXT NOT NULL CHECK(json_valid(changes_json)), created_at TEXT NOT NULL
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), idempotency_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind='bootstrap'), status TEXT NOT NULL,
  input_sha256 TEXT NOT NULL, input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  output_json TEXT CHECK(output_json IS NULL OR json_valid(output_json)), error_code TEXT,
  model TEXT, client_version TEXT, created_at TEXT NOT NULL, completed_at TEXT,
  UNIQUE(project_id, idempotency_key)
);
CREATE TABLE task_events (
  id INTEGER PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), status TEXT NOT NULL, created_at TEXT NOT NULL
);
PRAGMA user_version = 1;
