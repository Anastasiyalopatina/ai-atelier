import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, inputSha256, dataDirectory } from '../../packages/memory/src/store.ts';
import { acquireLock } from '../../packages/codex-bridge/src/lock.ts';

test('tasks remain isolated, idempotent and readable after closing and reopening SQLite', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ai-atelier-store-test-'));
  let store = new Store(directory);
  try {
    const a = store.createProject('Вымышленный проект А'); const b = store.createProject('Вымышленный проект Б');
    const task = store.enqueue(a.id, 'synthetic-key', inputSha256);
    assert.equal(store.enqueue(a.id, 'synthetic-key', inputSha256).id, task.id);
    assert.equal(store.getTask(b.id, task.id), null);
    assert.deepEqual(store.tasks(b.id), []);
    assert.throws(() => store.enqueue(a.id, 'stale', 'invalid-hash'), /STALE_INPUT/);
    store.transition(a.id, task.id, 'running');
    store.transition(a.id, task.id, 'completed', { result: { project: 'Лунный сад', total: 12, kind: 'calculation' } });
    store.close(); store = new Store(directory);
    assert.equal(store.getTask(a.id, task.id).result.total, 12);
    assert.throws(() => store.transition(a.id, task.id, 'running'), /TASK_NOT_ACTIVE/);
    const interrupted = store.enqueue(b.id, 'interrupted', inputSha256);
    store.transition(b.id, interrupted.id, 'running');
    assert.equal(store.recoverInterrupted(), 1);
    assert.equal(store.getTask(b.id, interrupted.id).status, 'interrupted');
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('model lock excludes other local clients until release', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ai-atelier-lock-test-'));
  try {
    const release = acquireLock(directory);
    assert.throws(() => acquireLock(directory), /RUNTIME_ALREADY_RUNNING/);
    release(); const again = acquireLock(directory); again();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('runtime data cannot be placed inside the repository, including via a symlink', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ai-atelier-path-test-'));
  try {
    assert.throws(() => dataDirectory(join(import.meta.dirname, 'runtime')), /OUTSIDE_REPOSITORY/);
    symlinkSync(join(import.meta.dirname, '../..'), join(directory, 'checkout'));
    assert.throws(() => dataDirectory(join(directory, 'checkout', 'runtime')), /OUTSIDE_REPOSITORY/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
