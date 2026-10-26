import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Store, inputSha256 } from '../../../packages/memory/src/store.ts';
import { ModelQueue, billingConfirmation, runtimeError } from '../../../packages/codex-bridge/src/queue.ts';
import { acquireLock } from '../../../packages/codex-bridge/src/lock.ts';
import { BOOTSTRAP_TEXT, CONTRACTS_VERSION } from '../../../packages/contracts/src/index.ts';

const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage): Promise<any> {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new Error('JSON_REQUIRED');
  const buffers: Buffer[] = []; let size = 0;
  for await (const buffer of req) { size += buffer.length; if (size > 16_384) throw new Error('BODY_TOO_LARGE'); buffers.push(buffer); }
  try { return JSON.parse(Buffer.concat(buffers).toString('utf8')); } catch { throw new Error('INVALID_JSON'); }
}
function authorized(req: IncomingMessage, token: string) {
  const supplied = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  const actualHash = createHash('sha256').update(supplied).digest();
  const expectedHash = createHash('sha256').update(token).digest();
  return timingSafeEqual(actualHash, expectedHash);
}
export async function startServer(options: { directory?: string; port?: number; token?: string } = {}) {
  const store = new Store(options.directory);
  let release: () => void;
  try { release = acquireLock(store.directory, 'server.lock'); } catch (error) { store.close(); throw error; }
  const token = options.token ?? randomBytes(32).toString('hex');
  const queue = new ModelQueue(store);
  store.recoverInterrupted();
  let origin = '';
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (req.headers.host !== origin.replace('http://', '')) return json(res, 403, { error: 'HOST_REJECTED' });
    if (req.headers.origin && req.headers.origin !== origin) return json(res, 403, { error: 'ORIGIN_REJECTED' });
    let url: URL;
    try { url = new URL(req.url ?? '/', origin); } catch { return json(res, 400, { error: 'INVALID_URL' }); }
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      // Only Vite's generated index and content-hashed assets are exposed.
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      if (!(path === '/index.html' || /^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(path))) return json(res, 404, { error: 'NOT_FOUND' });
      const file = join(webRoot, path); const extension = path.slice(path.lastIndexOf('.'));
      if (!existsSync(file)) return json(res, 503, { error: 'BUILD_REQUIRED' });
      res.writeHead(200, { 'Content-Type': `${mime[extension] ?? 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
      return res.end(readFileSync(file));
    }
    if (!authorized(req, token)) return json(res, 401, { error: 'UNAUTHORIZED' });
    try {
      if (req.method === 'GET' && url.pathname === '/api/status') {
        return json(res, 200, { application: 'ai-atelier', contractsVersion: CONTRACTS_VERSION,
          billing: billingConfirmation(store.directory), features: { projects: true, syntheticModelTask: true,
            imports: false, research: false, memoryEdits: false, mcp: false },
          note: 'Bootstrap. Полный продукт ещё не реализован.' });
      }
      if (req.method === 'POST' && url.pathname === '/api/settings/billing-confirmation') {
        const input = await body(req);
        if (input.paidContinuationDisabled !== true || input.autoTopUpDisabled !== true) throw new Error('PAID_CONTINUATION_UNVERIFIED');
        writeFileSync(join(store.directory, 'billing-confirmation.json'), JSON.stringify({ schemaVersion: 1,
          paidContinuationDisabled: true, autoTopUpDisabled: true, source: 'user_confirmation',
          confirmedAt: new Date().toISOString(), automaticAccountVerification: false }), { mode: 0o600 });
        return json(res, 200, billingConfirmation(store.directory));
      }
      if (url.pathname === '/api/projects') {
        if (req.method === 'GET') return json(res, 200, store.projects());
        if (req.method === 'POST') {
          const input = await body(req);
          if (typeof input.name !== 'string' || (input.goal !== undefined && typeof input.goal !== 'string')) throw new Error('INVALID_PROJECT');
          return json(res, 201, store.createProject(input.name, input.goal ?? ''));
        }
      }
      const match = url.pathname.match(/^\/api\/projects\/([a-f0-9-]{36})\/(preview|tasks)(?:\/([a-f0-9-]{36})\/(cancel))?$/);
      if (match) {
        const [, projectId, action, id] = match;
        store.requireProject(projectId);
        if (action === 'preview' && !id && req.method === 'GET') return json(res, 200, {
          schemaVersion: 1, createdAt: new Date().toISOString(), projectVersion: 1, text: BOOTSTRAP_TEXT,
          inputSha256, disclosure: 'public', excludedCount: 0,
          destination: 'Официальный Codex, авторизация ChatGPT', syntheticOnly: true,
        });
        if (action === 'tasks' && !id && req.method === 'GET') return json(res, 200, store.tasks(projectId));
        if (action === 'tasks' && !id && req.method === 'POST') {
          const input = await body(req);
          if (input.approved !== true) throw new Error('CONTEXT_APPROVAL_REQUIRED');
          if (!billingConfirmation(store.directory).verifiedByUser) throw new Error('PAID_CONTINUATION_UNVERIFIED');
          if (typeof input.inputSha256 !== 'string' || typeof input.idempotencyKey !== 'string') throw new Error('INVALID_TASK');
          const task = store.enqueue(projectId, input.idempotencyKey, input.inputSha256); queue.start();
          return json(res, 202, task);
        }
        if (action === 'tasks' && id && req.method === 'POST') { await body(req); queue.cancel(projectId, id); return json(res, 200, { status: 'cancellation_requested' }); }
      }
      if (/^\/api\/(research|imports|memory|mcp)(?:\/|$)/.test(url.pathname)) return json(res, 501, { error: 'NOT_IMPLEMENTED', stage: 'bootstrap' });
      return json(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const code = runtimeError(error);
      const status = code.endsWith('_NOT_FOUND') ? 404 : ['STALE_INPUT', 'TASK_NOT_ACTIVE', 'TASK_ALREADY_RUNNING'].includes(code) ? 409 :
        code === 'BODY_TOO_LARGE' ? 413 : code === 'PAID_CONTINUATION_UNVERIFIED' ? 423 : 400;
      json(res, status, { error: code });
    }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port ?? 4271, '127.0.0.1', resolve); });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('BIND_FAILED');
    origin = `http://127.0.0.1:${address.port}`;
  } catch (error) { release(); store.close(); throw error; }
  const close = async () => {
    await queue.stop();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close(); release();
  };
  return { origin, url: `${origin}/#session=${token}`, token, close, store };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await startServer();
  writeFileSync(join(app.store.directory, 'current-session.json'), JSON.stringify({ url: app.url, origin: app.origin, pid: process.pid }), { mode: 0o600 });
  console.log(`ai-atelier запущен: ${app.origin}. Откройте приложение через launcher.`);
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => {
    if (stopping) return; stopping = true; await app.close(); process.exit();
  });
}
