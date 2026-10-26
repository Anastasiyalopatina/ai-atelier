import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExpression, research } from '../src/index.ts';
import { makeFixture, ScriptedQueue } from './fixtures.mjs';
const expr = () => ({ tokens: [{ op: 'input', name: 'price' }, { op: 'input', name: 'quantity' }, { op: 'multiply', name: null }],
  inputs: [{ name: 'price', quantity: { value: 3, unit: 'RUB*item^-1' } }, { name: 'quantity', quantity: { value: 4, unit: 'item' } }],
  expected: { value: 12, unit: 'RUB' }, assumptions: ['Вымышленная цена — допущение'], displayFormula: 'UNTRUSTED_FORMULA' });
test('executes bounded arithmetic and reconstructs formula from executed operations', () => {
  assert.deepEqual(evaluateExpression(expr()), { value: 12, unit: 'RUB', displayFormula: '(price*quantity)' });
});
test('does not add incompatible units or convert month/year implicitly', () => {
  const e = expr(); e.tokens[2].op = 'add';
  assert.throws(() => evaluateExpression(e), e => e.code === 'UNIT_MISMATCH');
  const f = expr(); f.expected.unit = 'USD'; assert.throws(() => evaluateExpression(f), e => e.code === 'UNIT_MISMATCH');
});
test('rejects division by zero, incorrect results, stack overflow and executable formula tokens', () => {
  const cases = [
    [e => { e.tokens[2].op = 'divide'; e.inputs[1].quantity.value = 0; }, 'DIVISION_BY_ZERO'],
    [e => e.expected.value = 13, 'CALCULATION_RESULT_MISMATCH'],
    [e => e.tokens.pop(), 'INVALID_CALCULATION_STACK'],
    [e => e.tokens[2].op = 'eval', 'INVALID_SCHEMA'],
    [e => e.inputs[0].quantity.value = Infinity, 'INVALID_SCHEMA'],
    [e => e.tokens[0].name = 'process.exit()', 'MISSING_CALCULATION_INPUT'],
  ];
  for (const [mutate, expected] of cases) { const e = expr(); mutate(e); assert.throws(() => evaluateExpression(e), e => e.code === expected); }
});
test('model display formula cannot differ from saved executable calculation', async () => {
  const f = makeFixture(); const calculation = { ...structuredClone(f.claim), id: 'economics', kind: 'calculation',
    text: 'Условная стоимость 12 RUB', numberBasis: 'calculation', evidence: [], quote: null, support: 'unverifiable' };
  f.analysis.claims.push(calculation); f.analysis.calculations.push({ id: 'cost', claimId: calculation.id, expression: expr() });
  f.analysis.initiatives[0].monetization.calculationIds.push('cost');
  f.analysis.proposalDrafts = [{ id: 'add-calc', kind: 'add_finding', claimId: calculation.id, targetEntryId: null, reason: 'Сохранить расчёт' }];
  f.edit.claimOrder.push(calculation.id);
  const a = await research(f.input, new ScriptedQueue(f));
  assert.equal(a.proposals[0].changes[0].after.calculation.formula, '(price*quantity)');
  assert.equal(a.result.initiatives[0].economics.formula, '(price*quantity)');
});
