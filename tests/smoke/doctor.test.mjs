import test from 'node:test';
import assert from 'node:assert/strict';
import { childEnvironment, publicAccount, publicLimits, publicRpcError, ReadOnlyAppServer } from '../../scripts/doctor.mjs';

test('child environment excludes API credentials and provider overrides', () => {
  const result = childEnvironment({ HOME: '/synthetic-home', PATH: '/usr/bin', CODEX_HOME: '/synthetic-codex',
    OPENAI_API_KEY: 'synthetic-key', CODEX_API_KEY: 'synthetic-key', ACCESS_TOKEN: 'synthetic-token',
    OPENAI_BASE_URL: 'https://invalid.example', NODE_OPTIONS: '--require=untrusted.js',
    AWS_ACCESS_KEY_ID: 'synthetic' });
  assert.deepEqual(result, { HOME: '/synthetic-home', PATH: '/usr/bin', CODEX_HOME: '/synthetic-codex' });
});

test('preserves the configured network proxy without accepting provider overrides', () => {
  assert.deepEqual(childEnvironment({ HTTPS_PROXY: 'http://proxy.example.invalid:8080',
    NO_PROXY: '127.0.0.1,localhost', OPENAI_BASE_URL: 'https://invalid.example' }), {
    HTTPS_PROXY: 'http://proxy.example.invalid:8080', NO_PROXY: '127.0.0.1,localhost',
  });
});

test('RPC failures are useful without returning private upstream text', () => {
  assert.equal(publicRpcError('account/read', { code: -32603,
    message: 'workspace routing discovery failed: synthetic-token fictional@example.invalid' }),
  'account/read:WORKSPACE_ROUTING_DISCOVERY_FAILED:-32603');
  assert.equal(publicRpcError('account/read', { code: -32603, message: 'synthetic-token' }),
    'account/read:RPC_FAILED:-32603');
});

test('account diagnostics never include identity or credential fields', () => {
  assert.deepEqual(publicAccount({ account: { type: 'chatgpt', planType: 'pro',
    email: 'fictional@example.invalid', accountId: 'synthetic-id', accessToken: 'synthetic-token' },
    requiresOpenaiAuth: true }), { type: 'chatgpt', planType: 'pro', requiresOpenaiAuth: true });
});

test('available credits do not prove that automatic paid continuation is disabled', () => {
  const result = publicLimits({ rateLimits: { credits: { hasCredits: true, unlimited: false, balance: '42' } } });
  assert.equal(result.automaticPaidContinuation, 'unknown');
  assert.deepEqual(result.credits, { hasCredits: true, unlimited: false });
});

test('diagnostic rejects model, login, purchase, and tool RPC before any process access', async () => {
  for (const method of ['turn/start', 'thread/start', 'account/login/start', 'account/logout',
    'account/sendAddCreditsNudgeEmail', 'account/rateLimitResetCredit/consume', 'command/exec']) {
    await assert.rejects(ReadOnlyAppServer.prototype.request.call({}, method), /READ_ONLY_METHOD_REQUIRED/);
  }
});
