import { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BOOTSTRAP_TEXT, validateBootstrapResult, type Project, type Task, type TaskStatus } from '../../contracts/src/index.ts';

const repository = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
export function dataDirectory(requested?: string): string {
  const target = resolve(requested || process.env.AI_ATELIER_DATA_DIR || join(homedir(), 'Library/Application Support/ai-atelier'));
  let ancestor = target;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const canonical = resolve(realpathSync(ancestor), relative(ancestor, target));
  const relation = relative(repository, canonical);
  if (!relation || (!relation.startsWith('..') && !isAbsolute(relation))) throw new Error('DATA_DIRECTORY_MUST_BE_OUTSIDE_REPOSITORY');
  // Do not put runtime data in any other Git checkout either.
  for (let path = canonical;; path = dirname(path)) {
    if (existsSync(join(path, '.git'))) throw new Error('DATA_DIRECTORY_INSIDE_GIT');
    if (dirname(path) === path) break;
  }
  mkdirSync(canonical, { recursive: true, mode: 0o700 });
  return canonical;
}
export const inputSha256 = createHash('sha256').update(BOOTSTRAP_TEXT).digest('hex');

function project(row: any): Project {
  return { id: row.id, name: row.name, goal: row.goal, constraints: JSON.parse(row.constraints_json),
    version: row.version, createdAt: row.created_at };
}
function task(row: any): Task {
  return { id: row.id, projectId: row.project_id, status: row.status, inputSha256: row.input_sha256,
    result: row.output_json ? validateBootstrapResult(JSON.parse(row.output_json)) : null,
    error: row.error_code, createdAt: row.created_at, completedAt: row.completed_at };
}
export class Store {
  readonly directory: string;
  #db: DatabaseSync;
  constructor(directory?: string) {
    this.directory = dataDirectory(directory);
    const path = join(this.directory, 'atelier.sqlite');
    this.#db = new DatabaseSync(path); chmodSync(path, 0o600);
    this.#db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    const version = (this.#db.prepare('PRAGMA user_version').get() as any).user_version;
    if (version > 1) { this.#db.close(); throw new Error('DATABASE_VERSION_TOO_NEW'); }
    if (version === 0) {
      this.#db.exec('BEGIN IMMEDIATE');
      try { this.#db.exec(readFileSync(new URL('../migrations/001.sql', import.meta.url), 'utf8')); this.#db.exec('COMMIT'); }
      catch (error) { this.#db.exec('ROLLBACK'); this.#db.close(); throw error; }
    }
  }
  projects(): Project[] { return this.#db.prepare('SELECT * FROM projects ORDER BY created_at,id').all().map(project); }
  createProject(name: string, goal = ''): Project {
    if (!name.trim() || name.length > 120 || goal.length > 5000) throw new Error('INVALID_PROJECT');
    const id = randomUUID();
    this.#db.prepare('INSERT INTO projects(id,name,goal,constraints_json,created_at) VALUES(?,?,?,?,?)')
      .run(id, name.trim(), goal, '[]', new Date().toISOString());
    return project(this.#db.prepare('SELECT * FROM projects WHERE id=?').get(id));
  }
  requireProject(id: string) {
    if (!this.#db.prepare('SELECT id FROM projects WHERE id=?').get(id)) throw new Error('PROJECT_NOT_FOUND');
  }
  tasks(projectId: string): Task[] {
    this.requireProject(projectId);
    return this.#db.prepare('SELECT * FROM tasks WHERE project_id=? ORDER BY created_at DESC,id DESC LIMIT 100').all(projectId).map(task);
  }
  getTask(projectId: string, id: string): Task | null {
    const row = this.#db.prepare('SELECT * FROM tasks WHERE id=? AND project_id=?').get(id, projectId);
    return row ? task(row) : null;
  }
  enqueue(projectId: string, key: string, digest: string): Task {
    this.requireProject(projectId);
    if (!key || key.length > 100) throw new Error('INVALID_IDEMPOTENCY_KEY');
    if (digest !== inputSha256) throw new Error('STALE_INPUT');
    const old = this.#db.prepare('SELECT * FROM tasks WHERE project_id=? AND idempotency_key=?').get(projectId, key);
    if (old) return task(old);
    if ((this.#db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status IN ('queued','running')").get() as any).n >= 20) throw new Error('QUEUE_FULL');
    const id = randomUUID(); const now = new Date().toISOString();
    this.#db.prepare('INSERT INTO tasks(id,project_id,idempotency_key,kind,status,input_sha256,input_json,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, projectId, key, 'bootstrap', 'queued', digest, JSON.stringify({ schemaVersion: 1, text: BOOTSTRAP_TEXT }), now);
    this.#event(id, 'queued');
    return this.getTask(projectId, id)!;
  }
  nextQueued(): Task | null {
    const row = this.#db.prepare("SELECT * FROM tasks WHERE status='queued' ORDER BY created_at,id LIMIT 1").get();
    return row ? task(row) : null;
  }
  #event(id: string, status: string) { this.#db.prepare('INSERT INTO task_events(task_id,status,created_at) VALUES(?,?,?)').run(id, status, new Date().toISOString()); }
  transition(projectId: string, id: string, status: TaskStatus, details: { result?: unknown; error?: string; model?: string; clientVersion?: string } = {}) {
    const current = this.getTask(projectId, id);
    if (!current || !['queued', 'running'].includes(current.status)) throw new Error('TASK_NOT_ACTIVE');
    if (status === 'running' && current.status !== 'queued') throw new Error('TASK_ALREADY_RUNNING');
    if (status === 'completed') validateBootstrapResult(details.result);
    const terminal = !['queued', 'running'].includes(status);
    this.#db.prepare('UPDATE tasks SET status=?,output_json=?,error_code=?,model=COALESCE(?,model),client_version=COALESCE(?,client_version),completed_at=? WHERE id=? AND project_id=?')
      .run(status, details.result ? JSON.stringify(details.result) : null, details.error ?? null,
        details.model ?? null, details.clientVersion ?? null, terminal ? new Date().toISOString() : null, id, projectId);
    this.#event(id, status);
  }
  recoverInterrupted() {
    const rows = this.#db.prepare("SELECT id,project_id FROM tasks WHERE status IN ('queued','running')").all() as any[];
    for (const row of rows) this.transition(row.project_id, row.id, 'interrupted', { error: 'PROCESS_INTERRUPTED' });
    return rows.length;
  }
  close() { this.#db.close(); }
}
