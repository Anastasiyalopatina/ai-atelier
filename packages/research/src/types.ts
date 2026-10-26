import type { ContextSnapshot, ResearchRequest, ResearchResult, RuntimePort, Source, SourceFragment, ChangeProposal } from '../../contracts/src/index.ts';
import { object, list, text, number, choice, nullable, type Infer, type JsonSchema } from './schema.ts';

export const RESEARCH_VERSION = '1.0.0' as const;
export const STAGE_PROTOCOL = 'ai-atelier.research.stage.v1' as const;
export const idSchema = text(100);
const texts = () => list(text(2000), 30);
export const evidenceSchema = object({ sourceId: idSchema, fragmentId: idSchema, sourceVersion: number(1, 1e9, true) });
export const actionSchema = object({ id: idSchema, initiativeId: idSchema,
  kind: choice('search', 'internal_clarification', 'interview', 'calculation', 'pilot'),
  task: text(2000), expectedResult: text(2000) });
export const briefSchema = object({ decision: text(), initiativeIds: list(idSchema, 3, 2),
  criteria: list(object({ id: idSchema, label: text(1000) }), 20), constraints: texts(),
  proposedCriteria: texts(), questions: list(actionSchema, 20), readinessCriteria: texts(), stopConditions: texts() });
export const findingSchema = object({ id: idSchema, initiativeId: idSchema,
  kind: choice('user_statement', 'source_statement', 'hypothesis', 'inference', 'calculation', 'decision'),
  text: text(), scope: text(1500), alternativeExplanations: texts(), evidence: list(evidenceSchema, 20),
  // A model may request these states, but deterministic checks do not attest semantic support.
  support: choice('user_provided', 'source_found', 'content_retrieved', 'support_checked', 'contradicts', 'unverifiable'),
  quote: nullable(text()), eventAt: nullable(text(40)), numberBasis: choice('none', 'cited', 'assumption', 'calculation'),
  independenceKey: nullable(idSchema), supersedesClaimIds: list(idSchema, 20) });
export const collectionSchema = object({ findings: list(findingSchema, 64), gaps: texts(),
  nextActions: list(actionSchema, 30), sufficientForDecision: choice(true, false), sufficiencyReason: text(2000) });
export const metricSchema = object({ id: idSchema, name: text(500), kind: choice('outcome', 'leading', 'counter'),
  control: choice('team', 'external'), baseline: nullable(text(500)), formula: text(1000), unit: text(100),
  segment: text(500), observationWindow: text(500), measurementSource: text(1000) });
export const quantitySchema = object({ value: number(), unit: text(100) });
export const expressionSchema = object({
  // Bounded postfix program; only fixed opcodes and named inputs. No parsing/eval of model strings.
  tokens: list(object({ op: choice('input', 'add', 'subtract', 'multiply', 'divide'), name: nullable(text(40)) }), 100, 1),
  inputs: list(object({ name: text(40), quantity: quantitySchema }), 30, 1),
  expected: quantitySchema, assumptions: texts(), displayFormula: text(1000),
});
export const initiativeSchema = object({ id: idSchema, consumer: text(1000), payer: text(1000), decisionMaker: text(1000),
  jobToBeDone: text(1500), demandClaimIds: list(idSchema, 30),
  internalAlternatives: texts(), internalCheckScope: text(2000), internalUnknowns: texts(), internalContacts: texts(),
  marketAlternatives: list(object({ name: text(500), type: choice('product', 'manual', 'build'), scenario: text(1000),
    claimIds: list(idSchema, 30) }), 30),
  valueChain: object({ dataOrModel: text(1000), use: text(1000), changedAction: text(1000), effect: text(1000), economicValue: text(1000) }),
  metrics: list(metricSchema, 30), data: list(object({ field: text(500), availability: choice('available', 'missing', 'unknown'),
    quality: text(1000), coverage: text(500), freshness: text(500), access: text(500), permission: choice('confirmed', 'denied', 'unknown'),
    permissionEvidence: list(evidenceSchema, 10), limits: text(1000) }), 40),
  monetization: object({ paidFor: text(1000), billingUnit: text(500), purchasePath: text(1000), costs: text(1000),
    status: choice('hypothesis', 'evidenced'), claimIds: list(idSchema, 30), calculationIds: list(idSchema, 30) }),
  mvp: object({ mainRisk: text(1000), experiment: text(2000), excludedFeatures: texts(),
    continueCriteria: texts(), changeCriteria: texts(), stopCriteria: texts(), thresholds: choice('user_agreed', 'proposed', 'none') }),
  claimIds: list(idSchema, 64), risks: texts(), unknowns: texts(), nextActions: list(actionSchema, 30) });
export const proposalDraftSchema = object({ id: idSchema, kind: choice('add_finding', 'review_existing'),
  claimId: idSchema, targetEntryId: nullable(idSchema), reason: text(1000) });
export const analysisSchema = object({ recommendation: text(12000), reasons: texts(),
  recommendationClaimIds: list(idSchema, 64), initiatives: list(initiativeSchema, 3, 2),
  claims: list(findingSchema, 100), calculations: list(object({ id: idSchema, claimId: idSchema, expression: expressionSchema }), 30),
  proposalDrafts: list(proposalDraftSchema, 50), unresolved: texts(), nextActions: list(actionSchema, 30) });
export const critiqueSchema = object({ issues: list(object({ claimId: nullable(idSchema), problem: text(2000),
  evidence: list(evidenceSchema, 20), requiredFix: text(2000), severity: choice('warning', 'error') }), 100),
  limitations: texts() });
// Editor can only select exact existing paragraphs/claim IDs. It cannot create prose or edit structured facts.
export const editSchema = object({ recommendationParagraphIndexes: list(number(0, 100, true), 100, 1),
  reasonIndexes: list(number(0, 29, true), 30), claimOrder: list(idSchema, 100) });
export type Brief = Infer<typeof briefSchema>;
export type Finding = Infer<typeof findingSchema>;
export type Analysis = Infer<typeof analysisSchema>;
export type Critique = Infer<typeof critiqueSchema>;
export type Initiative = Infer<typeof initiativeSchema>;
export type Action = Infer<typeof actionSchema>;
export type Expression = Infer<typeof expressionSchema>;
export type Edit = Infer<typeof editSchema>;
export interface SourceState { sourceId: string; sourceVersion: number;
  status: 'user_provided' | 'source_found' | 'content_retrieved' | 'unverifiable';
  access: 'ok' | 'snippet' | 'paywall' | 'error'; independentOrigin: string; supersedesVersion: number | null }
export interface ResearchSettings {
  criteria: { id: string; label: string }[];
  summaryWordLimit: number;
  asOf: string;
  staleAfterDays: number;
  budget: { maxModelCalls: number; maxCollectorCalls: number; maxFindings: number; maxStageChars: number; timeoutMs: number };
}
export const DEFAULT_BUDGET = Object.freeze({ maxModelCalls: 7, maxCollectorCalls: 3, maxFindings: 64, maxStageChars: 12000, timeoutMs: 150000 });
export interface ResearchInput {
  request: ResearchRequest;
  sources: Source[];
  fragments: (SourceFragment & { sourceVersion: number })[];
  sourceStates: SourceState[];
  reportFragmentIds: string[];
  settings: ResearchSettings;
  approvedInputSha256: string;
}
export interface Issue { code: string; severity: 'warning' | 'error'; claimId: string | null; detail: string }
type BaseRuntimeRequest = Parameters<RuntimePort['run']>[0];
export interface StageRequest extends BaseRuntimeRequest {
  research: { protocol: typeof STAGE_PROTOCOL; version: typeof RESEARCH_VERSION; stageId: string;
    isolation: 'fresh_context'; template: string; templateSha256: string; inputSha256: string;
    payload: unknown; outputSchema: JsonSchema };
}
/** Queue-owned adapter must explicitly opt in; a plain bootstrap RuntimePort is insufficient. */
export interface ResearchRuntimePort { protocol: typeof STAGE_PROTOCOL; run(request: StageRequest): Promise<unknown> }
export interface ResearchArtifact {
  researchVersion: typeof RESEARCH_VERSION; inputSha256: string; baseContext: ContextSnapshot;
  evidenceBundle: Pick<ResearchInput, 'sources' | 'fragments' | 'sourceStates'>;
  brief: Brief; claims: Finding[]; analysis: Analysis; critique: Critique;
  collections: Infer<typeof collectionSchema>[];
  result: ResearchResult; proposals: ChangeProposal[]; issues: Issue[]; nextActions: Action[];
  evidenceChecks: { claimId: string; ref: Infer<typeof evidenceSchema>; referenceValid: boolean;
    quoteMatches: boolean | null; semanticSupport: 'model_only_unverified' }[];
  duplicates: { canonicalId: string; duplicateId: string }[];
  stopReason: 'sufficient_model_assessment' | 'budget_exhausted' | 'no_search_questions' | 'no_sources';
  usage: { modelCalls: number; collectorCalls: number; findings: number };
  checks: { deterministic: 'passed' | 'issues_found'; model: 'performed_unverified'; userAcceptance: 'pending' };
}
