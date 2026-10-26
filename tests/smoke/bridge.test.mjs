import test from 'node:test';
import assert from 'node:assert/strict';
import { safeFailureMessage, usesOfficialRoutes, modelFailureCode } from '../../packages/codex-bridge/src/client.ts';

test('official client routes reject lookalike hosts, custom providers and URL credentials', () => {
  assert.equal(usesOfficialRoutes({}), true);
  assert.equal(usesOfficialRoutes({ openai_base_url: 'https://api.openai.com/v1',
    chatgpt_base_url: 'https://chatgpt.com/backend-api/' }), true);
  for (const route of ['https://chatgpt.com.example.invalid', 'http://chatgpt.com',
    'https://user:synthetic-password@chatgpt.com', 'https://chatgpt.com/?token=synthetic',
    'http://127.0.0.1:1234', 'https://example.invalid']) {
    assert.equal(usesOfficialRoutes({ chatgpt_base_url: route }), false);
  }
});

test('runtime separates exhausted limits, login failures and network loss', () => {
  assert.equal(modelFailureCode({ codexErrorInfo: 'usageLimitExceeded' }), 'USAGE_LIMIT_REACHED');
  assert.equal(modelFailureCode({ message: 'HTTP 401 Unauthorized' }), 'AUTH_REQUIRED');
  assert.equal(modelFailureCode({ codexErrorInfo: 'streamDisconnected' }), 'NETWORK_UNAVAILABLE');
  assert.equal(modelFailureCode({ message: 'Synthetic unknown error' }), 'MODEL_TURN_FAILED');
});

test('upstream failures redact credentials, URLs, identities and home paths', () => {
  const result = safeFailureMessage('Bearer synthetic-token https://example.invalid/?secret=value fictional@example.invalid /Users/fictional/auth.json sk-synthetic-key');
  for (const secret of ['synthetic-token', 'example.invalid', 'fictional', 'sk-synthetic-key', 'secret=value']) {
    assert.equal(result.includes(secret), false);
  }
});
