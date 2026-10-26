// Browser QA only: actual Bootstrap HTTP server + disposable fictional SQLite.
// Store-seeded tasks are fixtures, never a model call. No billing confirmation.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../server/src/index.ts';
import { inputSha256 } from '../../../packages/memory/src/store.ts';

const directory = mkdtempSync(join(tmpdir(), 'ai-atelier-ui-qa-'));
const app = await startServer({ directory, port: 4283 });
const first = app.store.createProject('Синтетический сад', 'Вымышленный проект для проверки интерфейса.');
app.store.createProject('Вымышленная библиотека — очень длинное русское название проекта для проверки узкого окна', 'Данные второго проекта изолированы.');
const done = app.store.enqueue(first.id, 'ui-fixture-completed', inputSha256);
app.store.transition(first.id, done.id, 'completed', { result: { project: 'Лунный сад', total: 12, kind: 'calculation' } });
app.store.enqueue(first.id, 'ui-fixture-cancel', inputSha256);
const sessionFile = '/private/tmp/ai-atelier-ui-preview-session.json';
writeFileSync(sessionFile, JSON.stringify({ url: app.url, origin: app.origin }), { mode: 0o600 });
console.log(`UI QA preview: ${app.origin}/?demo=1 · isolated fictional data · no model calls`);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (stopping) return; stopping = true;
  await app.close(); rmSync(directory, { recursive: true, force: true }); rmSync(sessionFile, { force: true }); process.exit();
});
