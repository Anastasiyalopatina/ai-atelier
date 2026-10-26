import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkCases } from '../benchmark/cases.mjs';
import { research, applyEdit } from '../src/index.ts';
import { makeFixture, ScriptedQueue } from './fixtures.mjs';

test('overlong summaries fail explicitly; structured risks remain unchanged', () => {
  const f = makeFixture(); f.analysis.recommendation = 'Синтетическое повторение '.repeat(300); f.edit.recommendationParagraphIndexes = [0];
  const risks = structuredClone(f.analysis.initiatives[0].risks);
  assert.throws(() => applyEdit(f.analysis, f.edit, 500), e => e.code === 'SUMMARY_LIMIT_EXCEEDED');
  assert.deepEqual(f.analysis.initiatives[0].risks, risks);
});
test('opposite conclusions require semantic review; explicit contradiction remains disputed', async () => {
  const f = makeFixture(); const opposite = { ...structuredClone(f.claim), id: 'opposite', text: 'Спрос не подтверждён.', support: 'contradicts' };
  f.collection.findings.push(opposite); f.analysis.claims.push(opposite); f.edit.claimOrder.push(opposite.id);
  const result = await research(f.input, new ScriptedQueue(f));
  assert.equal(result.result.verification, 'disputed'); assert.ok(result.claims.some(x => x.id === f.claim.id));
  assert.ok(result.claims.some(x => x.id === opposite.id));
});
test('benchmark explicitly separates semantic-only cases from deterministic detections', () => {
  assert.equal(benchmarkCases.length, 11);
  for (const id of ['opposite-conclusions', 'source-injection']) assert.deepEqual(benchmarkCases.find(c => c.id === id).deterministic, []);
  // The rubric is not a model evaluation run. No success rate or confidence score is manufactured.
});
