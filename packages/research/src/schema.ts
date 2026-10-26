// Small, closed JSON Schema vocabulary; no dependencies, coercion or executable schemas.
export class ResearchError extends Error {
  readonly code: string;
  readonly path: string;
  constructor(code: string, path = '$') { super(`${code}: ${path}`); this.code = code; this.path = path; }
}
export type JsonSchema = Record<string, unknown>;
export interface Schema<T> { json: JsonSchema; read(value: unknown, path?: string): T; optional?: true }
export type Infer<S> = S extends Schema<infer T> ? T : never;
type Shape = Record<string, Schema<unknown>>;
type ObjectValue<S extends Shape> = { [K in keyof S as S[K] extends { optional: true } ? never : K]: Infer<S[K]> } &
  { [K in keyof S as S[K] extends { optional: true } ? K : never]?: Infer<S[K]> };
const fail = (path: string): never => { throw new ResearchError('INVALID_SCHEMA', path); };
export const text = (max = 4000, min = 1): Schema<string> => ({
  json: { type: 'string', minLength: min, maxLength: max },
  read(v, p = '$') { return typeof v === 'string' && v.length >= min && v.length <= max && (min === 0 || v.trim()) ? v : fail(p); },
});
export const number = (min = -1e15, max = 1e15, integer = false): Schema<number> => ({
  json: { type: integer ? 'integer' : 'number', minimum: min, maximum: max },
  read(v, p = '$') { return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isSafeInteger(v)) ? v : fail(p); },
});
export const choice = <const T extends readonly (string | number | boolean)[]>(...values: T): Schema<T[number]> => ({
  json: { enum: values }, read(v, p = '$') { return values.includes(v as T[number]) ? v as T[number] : fail(p); },
});
export const nullable = <T>(s: Schema<T>): Schema<T | null> => ({
  json: { anyOf: [s.json, { type: 'null' }] }, read(v, p = '$') { return v === null ? null : s.read(v, p); },
});
export const optional = <T>(s: Schema<T>): Schema<T> & { optional: true } => ({ ...s, optional: true });
export const list = <T>(s: Schema<T>, max = 100, min = 0): Schema<T[]> => ({
  json: { type: 'array', items: s.json, minItems: min, maxItems: max },
  read(v, p = '$') { if (!Array.isArray(v) || v.length < min || v.length > max) return fail(p); return v.map((item, i) => s.read(item, `${p}[${i}]`)); },
});
export const object = <S extends Shape>(shape: S): Schema<ObjectValue<S>> => ({
  json: { type: 'object', properties: Object.fromEntries(Object.entries(shape).map(([k, s]) => [k, s.json])),
    required: Object.keys(shape).filter(k => !shape[k].optional), additionalProperties: false },
  read(v, p = '$') {
    if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return fail(p);
    const x = v as Record<string, unknown>;
    if (Object.keys(x).some(k => !Object.hasOwn(shape, k))) return fail(p);
    const result = Object.create(null);
    for (const [k, s] of Object.entries(shape)) {
      if (!Object.hasOwn(x, k)) { if (!s.optional) fail(`${p}.${k}`); }
      else { if (Object.getOwnPropertyDescriptor(x, k)?.get) fail(`${p}.${k}`); result[k] = s.read(x[k], `${p}.${k}`); }
    }
    return result as ObjectValue<S>;
  },
});
export const union = <T>(...schemas: Schema<T>[]): Schema<T> => ({
  json: { anyOf: schemas.map(s => s.json) }, read(v, p = '$') {
    for (const s of schemas) { try { return s.read(v, p); } catch (e) { if (!(e instanceof ResearchError)) throw e; } }
    return fail(p);
  },
});
export const dictionary = <T>(s: Schema<T>, max = 30): Schema<Record<string, T>> => ({
  json: { type: 'object', additionalProperties: s.json, maxProperties: max, propertyNames: { pattern: '^[A-Za-z][A-Za-z0-9_]{0,39}$' } },
  read(v, p = '$') {
    if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return fail(p);
    if (Object.keys(v).length > max) return fail(p);
    const r = Object.create(null);
    for (const k of Object.keys(v)) { if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(k) || ['constructor', 'prototype', '__proto__'].includes(k)) fail(p);
      if (Object.getOwnPropertyDescriptor(v, k)?.get) fail(p); r[k] = s.read((v as Record<string, unknown>)[k], `${p}.${k}`); }
    return r;
  },
});
