import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDirectory } from '../packages/memory/src/store.ts';
import { findCodex } from './doctor.mjs';
import { SubscriptionClient } from '../packages/codex-bridge/src/client.ts';
import { billingConfirmation } from '../packages/codex-bridge/src/queue.ts';

const directory = dataDirectory();
if (!billingConfirmation(directory).verifiedByUser) throw new Error('PAID_CONTINUATION_UNVERIFIED');
const installation = findCodex().selected;
if (!installation) throw new Error('CODEX_UNAVAILABLE');
const workspace = mkdtempSync(join(directory, 'web-probe-'));
const client = new SubscriptionClient(installation.binary, workspace, directory);
try {
  const { selected } = await client.initialize();
  const text = 'Проверь доступность live web search: выполни веб-поиск официальной страницы IANA Example Domains. Верни status=available, заголовок и URL только если реально использовал веб-поиск. Если поиск недоступен, верни status=unavailable и пустые title/url. Это синтетический диагностический запрос без личных данных.';
  console.log(JSON.stringify({ preview: text, syntheticOnly: true, liveSearchRequested: true }));
  const schema = { type: 'object', properties: { status: { type: 'string', enum: ['available', 'unavailable'] },
    title: { type: 'string' }, url: { type: 'string' } }, required: ['status', 'title', 'url'], additionalProperties: false };
  const result = await client.structured({ text, schema, model: selected, billingConfirmed: true, liveSearch: true });
  const value = result.value;
  const verified = result.searchObserved && value?.status === 'available' && /^https:\/\/(www\.)?iana\.org\//.test(value?.url ?? '');
  const receipt = { checkedAt: new Date().toISOString(), available: verified, toolObserved: result.searchObserved,
    model: selected.model, ...(verified ? { title: value.title, url: value.url } : {}),
    limitation: verified ? null : 'Live web search is not verified; never invent sources' };
  writeFileSync(join(directory, 'web-search-check.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(receipt));
} catch (error) {
  console.log(JSON.stringify({ available: false, limitation: 'Live web search probe did not complete',
    error: /^[A-Z0-9_:-]+$/.test(error.message) ? error.message : 'PROBE_FAILED' }));
  process.exitCode = 1;
} finally { await client.close(); rmSync(workspace, { recursive: true, force: true }); }
