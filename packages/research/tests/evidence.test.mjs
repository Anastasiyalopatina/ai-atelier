import test from 'node:test';
import assert from 'node:assert/strict';
import { checkEvidence, checkAnalysis, research, sha256, stableFragmentId } from '../src/index.ts';
import { deduplicate } from '../src/integrity.ts';
import { makeFixture, approve, ScriptedQueue } from './fixtures.mjs';
const codes = result => result.issues.map(i => i.code);

test('existing source ID cannot validate ghost chunk, wrong version or quotation', () => {
  const f = makeFixture();
  for (const mutate of [c => c.evidence[0].fragmentId = 'ghost', c => c.evidence[0].sourceVersion = 2, c => c.evidence[0].sourceId = 'ghost']) {
    const c = structuredClone(f.claim); mutate(c); const r = checkEvidence([c], f.input);
    assert.ok(codes(r).includes('INVALID_EVIDENCE_REFERENCE')); assert.equal(r.checks[0].referenceValid, false);
  }
  const c = structuredClone(f.claim); c.quote = 'Этого текста нет в источнике';
  const r = checkEvidence([c], f.input); assert.ok(codes(r).includes('QUOTE_NOT_FOUND'));
  assert.equal(r.checks[0].referenceValid, true); assert.equal(r.checks[0].quoteMatches, false);
});
test('search snippets, paywall and unknown content status do not become read sources', () => {
  const f = makeFixture();
  for (const state of [{ access: 'snippet', status: 'source_found' }, { access: 'paywall', status: 'unverifiable' }, { access: 'ok', status: 'source_found' }]) {
    Object.assign(f.input.sourceStates[0], state);
    assert.ok(codes(checkEvidence([f.claim], f.input)).includes('INVALID_EVIDENCE_REFERENCE'));
  }
});
test('unsupported numbers, invented certainty, market absence and causal claims are visible', () => {
  const f = makeFixture();
  const cases = [
    ['Рост 37 процентов', 'none', 'UNSUPPORTED_NUMBER'],
    ['Уверенность 99%', 'assumption', 'UNCALIBRATED_CONFIDENCE'],
    ['Внутренних аналогов нет', 'none', 'ABSENCE_NOT_PROVEN'],
  ];
  for (const [text, numberBasis, expected] of cases) {
    const c = { ...f.claim, text, evidence: [], quote: null, numberBasis };
    assert.ok(codes(checkEvidence([c], f.input)).includes(expected));
  }
  const causal = { ...f.claim, kind: 'calculation', text: 'Расчёт доказывает причинность', quote: null };
  assert.ok(codes(checkEvidence([causal], f.input)).includes('CALCULATION_NOT_CAUSAL_PROOF'));
});
test('literal quote matching never certifies semantic entailment', async () => {
  const f = makeFixture(); f.claim.support = 'support_checked';
  const r = checkEvidence([f.claim], f.input);
  assert.equal(r.checks[0].quoteMatches, true); assert.equal(r.checks[0].semanticSupport, 'model_only_unverified');
  assert.ok(codes(r).includes('SEMANTIC_SUPPORT_UNVERIFIED'));
  f.collection.findings[0].support = 'support_checked'; f.analysis.claims[0].support = 'support_checked';
  const a = await research(f.input, new ScriptedQueue(f)); assert.notEqual(a.result.verification, 'verified');
});
test('reprints sharing origin or identical content are not independent confirmations', () => {
  for (const sameOrigin of [true, false]) {
    const f = makeFixture(), source = { ...f.input.sources[0], id: 'reprint', sha256: sameOrigin ? sha256('different reprint formatting') : f.input.sources[0].sha256 };
    const fragment = { ...f.input.fragments[0], id: 'reprint-chunk', sourceId: source.id };
    f.input.sources.push(source); f.input.fragments.push(fragment);
    f.input.sourceStates.push({ ...f.input.sourceStates[0], sourceId: source.id, independentOrigin: sameOrigin ? 'moon-report' : 'another-origin' });
    f.claim.evidence.push({ sourceId: source.id, fragmentId: fragment.id, sourceVersion: 1 });
    assert.ok(codes(checkEvidence([f.claim], f.input)).includes('NON_INDEPENDENT_SOURCES'));
  }
});
test('publication freshness and superseded versions retain historical conclusions', () => {
  const f = makeFixture(); f.input.sources[0].publishedAt = '2020-01-01T00:00:00.000Z';
  f.input.sources.push({ ...f.input.sources[0], version: 2, publishedAt: '2026-10-20T00:00:00.000Z' });
  f.input.sourceStates.push({ ...f.input.sourceStates[0], sourceVersion: 2, supersedesVersion: 1 });
  const r = checkEvidence([f.claim], f.input); assert.ok(codes(r).includes('STALE_SOURCE')); assert.ok(codes(r).includes('SUPERSEDED_SOURCE'));
  assert.equal(f.claim.evidence[0].sourceVersion, 1);
});
test('duplicates merge references but preserve opposite findings', () => {
  const f = makeFixture(), duplicate = { ...structuredClone(f.claim), id: 'duplicate' };
  const opposite = { ...structuredClone(f.claim), id: 'opposite', text: 'Луна не ведёт ручной учёт посадок.', support: 'contradicts' };
  const r = deduplicate([f.claim, duplicate, opposite]);
  assert.equal(r.claims.length, 2); assert.deepEqual(r.duplicates, [{ canonicalId: f.claim.id, duplicateId: 'duplicate' }]);
  assert.ok(codes(checkEvidence(r.claims, f.input)).includes('CONTRADICTING_EVIDENCE'));
  assert.equal(deduplicate([f.claim, structuredClone(f.claim)]).claims.length, 1);
  assert.throws(() => deduplicate([f.claim, { ...f.claim, text: 'Другое утверждение под тем же ID' }]), e => e.code === 'DUPLICATE_ID');
});
test('stable chunk identity changes with source version, location or content', () => {
  const f = makeFixture(), fragment = f.input.fragments[0];
  const old = stableFragmentId(fragment.sourceId, 1, fragment.location, fragment.text);
  assert.notEqual(old, stableFragmentId(fragment.sourceId, 2, fragment.location, fragment.text));
  assert.notEqual(old, stableFragmentId(fragment.sourceId, 1, { kind: 'docx', paragraph: 2 }, fragment.text));
  assert.notEqual(old, stableFragmentId(fragment.sourceId, 1, fragment.location, fragment.text + 'новое'));
});
test('missing mandatory blocks, unsupported permissions and accepted thresholds are caught', () => {
  const f = makeFixture(); f.analysis.initiatives[0].metrics = []; f.analysis.initiatives[0].data[0].permission = 'confirmed';
  f.analysis.initiatives[0].mvp.thresholds = 'user_agreed';
  const codes = checkAnalysis(f.analysis, [f.claim], f.input).map(i => i.code);
  for (const code of ['REQUIRED_BLOCK_MISSING', 'INTERNAL_ALTERNATIVES_UNKNOWN', 'DATA_PERMISSION_UNSUPPORTED', 'THRESHOLDS_REQUIRE_USER_ACCEPTANCE']) assert.ok(codes.includes(code));
});
test('missing evidence downgrades result and blocks proposal acceptance', async () => {
  const f = makeFixture(); f.collection.findings[0].evidence = []; f.collection.findings[0].quote = null;
  f.analysis.claims = structuredClone(f.collection.findings);
  const a = await research(f.input, new ScriptedQueue(f));
  assert.equal(a.result.verification, 'needs_review'); assert.equal(a.proposals[0].status, 'conflict');
});
