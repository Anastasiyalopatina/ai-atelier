import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { startServer } from '../../apps/server/src/index.ts';

test('loopback API rejects foreign origins, rebinding hosts and missing credentials', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ai-atelier-http-test-'));
  const app = await startServer({ directory, port: 0 });
  const headers = { Authorization: `Bearer ${app.token}`, 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${app.origin}/api/projects`)).status, 401);
    assert.equal((await fetch(`${app.origin}/api/projects`, { headers: { ...headers, Origin: 'https://evil.example.invalid' } })).status, 403);
    const rebound = await new Promise((resolve, reject) => {
      const req = request(`${app.origin}/api/projects`, { headers: { ...headers, Host: 'evil.example.invalid' } }, (res) => {
        res.resume(); res.once('end', () => resolve(res.statusCode));
      }); req.on('error', reject); req.end();
    });
    assert.equal(rebound, 403);
    const created = await fetch(`${app.origin}/api/projects`, { method: 'POST', headers, body: JSON.stringify({ name: 'Синтетический проект' }) });
    assert.equal(created.status, 201); const project = await created.json();
    assert.equal((await fetch(`${app.origin}/api/projects/${project.id}/preview`, { headers })).status, 200);
    assert.equal((await fetch(`${app.origin}/api/projects/${project.id}/tasks`, { method: 'POST', headers,
      body: JSON.stringify({ approved: false }) })).status, 400);
    assert.equal((await fetch(`${app.origin}/api/imports`, { headers })).status, 501);
    assert.equal((await fetch(`${app.origin}/api/projects`, { method: 'POST', headers,
      body: JSON.stringify({ name: 'x'.repeat(18_000) }) })).status, 413);
    assert.equal((await fetch(`${app.origin}/auth.json`)).status, 404);
    const status = await fetch(`${app.origin}/api/status`, { headers });
    assert.equal(status.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"), true);
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});
