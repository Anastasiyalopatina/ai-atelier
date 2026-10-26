import type { ResearchResult } from '../../contracts/src/index.ts';
import { ResearchError, type Schema } from './schema.ts';
import { inputDigest, validateInput, canonical, deduplicate, issue, sha256, unique } from './integrity.ts';
import { checkBrief, checkAnalysis, checkEvidence, referenceExists } from './checks.ts';
import { evaluateExpression } from './calculations.ts';
import { proposalsFor } from './proposals.ts';
import { roleTemplate } from './templates.ts';
import { RESEARCH_VERSION, STAGE_PROTOCOL, briefSchema, collectionSchema, analysisSchema, critiqueSchema, editSchema,
  type ResearchInput, type ResearchRuntimePort, type StageRequest, type ResearchArtifact, type Analysis, type Finding, type Issue, type Edit } from './types.ts';
export * from './types.ts';
export { ResearchError } from './schema.ts';
export { inputDigest, validateInput, settings, sha256, stableSourceId, stableFragmentId } from './integrity.ts';
export { checkEvidence, checkAnalysis } from './checks.ts';
export { evaluateExpression } from './calculations.ts';
export { rebaseProposals } from './proposals.ts';
export { roleTemplate } from './templates.ts';
export { renderMarkdown } from './render.ts';

function freeze<T>(v: T): T { if (v && typeof v === 'object' && !(v instanceof AbortSignal)) { Object.freeze(v); for (const child of Object.values(v)) freeze(child); } return v; }
const wordCount = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;
export function applyEdit(analysis: Analysis, edit: Edit, limit: number): { analysis: Analysis; issues: Issue[] } {
  unique(edit.recommendationParagraphIndexes.map(String)); unique(edit.reasonIndexes.map(String)); unique(edit.claimOrder);
  const paragraphs = analysis.recommendation.split(/\n\s*\n/).filter(x => x.trim());
  if (edit.recommendationParagraphIndexes.some(i => i >= paragraphs.length) || edit.reasonIndexes.some(i => i >= analysis.reasons.length) ||
    canonical([...edit.claimOrder].sort()) !== canonical(analysis.claims.map(x => x.id).sort())) throw new ResearchError('INVALID_EDITOR_SELECTION');
  const result = structuredClone(analysis);
  result.recommendation = edit.recommendationParagraphIndexes.map(i => paragraphs[i]).join('\n\n');
  result.reasons = edit.reasonIndexes.map(i => analysis.reasons[i]);
  const claims = new Map(analysis.claims.map(x => [x.id, x])); result.claims = edit.claimOrder.map(id => structuredClone(claims.get(id)!));
  const issues: Issue[] = [];
  if (wordCount(`${result.recommendation} ${result.reasons.join(' ')}`) > limit)
    throw new ResearchError('SUMMARY_LIMIT_EXCEEDED');
  // Removed prose is kept in analysis history and surfaced as a warning; full risk/unknown blocks are never edited.
  if (edit.recommendationParagraphIndexes.length < paragraphs.length || edit.reasonIndexes.length < analysis.reasons.length)
    issues.push(issue('EDITOR_OMISSIONS_REQUIRE_REVIEW', 'Удалённые абзацы сохранены в исходном анализе; нужно проверить, что оговорки не скрыты.', null, 'warning'));
  return { analysis: result, issues };
}
function toResult(analysis: Analysis, proposals: ResearchArtifact['proposals'], issues: Issue[]): ResearchResult {
  return { schemaVersion: 1, recommendation: analysis.recommendation, reasons: analysis.reasons,
    initiatives: analysis.initiatives.map(i => {
      const claimIds = new Set(i.claimIds); const evidence = analysis.claims.filter(c => claimIds.has(c.id)).flatMap(c => c.evidence);
      const calc = analysis.calculations.find(c => i.monetization.calculationIds.includes(c.id));
      let formula = 'Не рассчитано'; let inputs: Record<string, number> = {}; let assumptions = ['Экономика не подтверждена; требуется расчёт.'];
      if (calc) { try { formula = evaluateExpression(calc.expression).displayFormula;
        inputs = Object.fromEntries(calc.expression.inputs.map(x => [x.name, x.quantity.value])); assumptions = calc.expression.assumptions;
      } catch { assumptions = ['Проверка расчёта не пройдена; не использовать численный прогноз.']; } }
      return { id: i.id, consumer: i.consumer, payer: i.payer, internalAlternatives: i.internalAlternatives, internalCheckScope: i.internalCheckScope,
        marketAlternatives: i.marketAlternatives.map(x => `${x.name}: ${x.scenario}`), valueMechanism: Object.values(i.valueChain).join(' → '),
        metrics: i.metrics.filter(x => x.kind !== 'counter').map(x => `${x.name}: ${x.formula}; ${x.unit}; baseline ${x.baseline ?? 'неизвестен'}; ${x.segment}; ${x.observationWindow}; ${x.measurementSource}; control=${x.control}`),
        counterMetrics: i.metrics.filter(x => x.kind === 'counter').map(x => `${x.name}: ${x.formula}; ${x.unit}; baseline ${x.baseline ?? 'неизвестен'}; ${x.segment}; ${x.observationWindow}; ${x.measurementSource}`),
        dataQualityAndUsageLimits: i.data.map(x => `${x.field}: ${x.availability}; ${x.quality}; ${x.coverage}; ${x.freshness}; ${x.access}; permission=${x.permission}; ${x.limits}`).join('\n') || 'Данные неизвестны',
        economics: { formula, inputs, assumptions }, mvpExperiment: i.mvp.experiment, continueCriteria: i.mvp.continueCriteria,
        changeCriteria: i.mvp.changeCriteria, stopCriteria: i.mvp.stopCriteria, risks: i.risks, unknowns: i.unknowns,
        nextActions: i.nextActions.map(x => `${x.kind}: ${x.task} → ${x.expectedResult}`), evidence: [...new Map(evidence.map(e => [canonical(e), e])).values()] };
    }), verification: issues.some(x => x.code === 'CONTRADICTING_EVIDENCE') ? 'disputed' : issues.some(x => x.severity === 'error') ? 'needs_review' : 'unverified',
    proposedChanges: proposals };
}

/** Pure orchestration over a queue-owned adapter. No network, Codex process, files, memory writes or automatic retries. */
export async function research(raw: ResearchInput, runtime: ResearchRuntimePort, options: { signal?: AbortSignal } = {}): Promise<ResearchArtifact> {
  const input = freeze(validateInput(raw));
  if (runtime?.protocol !== STAGE_PROTOCOL || typeof runtime.run !== 'function') throw new ResearchError('RESEARCH_ADAPTER_REQUIRED');
  const usage = { modelCalls: 0, collectorCalls: 0, findings: 0 }; const budget = input.settings.budget;
  const issues: Issue[] = [];
  async function stage<T>(role: StageRequest['role'], payload: unknown, schema: Schema<T>): Promise<T> {
    if (options.signal?.aborted) throw new ResearchError('CANCELLED');
    if (usage.modelCalls >= budget.maxModelCalls) throw new ResearchError('MODEL_BUDGET_EXHAUSTED');
    const template = roleTemplate(role);
    const research = { protocol: STAGE_PROTOCOL, version: RESEARCH_VERSION,
      stageId: sha256(`${input.approvedInputSha256}:${usage.modelCalls}:${role}`).slice(0, 32),
      isolation: 'fresh_context' as const, template: template.text, templateSha256: template.sha256,
      inputSha256: input.approvedInputSha256, payload, outputSchema: schema.json };
    const envelope = { approvedContextSha256: input.request.approvedContextSha256, context: input.request.context, role, research };
    if (canonical(envelope).length > budget.maxStageChars) throw new ResearchError('CONTEXT_BUDGET_EXCEEDED');
    usage.modelCalls++;
    const timeout = AbortSignal.timeout(budget.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let listener: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      listener = () => reject(new ResearchError(options.signal?.aborted ? 'CANCELLED' : 'MODEL_TIMEOUT'));
      signal.addEventListener('abort', listener, { once: true });
      if (signal.aborted) listener();
    });
    try {
      const value = await Promise.race([runtime.run(freeze({ ...envelope, signal })), aborted]);
      const result = schema.read(value);
      if (canonical(result).length > 120000) throw new ResearchError('OUTPUT_BUDGET_EXCEEDED');
      return result;
    } catch (e) {
      if (e instanceof ResearchError) throw e;
      // Never propagate arbitrary source text, credentials or runtime stack traces through a model error.
      const code = e instanceof Error && ['AUTH_REQUIRED', 'USAGE_LIMIT_REACHED', 'NETWORK_UNAVAILABLE', 'PAID_CONTINUATION_UNVERIFIED', 'CANCELLED', 'MODEL_TIMEOUT'].includes(e.message)
        ? e.message : 'RUNTIME_FAILED';
      throw new ResearchError(code);
    } finally { if (listener) signal.removeEventListener('abort', listener); }
  }
  const sourcePayload = { originalRequest: input.request, settings: input.settings, sources: input.sources,
    fragments: input.fragments, sourceStates: input.sourceStates, reportFragmentIds: input.reportFragmentIds };
  const brief = await stage('planner', sourcePayload, briefSchema); checkBrief(brief, input);
  let stopReason: ResearchArtifact['stopReason'] = input.sources.length ? 'no_search_questions' : 'no_sources';
  const findings: Finding[] = []; const collections: ResearchArtifact['collections'] = [];
  const collectedGaps: string[] = []; const actions = [...brief.questions];
  let searchQuestions = brief.questions.filter(q => q.kind === 'search');
  if (input.request.scenario === 'analyze_report') searchQuestions = [{ id: 'report-extraction', initiativeId: input.request.initiativeIds[0], kind: 'search',
    task: 'Извлечь утверждения и пробелы из предоставленного отчёта, сохранив типы и историю.', expectedResult: 'Структурированные находки и точечные вопросы.' }, ...searchQuestions];
  const collectorLimit = Math.min(budget.maxCollectorCalls, budget.maxModelCalls - 4);
  if (input.request.scenario === 'analyze_report' && collectorLimit < 1) throw new ResearchError('COLLECTOR_BUDGET_REQUIRED');
  for (const question of searchQuestions) {
    if (!input.fragments.length) { stopReason = 'no_sources'; break; }
    if (usage.collectorCalls >= collectorLimit || findings.length >= budget.maxFindings) { stopReason = 'budget_exhausted'; break; }
    const batch = await stage('researcher', { ...sourcePayload, brief, question, collectedClaimIds: findings.map(c => c.id),
      remainingFindings: budget.maxFindings - findings.length }, collectionSchema);
    usage.collectorCalls++;
    if (batch.findings.length + findings.length > budget.maxFindings) throw new ResearchError('FINDING_BUDGET_EXHAUSTED');
    collections.push(batch); findings.push(...batch.findings); collectedGaps.push(...batch.gaps); actions.push(...batch.nextActions);
    if (batch.sufficientForDecision) { stopReason = 'sufficient_model_assessment'; break; }
    stopReason = 'budget_exhausted';
  }
  const deduped = deduplicate(findings); usage.findings = deduped.claims.length;
  issues.push(...checkEvidence(deduped.claims, input).issues);
  const analysis = await stage('analyst', { ...sourcePayload, brief, collectedClaims: deduped.claims,
    gaps: collectedGaps, duplicates: deduped.duplicates, stopReason }, analysisSchema);
  issues.push(...checkAnalysis(analysis, deduped.claims, input));
  const evidence = checkEvidence(analysis.claims, input); issues.push(...evidence.issues);
  // Reviewer gets original sources + assignment + artifact. No prior role conversation or self-approval.
  const critique = await stage('reviewer', { ...sourcePayload, brief, analysis }, critiqueSchema);
  for (const c of critique.issues) {
    if (c.claimId !== null && !analysis.claims.some(x => x.id === c.claimId)) throw new ResearchError('CRITIC_UNKNOWN_CLAIM');
    if (c.evidence.some(ref => !referenceExists(ref, input))) throw new ResearchError('CRITIC_INVALID_REFERENCE');
    issues.push(issue('MODEL_CRITIQUE', `${c.problem} Исправление: ${c.requiredFix}`, c.claimId, c.severity));
  }
  const edit = await stage('editor', { analysis, critique, summaryWordLimit: input.settings.summaryWordLimit }, editSchema);
  const edited = applyEdit(analysis, edit, input.settings.summaryWordLimit); issues.push(...edited.issues);
  // Re-run integrity after edit. Structured blocks and claims are copied unchanged; this is not semantic validation.
  issues.push(...checkAnalysis(edited.analysis, deduped.claims, input));
  if (input.approvedInputSha256 !== inputDigest(input)) throw new ResearchError('STALE_INPUT');
  const finalIssues = [...new Map(issues.map(i => [canonical(i), i])).values()];
  const proposals = proposalsFor(edited.analysis, input, finalIssues);
  const result = toResult(edited.analysis, proposals, finalIssues);
  return { researchVersion: RESEARCH_VERSION, inputSha256: input.approvedInputSha256, baseContext: structuredClone(input.request.context),
    evidenceBundle: structuredClone({ sources: input.sources, fragments: input.fragments, sourceStates: input.sourceStates }),
    brief, collections, claims: edited.analysis.claims, analysis, critique, result, proposals, issues: finalIssues,
    nextActions: [...new Map([...actions, ...analysis.nextActions, ...analysis.initiatives.flatMap(i => i.nextActions)].map(a => [canonical(a), a])).values()],
    evidenceChecks: evidence.checks, duplicates: deduped.duplicates, stopReason, usage,
    checks: { deterministic: finalIssues.length ? 'issues_found' : 'passed', model: 'performed_unverified', userAcceptance: 'pending' } };
}
