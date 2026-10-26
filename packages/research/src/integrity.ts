import { createHash } from 'node:crypto';
import type { ContextSnapshot, SourceFragment } from '../../contracts/src/index.ts';
import { object, list, text, choice, number, nullable, optional, dictionary, union, ResearchError, type Schema } from './schema.ts';
import { evidenceSchema, DEFAULT_BUDGET, type ResearchInput, type ResearchSettings, type Finding, type Issue } from './types.ts';

export function sha256(text: string): string { return createHash('sha256').update(text).digest('hex'); }
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
}
export function inputDigest(input: Omit<ResearchInput, 'approvedInputSha256'> | ResearchInput): string {
  // The approved digest covers settings, report selection and source contents as well as the original snapshot.
  const { request, sources, fragments, sourceStates, reportFragmentIds, settings } = input;
  return sha256(canonical({ request, sources, fragments, sourceStates, reportFragmentIds, settings }));
}
export function stableSourceId(origin: string): string { return `src_${sha256(origin).slice(0, 32)}`; }
export function stableFragmentId(sourceId: string, sourceVersion: number, location: SourceFragment['location'], content: string): string {
  return `chunk_${sha256(canonical({ sourceId, sourceVersion, location, sha256: sha256(content) })).slice(0, 32)}`;
}
export function settings(overrides: Partial<Omit<ResearchSettings, 'budget'>> & { budget?: Partial<ResearchSettings['budget']> } = {}): ResearchSettings {
  return { criteria: [], summaryWordLimit: 500, asOf: new Date().toISOString(), staleAfterDays: 365,
    ...overrides, budget: { ...DEFAULT_BUDGET, ...overrides.budget } };
}
const id = text(100), texts = list(text(4000), 100), hash = text(64);
const disclosure = choice('local_only', 'codex_allowed', 'public');
const source = object({ id, projectId: id, origin: text(4000), title: text(2000), publishedAt: nullable(text(40)),
  retrievedAt: text(40), version: number(1, 1e9, true), sha256: hash, disclosure });
const entry = object({ id, projectId: id, kind: choice('user_statement', 'source_statement', 'hypothesis', 'inference', 'calculation', 'decision'),
  verification: choice('unverified', 'verified', 'disputed', 'needs_review', 'unknown'), text: text(12000), scope: text(4000),
  evidence: list(evidenceSchema, 100), disclosure, version: number(1, 1e9, true),
  calculation: optional(object({ formula: text(4000), inputs: dictionary(number()), units: text(100), assumptions: texts })) });
const location: Schema<SourceFragment['location']> = union<SourceFragment['location']>(
  object({ kind: choice('text'), start: number(0, 1e9, true), end: number(0, 1e9, true) }),
  object({ kind: choice('pdf'), page: number(1, 1e6, true), start: number(0, 1e9, true), end: number(0, 1e9, true) }),
  object({ kind: choice('docx'), paragraph: number(1, 1e9, true) }),
  object({ kind: choice('table'), sheet: text(100), range: text(100) }));
const context: Schema<ContextSnapshot> = object({ schemaVersion: choice(1), projectId: id, projectVersion: number(1, 1e9, true),
  createdAt: text(40), task: text(12000), decisions: list(entry, 100), constraints: texts, facts: list(entry, 200),
  sources: list(source, 100), gaps: texts, nextActions: texts, excludedCount: number(0, 1e9, true), sha256: hash });
export const inputSchema: Schema<ResearchInput> = object({
  request: object({ schemaVersion: choice(1), projectId: id, scenario: choice('analyze_report', 'new_research'), decision: text(4000),
    initiativeIds: list(id, 3, 2), context, approvedContextSha256: hash }),
  sources: list(source, 100), fragments: list(object({ id, projectId: id, sourceId: id, sourceVersion: number(1, 1e9, true),
    location, sha256: hash, text: text(16000) }), 200),
  sourceStates: list(object({ sourceId: id, sourceVersion: number(1, 1e9, true),
    status: choice('user_provided', 'source_found', 'content_retrieved', 'unverifiable'), access: choice('ok', 'snippet', 'paywall', 'error'),
    independentOrigin: id, supersedesVersion: nullable(number(1, 1e9, true)) }), 100),
  reportFragmentIds: list(id, 100), settings: object({ criteria: list(object({ id, label: text(1000) }), 20),
    summaryWordLimit: number(50, 2000, true), asOf: text(40), staleAfterDays: number(0, 36500, true),
    budget: object({ maxModelCalls: number(4, 20, true), maxCollectorCalls: number(0, 16, true), maxFindings: number(1, 100, true),
      maxStageChars: number(1000, 120000, true), timeoutMs: number(1, 600000, true) }) }), approvedInputSha256: hash,
});
export const key = (sourceId: string, version: number) => `${sourceId}\u0000${version}`;
const requireThat = (ok: unknown, code: string): void => { if (!ok) throw new ResearchError(code); };
export function unique(ids: string[], code = 'DUPLICATE_ID'): void { requireThat(new Set(ids).size === ids.length, code); }
const date = (v: string) => /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const validHash = (v: string) => /^[a-f0-9]{64}$/.test(v);
export function validateInput(raw: unknown): ResearchInput {
  const input = inputSchema.read(raw);
  const { request: r, sources, fragments, sourceStates, settings: s } = input;
  const ctx = r.context;
  requireThat(validHash(ctx.sha256) && r.approvedContextSha256 === ctx.sha256 && input.approvedInputSha256 === inputDigest(input), 'STALE_INPUT');
  requireThat(ctx.projectId === r.projectId, 'PROJECT_MISMATCH');
  requireThat(date(s.asOf) && date(ctx.createdAt), 'INVALID_DATE');
  unique(r.initiativeIds); unique(s.criteria.map(c => c.id)); unique([...ctx.facts, ...ctx.decisions].map(x => x.id));
  unique(sources.map(x => key(x.id, x.version))); unique(fragments.map(x => x.id)); unique(sourceStates.map(x => key(x.sourceId, x.sourceVersion)));
  unique(input.reportFragmentIds);
  for (const x of [...sources, ...ctx.sources, ...ctx.facts, ...ctx.decisions]) {
    requireThat(x.projectId === r.projectId, 'PROJECT_MISMATCH');
    requireThat(x.disclosure !== 'local_only', 'LOCAL_ONLY_INPUT');
  }
  for (const x of [...sources, ...ctx.sources]) {
    requireThat(validHash(x.sha256) && date(x.retrievedAt) && (x.publishedAt === null || date(x.publishedAt)), 'INVALID_SOURCE_METADATA');
  }
  for (const x of ctx.sources) {
    requireThat(sources.some(y => canonical(x) === canonical(y)), 'SNAPSHOT_SOURCE_MISMATCH');
  }
  requireThat(sources.length === sourceStates.length, 'SOURCE_STATE_MISSING');
  for (const st of sourceStates) {
    requireThat(sources.some(x => x.id === st.sourceId && x.version === st.sourceVersion), 'SOURCE_STATE_MISSING');
    if (st.supersedesVersion !== null) requireThat(st.supersedesVersion < st.sourceVersion &&
      sources.some(x => x.id === st.sourceId && x.version === st.supersedesVersion), 'INVALID_SUPERSESSION');
  }
  for (const f of fragments) {
    requireThat(f.projectId === r.projectId, 'PROJECT_MISMATCH');
    requireThat(sources.some(x => x.id === f.sourceId && x.version === f.sourceVersion), 'FRAGMENT_SOURCE_MISSING');
    requireThat(f.sha256 === sha256(f.text), 'FRAGMENT_HASH_MISMATCH');
    if ('start' in f.location) requireThat(f.location.end > f.location.start, 'INVALID_LOCATION');
    if (f.location.kind === 'table') requireThat(/^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/.test(f.location.range), 'INVALID_LOCATION');
    const state = sourceStates.find(x => x.sourceId === f.sourceId && x.sourceVersion === f.sourceVersion)!;
    requireThat(state.access === 'ok' || state.access === 'snippet', 'INACCESSIBLE_FRAGMENT');
  }
  requireThat(r.scenario !== 'analyze_report' || input.reportFragmentIds.length > 0, 'REPORT_REQUIRED');
  for (const id of input.reportFragmentIds) {
    const f = fragments.find(x => x.id === id); requireThat(f, 'REPORT_FRAGMENT_MISSING');
    const state = sourceStates.find(x => x.sourceId === f!.sourceId && x.sourceVersion === f!.sourceVersion)!;
    requireThat(state.access === 'ok', 'REPORT_CONTENT_REQUIRED');
  }
  return input;
}
export function deduplicate(claims: Finding[]): { claims: Finding[]; duplicates: { canonicalId: string; duplicateId: string }[] } {
  const byId = new Map<string, Finding>();
  for (const c of claims) {
    if (byId.has(c.id) && canonical(byId.get(c.id)) !== canonical(c)) throw new ResearchError('DUPLICATE_ID');
    byId.set(c.id, c);
  }
  const seen = new Map<string, Finding>(); const result: Finding[] = []; const duplicates: { canonicalId: string; duplicateId: string }[] = [];
  for (const claim of byId.values()) {
    const identity = canonical({ text: claim.text.normalize('NFKC').toLocaleLowerCase('ru').replace(/\s+/g, ' ').trim(),
      scope: claim.scope, initiativeId: claim.initiativeId, kind: claim.kind, support: claim.support,
      quote: claim.quote, eventAt: claim.eventAt, numberBasis: claim.numberBasis, supersedes: claim.supersedesClaimIds });
    const old = seen.get(identity);
    if (old) { duplicates.push({ canonicalId: old.id, duplicateId: claim.id });
      old.evidence = [...new Map([...old.evidence, ...claim.evidence].map(ref => [canonical(ref), ref])).values()];
      old.alternativeExplanations = [...new Set([...old.alternativeExplanations, ...claim.alternativeExplanations])];
    } else { const copy = structuredClone(claim); seen.set(identity, copy); result.push(copy); }
  }
  return { claims: result, duplicates };
}
export const issue = (code: string, detail: string, claimId: string | null = null, severity: Issue['severity'] = 'error'): Issue => ({ code, detail, claimId, severity });
