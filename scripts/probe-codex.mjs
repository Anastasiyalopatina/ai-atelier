import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { findCodex } from './doctor.mjs';
import { SubscriptionClient } from '../packages/codex-bridge/src/client.ts';

const root = resolve(import.meta.dirname, '..');
const dataDir = resolve(process.env.AI_ATELIER_DATA_DIR || join(homedir(), 'Library/Application Support/ai-atelier'));
const relation = relative(root, dataDir);
if (!relation || (!relation.startsWith('..') && !isAbsolute(relation))) throw new Error('DATA_DIRECTORY_MUST_BE_OUTSIDE_REPOSITORY');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const databasePath = join(dataDir, 'bootstrap.sqlite');
const db = new DatabaseSync(databasePath);
chmodSync(databasePath, 0o600);
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS bootstrap_tasks (
 id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, status TEXT NOT NULL,
 input_json TEXT NOT NULL, output_json TEXT, client_version TEXT, model TEXT,
 created_at TEXT NOT NULL, completed_at TEXT, error_code TEXT
);`);

if (process.argv[2] === '--read') {
  const row = db.prepare('SELECT id, status, output_json, client_version, model FROM bootstrap_tasks WHERE id = ?').get(process.argv[3]);
  db.close();
  if (!row || row.status !== 'completed') throw new Error('RESULT_NOT_COMPLETED');
  writeFileSync(join(dataDir, 'model-check.json'), JSON.stringify({ checkedAt: new Date().toISOString(),
    completed: true, reopenedInNewProcess: true, clientVersion: row.client_version, model: row.model,
    adapter: 'official-app-server-stdio', syntheticOnly: true }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ id: row.id, status: row.status, value: JSON.parse(row.output_json) }));
} else {
  if (!process.argv.includes('--confirm-paid-disabled')) { db.close(); throw new Error('PAID_CONTINUATION_UNVERIFIED'); }
  const installation = findCodex().selected;
  if (!installation) { db.close(); throw new Error('CODEX_UNAVAILABLE'); }
  const workspace = mkdtempSync(join(dataDir, 'synthetic-workspace-'));
  const id = randomUUID();
  const text = 'Вымышленный проект «Лунный сад». В понедельник посадили 7 вымышленных деревьев, во вторник ещё 5. Верни название проекта, общее число деревьев и тип результата calculation. Никакие инструменты не нужны.';
  const schema = { type: 'object', properties: { project: { type: 'string' }, total: { type: 'integer' },
    kind: { type: 'string', enum: ['calculation'] } }, required: ['project', 'total', 'kind'], additionalProperties: false };
  const createdAt = new Date().toISOString();
  writeFileSync(join(dataDir, 'billing-confirmation.json'), JSON.stringify({ schemaVersion: 1,
    paidContinuationDisabled: true, autoTopUpDisabled: true, source: 'user_confirmation',
    confirmedAt: createdAt, automaticAccountVerification: false }, null, 2), { mode: 0o600 });
  db.prepare('INSERT INTO bootstrap_tasks (id,schema_version,status,input_json,client_version,created_at) VALUES (?,1,?,?,?,?)')
    .run(id, 'running', JSON.stringify({ text, schema }), installation.version, createdAt);
  console.log(JSON.stringify({ preview: text, destination: 'Official Codex, managed ChatGPT authentication', syntheticOnly: true }));
  const client = new SubscriptionClient(installation.binary, workspace);
  let success = false;
  try {
    const { selected } = await client.initialize();
    const result = await client.structured({ text, schema, model: selected, billingConfirmed: true });
    if (result.value?.project !== 'Лунный сад' || result.value?.total !== 12 || result.value?.kind !== 'calculation' || Object.keys(result.value).length !== 3) {
      throw new Error('MODEL_RESULT_VALIDATION_FAILED');
    }
    db.prepare('UPDATE bootstrap_tasks SET status=?,output_json=?,model=?,completed_at=? WHERE id=?')
      .run('completed', JSON.stringify(result.value), selected.model, new Date().toISOString(), id);
    success = true;
  } catch (error) {
    db.prepare('UPDATE bootstrap_tasks SET status=?,error_code=?,completed_at=? WHERE id=?')
      .run('failed', /^[A-Z0-9_:-]+$/.test(error.message) ? error.message : 'PROBE_FAILED', new Date().toISOString(), id);
    console.log(JSON.stringify({ status: 'BOOTSTRAP_BLOCKED', taskId: id,
      blocker: /^[A-Z0-9_:-]+$/.test(error.message) ? error.message : 'PROBE_FAILED',
      ...(error.cause ? { details: error.cause } : {}) }));
    process.exitCode = 1;
  } finally { await client.close(); db.close(); rmSync(workspace, { recursive: true, force: true }); }
  if (success) {
    const reopened = spawnSync(process.execPath, [import.meta.filename, '--read', id], {
      env: { ...process.env, AI_ATELIER_DATA_DIR: dataDir }, encoding: 'utf8', timeout: 10_000,
    });
    if (reopened.status !== 0) throw new Error('RESULT_REOPEN_FAILED');
    const read = JSON.parse(reopened.stdout.trim());
    if (read.value.total !== 12) throw new Error('RESULT_REOPEN_MISMATCH');
    console.log(JSON.stringify({ status: 'MODEL_SMOKE_PASSED', taskId: id, clientVersion: installation.version,
      adapter: 'official-app-server-stdio', reopenedInNewProcess: true, syntheticOnly: true, value: read.value }));
  }
}
