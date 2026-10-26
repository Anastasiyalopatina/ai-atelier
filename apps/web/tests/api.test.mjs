import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, takeSession, ApiError, explainError } from '../src/api.ts';

test('network errors never return fixtures and never automatically retry', async () => {
  let calls = 0;
  const api = createApi('fictional-session', async () => { calls++; throw new TypeError('private network details'); });
  await assert.rejects(api.projects(), (e) => e.code === 'NETWORK_UNAVAILABLE');
  assert.equal(calls, 1);
  assert.ok(!explainError(new Error('private email / token')).includes('private'));
});
test('the existing approval hash and idempotency key are sent unchanged', async () => {
  let request;
  const api = createApi('fictional-session', async (path, options) => { request = { path, ...options }; return new Response('{}'); });
  await api.run('project-id', 'digest', 'stable-key');
  assert.equal(request.path, '/api/projects/project-id/tasks');
  assert.equal(request.method, 'POST');
  assert.deepEqual(JSON.parse(request.body), { approved: true, inputSha256: 'digest', idempotencyKey: 'stable-key' });
});
test('malformed server envelopes do not become a successful connection', async () => {
  const api = createApi('', async () => new Response(JSON.stringify({ billing: { verifiedByUser: true } })));
  await assert.rejects(api.status(), (e) => e.code === 'INVALID_RESPONSE');
  await assert.rejects(api.projects(), (e) => e.code === 'INVALID_RESPONSE');
  await assert.rejects(api.tasks('id'), (e) => e.code === 'INVALID_RESPONSE');
});
test('HTTP error codes are translated without exposing raw server content', async () => {
  const api = createApi('', async () => new Response(JSON.stringify({ error: 'UNAUTHORIZED', private: 'SECRET' }), { status: 401 }));
  await assert.rejects(api.projects(), (e) => e.code === 'UNAUTHORIZED' && !explainError(e).includes('SECRET'));
  assert.match(explainError(new ApiError('STALE_INPUT')), /предпросмотр/);
});
test('aborting a project request remains an abort, not a network fallback', async () => {
  const api = createApi('', async (_path, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const controller = new AbortController();
  const pending = api.tasks('old-project', controller.signal); controller.abort();
  await assert.rejects(pending, (e) => e.name === 'AbortError');
});
test('session fragment is removed while retaining demo and route query', () => {
  const stored = new Map(); let replaced;
  const token = takeSession({ location: { hash: '#session=fictional-session', pathname: '/', search: '?demo=1&view=memory' },
    sessionStorage: { setItem: (k, v) => stored.set(k, v) }, history: { replaceState: (_state, _title, url) => { replaced = url; } } });
  assert.equal(token, 'fictional-session');
  assert.equal(replaced, '/?demo=1&view=memory');
  assert.equal(stored.get('ai-atelier-session'), token);
});
