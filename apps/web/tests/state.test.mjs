import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applyProposals, refreshProposal, buildContext, contextMarkdown, demoFileError, findEvidence, scopedTasks, taskViewStatus } from '../src/state.ts';
import { initialDemo, demoTasks, DEMO_DATE } from '../src/demo.ts';

test('batch acceptance is atomic on a stale project version', () => {
  const w = initialDemo()[0];
  const next = applyProposals(w, ['demo-p1', 'demo-p2'], DEMO_DATE);
  assert.deepEqual(next.entries, w.entries);
  assert.equal(next.project.version, 3);
  assert.equal(next.proposals[1].status, 'conflict');
});
test('accepting a record increments versions but never verifies its truth', () => {
  const w = initialDemo()[0];
  const next = applyProposals(w, ['demo-p1'], DEMO_DATE);
  assert.equal(next.project.version, 4);
  assert.equal(next.entries[0].verification, 'needs_review');
  assert.equal(next.entries[0].version, 2);
  assert.equal(next.proposals[0].status, 'accepted');
  assert.equal(next.history[0].before, w.entries[0].text);
  assert.notEqual(next.history[0].after, next.history[0].before);
  assert.deepEqual(applyProposals(next, ['demo-p1'], DEMO_DATE).entries, next.entries);
});
test('refreshing a conflict compares against the actual current record', () => {
  const w = initialDemo()[0];
  w.entries[1].text = 'Текущий текст после другого изменения';
  const next = refreshProposal(w, 'demo-p2');
  assert.equal(next.proposals[1].baseVersion, w.project.version);
  assert.equal(next.proposals[1].changes[0].before, w.entries[1].text);
  assert.equal(next.proposals[1].status, 'pending');
});
test('before-text mismatch and overlapping paths reject the entire batch', () => {
  const w = initialDemo()[0];
  w.proposals[0].changes[0].before = 'Устаревший текст';
  assert.deepEqual(applyProposals(w, ['demo-p1'], DEMO_DATE).entries, w.entries);
  const fresh = initialDemo()[0];
  fresh.proposals.push({ ...structuredClone(fresh.proposals[0]), id: 'duplicate' });
  const result = applyProposals(fresh, ['demo-p1', 'duplicate'], DEMO_DATE);
  assert.deepEqual(result.entries, fresh.entries);
  assert.equal(result.proposals[0].status, 'conflict');
});
test('evidence locates the exact original version, never a nearby or foreign fragment', () => {
  const w = initialDemo()[0];
  const ref = w.entries[0].evidence[0];
  const found = findEvidence(w, ref);
  assert.equal(found.fragment.sourceVersion, 1); assert.equal(found.outdated, true);
  assert.equal(findEvidence(w, { ...ref, sourceVersion: 2 }).fragment, undefined);
  assert.equal(findEvidence(initialDemo()[1], ref).source, undefined);
});
test('context excludes local-only sources AND dependent entries, including mislabelled entries', async () => {
  const w = initialDemo()[0];
  w.entries[4].disclosure = 'codex_allowed';
  const snapshot = await buildContext(w, 'full', DEMO_DATE);
  const json = JSON.stringify(snapshot);
  assert.ok(!json.includes('demo-private'));
  assert.ok(!json.includes('собственное участие'));
  assert.equal(snapshot.facts.length, 3);
  assert.equal(snapshot.excludedCount, 2);
  const unhashed = { ...snapshot, sha256: '' };
  assert.equal(snapshot.sha256, createHash('sha256').update(JSON.stringify(unhashed)).digest('hex'));
  assert.ok(contextMarkdown(snapshot).includes('версия 1'));
});
test('context scope, source permission and project identity are enforced', async () => {
  const w = initialDemo()[0];
  w.entries.push({ ...w.entries[0], id: 'foreign-entry', projectId: 'other', text: 'FOREIGN_SECRET' });
  const brief = await buildContext(w, 'brief', DEMO_DATE);
  assert.equal(brief.facts.length, 2);
  const decisions = await buildContext(w, 'decisions', DEMO_DATE);
  assert.equal(decisions.facts.length, 0); assert.equal(decisions.decisions.length, 1);
  assert.ok(!JSON.stringify(decisions).includes('FOREIGN_SECRET'));
  w.sources = w.sources.map((s) => ({ ...s, disclosure: 'local_only' }));
  const locked = await buildContext(w, 'full', DEMO_DATE);
  assert.equal(locked.sources.length, 0); assert.equal(locked.decisions.length, 0);
});
test('a second project receives no first-project tasks or research context', async () => {
  const [first, second] = initialDemo();
  assert.equal(scopedTasks(demoTasks(first.project.id), second.project.id).length, 0);
  const context = await buildContext(second, 'full', DEMO_DATE);
  assert.equal(context.facts.length, 0); assert.equal(context.decisions.length, 0);
  assert.equal(context.task, second.project.goal);
  assert.equal(context.gaps.length, 0);
});
test('limit, connectivity, interruption and cancellation remain distinct', () => {
  assert.equal(taskViewStatus({ status: 'failed', error: 'USAGE_LIMIT_REACHED' }), 'limit');
  assert.equal(taskViewStatus({ status: 'failed', error: 'NETWORK_UNAVAILABLE' }), 'offline');
  assert.equal(taskViewStatus({ status: 'interrupted', error: 'PROCESS_INTERRUPTED' }), 'interrupted');
  assert.equal(taskViewStatus({ status: 'cancelled', error: null }), 'cancelled');
});
test('unsupported/scanned formats and oversized demo text explain their limits', () => {
  assert.match(demoFileError('fictional-scan.pdf', 100), /OCR не подключён/);
  assert.match(demoFileError('fictional.xlsx', 100), /пока не извлекается/);
  assert.match(demoFileError('fictional.txt', 128001), /128 КБ/);
  assert.equal(demoFileError('fictional.MD', 128000), null);
});
