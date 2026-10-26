export const CONTRACTS_VERSION = '1.0.0' as const;
export const SCHEMA_VERSION = 1 as const;
export type Disclosure = 'local_only' | 'codex_allowed' | 'public';
export type KnowledgeKind = 'user_statement' | 'source_statement' | 'hypothesis' | 'inference' | 'calculation' | 'decision';
export type Verification = 'unverified' | 'verified' | 'disputed' | 'needs_review' | 'unknown';
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
export type RuntimeError = 'AUTH_REQUIRED' | 'USAGE_LIMIT_REACHED' | 'NETWORK_UNAVAILABLE' |
  'INVALID_MODEL_JSON' | 'STALE_INPUT' | 'CANCELLED' | 'MODEL_TIMEOUT' | 'PAID_CONTINUATION_UNVERIFIED' | 'RUNTIME_FAILED';

export interface Project { id: string; name: string; goal: string; constraints: string[]; version: number; createdAt: string }
export type FragmentLocation = { kind: 'text'; start: number; end: number } |
  { kind: 'pdf'; page: number; start: number; end: number } |
  { kind: 'docx'; paragraph: number } | { kind: 'table'; sheet: string; range: string };
export interface Source { id: string; projectId: string; origin: string; title: string; publishedAt: string | null;
  retrievedAt: string; version: number; sha256: string; disclosure: Disclosure }
export interface SourceFragment { id: string; projectId: string; sourceId: string; location: FragmentLocation; sha256: string; text: string }
export interface EvidenceRef { sourceId: string; fragmentId: string; sourceVersion: number }
export interface KnowledgeEntry { id: string; projectId: string; kind: KnowledgeKind; verification: Verification;
  text: string; scope: string; evidence: EvidenceRef[]; disclosure: Disclosure; version: number;
  calculation?: { formula: string; inputs: Record<string, number>; units: string; assumptions: string[] } }
export interface ChangeProposal { id: string; projectId: string; baseVersion: number;
  status: 'pending' | 'accepted' | 'rejected' | 'conflict'; changes: { path: string; before: unknown; after: unknown }[] }
export interface ContextSnapshot { schemaVersion: 1; projectId: string; projectVersion: number; createdAt: string;
  task: string; decisions: KnowledgeEntry[]; constraints: string[]; facts: KnowledgeEntry[];
  sources: Source[]; gaps: string[]; nextActions: string[]; excludedCount: number; sha256: string }
export interface ResearchRequest { schemaVersion: 1; projectId: string; scenario: 'analyze_report' | 'new_research';
  decision: string; initiativeIds: string[]; context: ContextSnapshot; approvedContextSha256: string }
export interface ResearchResult { schemaVersion: 1; recommendation: string; reasons: string[];
  initiatives: { id: string; consumer: string; payer: string; internalAlternatives: string[]; internalCheckScope: string;
    marketAlternatives: string[]; valueMechanism: string; metrics: string[]; counterMetrics: string[];
    dataQualityAndUsageLimits: string; economics: { formula: string; inputs: Record<string, number>; assumptions: string[] };
    mvpExperiment: string; continueCriteria: string[]; changeCriteria: string[]; stopCriteria: string[];
    risks: string[]; unknowns: string[]; nextActions: string[]; evidence: EvidenceRef[] }[];
  verification: Verification; proposedChanges: ChangeProposal[] }
export interface BootstrapResult { project: string; total: number; kind: 'calculation' }
export interface Task { id: string; projectId: string; status: TaskStatus; inputSha256: string;
  result: BootstrapResult | null; error: string | null; createdAt: string; completedAt: string | null }
export interface RuntimePort { run(request: { approvedContextSha256: string; context: ContextSnapshot;
  role: 'planner' | 'researcher' | 'analyst' | 'reviewer' | 'editor'; signal?: AbortSignal }): Promise<unknown> }

export const BOOTSTRAP_TEXT = 'Вымышленный проект «Лунный сад». В понедельник посадили 7 вымышленных деревьев, во вторник ещё 5. Верни название проекта, общее число деревьев и тип результата calculation. Никакие инструменты не нужны.';
export const BOOTSTRAP_OUTPUT_SCHEMA = { type: 'object', properties: { project: { type: 'string' },
  total: { type: 'integer' }, kind: { type: 'string', enum: ['calculation'] } },
  required: ['project', 'total', 'kind'], additionalProperties: false } as const;
export function validateBootstrapResult(value: unknown): BootstrapResult {
  const x = value as BootstrapResult;
  if (!x || typeof x !== 'object' || Object.keys(x).length !== 3 || x.project !== 'Лунный сад' ||
    x.total !== 12 || x.kind !== 'calculation') throw new Error('INVALID_MODEL_JSON');
  return x;
}
