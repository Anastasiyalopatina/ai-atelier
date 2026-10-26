import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { StatusBadge, VerificationBadge, DiffBlock } from '../src/components.ts';
import { initialDemo } from '../src/demo.ts';
import { statusLabels } from '../src/state.ts';

const vite = await createServer({ configFile: false, root: fileURLToPath(new URL('../', import.meta.url)),
  logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
after(() => vite.close());
const { Memory, ProposalDialog } = await vite.ssrLoadModule('/src/Memory.tsx');
const { Settings } = await vite.ssrLoadModule('/src/Settings.tsx');
const { Research, newResearchDraft } = await vite.ssrLoadModule('/src/Research.tsx');
const h = React.createElement, noop = () => {};

test('all task states have a visible text label independent of color', () => {
  for (const [status, label] of Object.entries(statusLabels)) assert.ok(renderToStaticMarkup(h(StatusBadge, { status })).includes(label));
});
test('verification status does not imply that user acceptance verifies a fact', () => {
  const html = renderToStaticMarkup(h(VerificationBadge, { value: 'unverified' }));
  assert.match(html, /Не проверено/); assert.ok(!html.includes('Подтвердить факт'));
});
test('diff and actual Memory component escape long untrusted source text', () => {
  const text = '<script>alert("fictional")</script>' + 'Длинная цитата '.repeat(100);
  const html = renderToStaticMarkup(h(DiffBlock, { before: text, after: text }));
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;'));
  const w = initialDemo()[0]; w.entries[0].text = text;
  const memory = renderToStaticMarkup(h(Memory, { workspace: w, evidence: noop, proposals: noop }));
  assert.ok(!memory.includes('<script>')); assert.ok(memory.includes('Из источника'));
});
test('stale proposal is disabled and explains conflict before any acceptance', () => {
  const html = renderToStaticMarkup(h(ProposalDialog, { workspace: initialDemo()[0], update: noop, onClose: noop }));
  assert.match(html, /Конфликт версий/); assert.match(html, /Сравнить с текущей версией/);
  assert.match(html, /type="checkbox" disabled=""/); assert.match(html, /Принять выбранные записи \(0\)/);
});
test('Settings renders unknown limits and disabled unsupported login/model actions', () => {
  const html = renderToStaticMarkup(h(Settings, { status: null, api: {}, demo: false, health: 'offline', refresh: noop }));
  assert.match(html, /Нет связи/); assert.match(html, /Неизвестны/); assert.match(html, /Каталог моделей не получен/);
  assert.match(html, /disabled="" aria-describedby="login-reason"/); assert.ok(!html.includes('API-ключ'));
});
test('research preview is disabled for one initiative, while question input is preserved', () => {
  const w = initialDemo()[0], draft = newResearchDraft(w); draft.decision = 'Вымышленный сохранённый вопрос'; draft.initiatives = ['demo-i1'];
  const html = renderToStaticMarkup(h(Research, { workspace: w, draft, setDraft: noop, openResult: noop }));
  assert.match(html, /Вымышленный сохранённый вопрос/); assert.match(html, /хотя бы две инициативы/);
  assert.match(html, /button disabled=""[^>]*>[\s\S]*Предпросмотр контекста/);
});
