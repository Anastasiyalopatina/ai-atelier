import { ResearchError } from './schema.ts';
import { expressionSchema, type Expression } from './types.ts';
type Dimension = Map<string, number>;
interface Value { value: number; dimension: Dimension }
function dimensions(unit: string): Dimension {
  if (unit === '1') return new Map();
  const d = new Map<string, number>();
  // Units are explicit identifiers with integer powers, e.g. RUB*month^-1 or item.
  for (const part of unit.split('*')) {
    const m = /^([A-Za-z][A-Za-z0-9_]{0,29})(?:\^(-?[1-9]\d?))?$/.exec(part);
    if (!m) throw new ResearchError('INVALID_UNIT');
    const power = Number(m[2] ?? 1); d.set(m[1], (d.get(m[1]) ?? 0) + power);
  }
  return new Map([...d].filter(([, power]) => power !== 0).sort(([a], [b]) => a.localeCompare(b)));
}
const signature = (d: Dimension) => JSON.stringify([...d].sort(([a], [b]) => a.localeCompare(b)));
function combine(a: Dimension, b: Dimension, sign: number): Dimension {
  const d = new Map(a); for (const [unit, power] of b) d.set(unit, (d.get(unit) ?? 0) + sign * power);
  return new Map([...d].filter(([, power]) => power !== 0));
}
export function evaluateExpression(raw: unknown): { value: number; unit: string; displayFormula: string } {
  const expr: Expression = expressionSchema.read(raw);
  const inputs = new Map<string, Value>(); const used = new Set<string>();
  for (const x of expr.inputs) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(x.name) || inputs.has(x.name)) throw new ResearchError('INVALID_CALCULATION_INPUT');
    inputs.set(x.name, { value: x.quantity.value, dimension: dimensions(x.quantity.unit) });
  }
  const stack: (Value & { formula: string })[] = [];
  for (const token of expr.tokens) {
    if (token.op === 'input') {
      const x = token.name && inputs.get(token.name); if (!x) throw new ResearchError('MISSING_CALCULATION_INPUT');
      stack.push({ ...x, formula: token.name! }); used.add(token.name!); continue;
    }
    if (token.name !== null) throw new ResearchError('INVALID_CALCULATION_TOKEN');
    const b = stack.pop(), a = stack.pop(); if (!a || !b) throw new ResearchError('INVALID_CALCULATION_STACK');
    if (['add', 'subtract'].includes(token.op) && signature(a.dimension) !== signature(b.dimension)) throw new ResearchError('UNIT_MISMATCH');
    if (token.op === 'divide' && b.value === 0) throw new ResearchError('DIVISION_BY_ZERO');
    const value = token.op === 'add' ? a.value + b.value : token.op === 'subtract' ? a.value - b.value :
      token.op === 'multiply' ? a.value * b.value : a.value / b.value;
    if (!Number.isFinite(value) || Math.abs(value) > 1e15) throw new ResearchError('CALCULATION_OVERFLOW');
    const op = { add: '+', subtract: '-', multiply: '*', divide: '/' }[token.op];
    stack.push({ value, dimension: token.op === 'multiply' ? combine(a.dimension, b.dimension, 1) :
      token.op === 'divide' ? combine(a.dimension, b.dimension, -1) : a.dimension, formula: `(${a.formula}${op}${b.formula})` });
  }
  if (stack.length !== 1 || used.size !== inputs.size) throw new ResearchError('INVALID_CALCULATION_STACK');
  const result = stack[0];
  if (signature(result.dimension) !== signature(dimensions(expr.expected.unit))) throw new ResearchError('UNIT_MISMATCH');
  if (Math.abs(result.value - expr.expected.value) > 1e-10 * Math.max(1, Math.abs(result.value))) throw new ResearchError('CALCULATION_RESULT_MISMATCH');
  // Display is reconstructed from the executed program; model-supplied displayFormula is never executed or trusted.
  return { value: result.value, unit: expr.expected.unit, displayFormula: result.formula };
}
