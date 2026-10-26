import type { EvidenceRef } from '../../contracts/src/index.ts';
import { canonical, issue, key, unique } from './integrity.ts';
import { evaluateExpression } from './calculations.ts';
import { ResearchError } from './schema.ts';
import type { Analysis, Finding, ResearchInput, Issue, ResearchArtifact, Brief } from './types.ts';

export function checkBrief(brief: Brief, input: ResearchInput): void {
  const fixed = { decision: input.request.decision, initiativeIds: input.request.initiativeIds,
    criteria: input.settings.criteria, constraints: input.request.context.constraints };
  for (const name of Object.keys(fixed) as (keyof typeof fixed)[]) {
    if (canonical(brief[name]) !== canonical(fixed[name])) throw new ResearchError('USER_FRAMING_CHANGED', `$.${name}`);
  }
  unique(brief.questions.map(q => q.id));
  if (brief.questions.some(q => !input.request.initiativeIds.includes(q.initiativeId))) throw new ResearchError('INITIATIVE_MISMATCH');
  if (!brief.readinessCriteria.length || !brief.stopConditions.length) throw new ResearchError('BRIEF_STOP_RULES_REQUIRED');
}
export function checkEvidence(claims: Finding[], input: ResearchInput): { issues: Issue[]; checks: ResearchArtifact['evidenceChecks'] } {
  const issues: Issue[] = [], checks: ResearchArtifact['evidenceChecks'] = [];
  const sources = new Map(input.sources.map(x => [key(x.id, x.version), x]));
  const fragments = new Map(input.fragments.map(x => [x.id, x]));
  const states = new Map(input.sourceStates.map(x => [key(x.sourceId, x.sourceVersion), x]));
  const ids = new Set([...claims.map(x => x.id), ...input.request.context.facts.map(x => x.id), ...input.request.context.decisions.map(x => x.id)]);
  for (const c of claims) {
    let usable = 0, quoteMatched = false;
    const origins = new Set<string>(), fingerprints = new Set<string>();
    for (const ref of c.evidence) {
      const s = sources.get(key(ref.sourceId, ref.sourceVersion)), f = fragments.get(ref.fragmentId), st = states.get(key(ref.sourceId, ref.sourceVersion));
      const valid = !!s && !!f && f.sourceId === ref.sourceId && f.sourceVersion === ref.sourceVersion && st?.access === 'ok' &&
        ['user_provided', 'content_retrieved'].includes(st.status);
      const quoteMatches = c.quote === null ? null : !!valid && !!f?.text.includes(c.quote);
      checks.push({ claimId: c.id, ref, referenceValid: valid, quoteMatches, semanticSupport: 'model_only_unverified' });
      if (!valid) issues.push(issue('INVALID_EVIDENCE_REFERENCE', 'Нужен полученный фрагмент указанной версии с адресным локатором; сниппета недостаточно.', c.id));
      else {
        usable++; quoteMatched ||= !!quoteMatches;
        if (origins.has(st!.independentOrigin) || fingerprints.has(s!.sha256)) issues.push(issue('NON_INDEPENDENT_SOURCES', 'Перепечатки или одинаковое содержимое не дают независимого подтверждения.', c.id, 'warning'));
        origins.add(st!.independentOrigin); fingerprints.add(s!.sha256);
        if (s!.publishedAt === null) issues.push(issue('UNKNOWN_PUBLICATION_DATE', 'Дата публикации неизвестна; дата получения её не заменяет.', c.id, 'warning'));
        if (s!.publishedAt && Date.parse(input.settings.asOf) - Date.parse(s!.publishedAt) > input.settings.staleAfterDays * 86400000)
          issues.push(issue('STALE_SOURCE', 'Источник старше заданного окна; применимость требует проверки.', c.id, 'warning'));
        if (input.sourceStates.some(x => x.sourceId === s!.id && x.supersedesVersion === s!.version))
          issues.push(issue('SUPERSEDED_SOURCE', 'Есть новая версия источника: прежний вывод сохранён и требует пересмотра.', c.id, 'warning'));
      }
    }
    if (c.quote !== null && !quoteMatched) issues.push(issue('QUOTE_NOT_FOUND', 'Цитата не найдена дословно в доступных фрагментах.', c.id));
    if (c.kind === 'source_statement' && !usable) issues.push(issue('EMPIRICAL_SUPPORT_MISSING', 'Эмпирическое утверждение не имеет доступного адресного основания.', c.id));
    if (c.eventAt !== null && (!/^\d{4}-\d{2}-\d{2}T/.test(c.eventAt) || !Number.isFinite(Date.parse(c.eventAt))))
      issues.push(issue('INVALID_EVENT_DATE', 'Дата события должна быть явной ISO-датой; публикация и получение не заменяют событие.', c.id));
    if (c.support === 'support_checked') issues.push(issue('SEMANTIC_SUPPORT_UNVERIFIED', 'Поддержка заявлена моделью; независимая человеческая проверка не выполнена.', c.id, 'warning'));
    if (c.support === 'contradicts') issues.push(issue('CONTRADICTING_EVIDENCE', 'Указано противоречие; его нельзя скрыть в рекомендации.', c.id));
    if (c.support === 'unverifiable') issues.push(issue('UNVERIFIABLE_CLAIM', 'Проверить утверждение по доступным материалам невозможно.', c.id, 'warning'));
    if (/\d/.test(c.text) && c.kind !== 'user_statement' &&
      (c.numberBasis === 'none' || (c.numberBasis === 'cited' && !usable)))
      issues.push(issue('UNSUPPORTED_NUMBER', 'Числу нужно основание, явно помеченное допущение или проверяемый расчёт.', c.id));
    if (/\b\d+(?:[.,]\d+)?\s*%/.test(c.text) && /уверенност|вероятност.*истин|confidence/i.test(c.text))
      issues.push(issue('UNCALIBRATED_CONFIDENCE', 'Процент уверенности не поддержан калиброванной методикой.', c.id));
    if (/аналогов\s+нет|не\s+существу[ею]т|no\s+(?:internal\s+)?alternatives/i.test(c.text))
      issues.push(issue('ABSENCE_NOT_PROVEN', 'Отсутствие находки не доказывает отсутствие решения.', c.id));
    if (c.supersedesClaimIds.length) {
      if (c.supersedesClaimIds.some(id => !ids.has(id) || id === c.id)) issues.push(issue('INVALID_SUPERSESSION_REFERENCE', 'Отменяемый вывод отсутствует или ссылается на себя.', c.id));
      issues.push(issue('HISTORICAL_CONCLUSION_REVIEW', 'Новый вывод предложен для пересмотра; старый остаётся в истории до принятия пользователем.', c.id, 'warning'));
    }
    if (!input.request.initiativeIds.includes(c.initiativeId)) issues.push(issue('INITIATIVE_MISMATCH', 'Утверждение относится к неизвестной инициативе.', c.id));
    if (c.kind === 'inference' && !c.alternativeExplanations.length) issues.push(issue('ALTERNATIVE_EXPLANATIONS_MISSING', 'Выводу нужны альтернативные объяснения.', c.id, 'warning'));
    if (c.kind === 'calculation' && /доказ.*причин|causal proof/i.test(c.text)) issues.push(issue('CALCULATION_NOT_CAUSAL_PROOF', 'Расчёт не устанавливает причинность.', c.id));
  }
  return { issues, checks };
}
export function checkAnalysis(analysis: Analysis, collected: Finding[], input: ResearchInput): Issue[] {
  unique(analysis.claims.map(x => x.id)); unique(analysis.initiatives.map(x => x.id)); unique(analysis.calculations.map(x => x.id));
  unique(analysis.proposalDrafts.map(x => x.id));
  if (canonical(analysis.initiatives.map(x => x.id).sort()) !== canonical([...input.request.initiativeIds].sort())) throw new ResearchError('INITIATIVE_MISMATCH');
  const issues: Issue[] = [];
  const known = new Map(collected.map(x => [x.id, x])); const claims = new Map(analysis.claims.map(x => [x.id, x]));
  for (const c of collected) if (!claims.has(c.id)) throw new ResearchError('COLLECTED_CLAIM_DROPPED');
  for (const c of analysis.claims) {
    const old = known.get(c.id);
    if (old && canonical(old) !== canonical(c)) throw new ResearchError('COLLECTED_CLAIM_CHANGED');
    if (!old && ['source_statement', 'user_statement', 'decision'].includes(c.kind)) throw new ResearchError('UNREGISTERED_EMPIRICAL_CLAIM');
    if ([...input.request.context.facts, ...input.request.context.decisions].some(x => x.id === c.id))
      issues.push(issue('CLAIM_ID_COLLIDES_WITH_MEMORY', 'Новое утверждение должно иметь отдельный ID, сохраняя старую запись.', c.id));
  }
  for (const action of [...analysis.nextActions, ...analysis.initiatives.flatMap(i => i.nextActions)])
    if (!input.request.initiativeIds.includes(action.initiativeId)) issues.push(issue('ACTION_INITIATIVE_MISMATCH', 'Следующее действие относится к неизвестной инициативе.'));
  function refs(ids: string[], owner: string) { for (const id of ids) if (!claims.has(id)) issues.push(issue('UNKNOWN_CLAIM_REFERENCE', `Неизвестное утверждение в ${owner}.`, id)); }
  refs(analysis.recommendationClaimIds, 'recommendation');
  if (!analysis.recommendationClaimIds.length) issues.push(issue('RECOMMENDATION_SUPPORT_MISSING', 'У рекомендации отсутствуют связанные утверждения.'));
  for (const i of analysis.initiatives) {
    refs(i.claimIds, i.id); refs(i.demandClaimIds, i.id); refs(i.monetization.claimIds, i.id);
    for (const alt of i.marketAlternatives) refs(alt.claimIds, i.id);
    for (const id of i.claimIds) if (claims.has(id) && claims.get(id)!.initiativeId !== i.id) issues.push(issue('CROSS_INITIATIVE_CLAIM', 'Утверждение связано с другой инициативой.', id));
    const missing: string[] = [];
    if (!i.metrics.some(m => m.kind === 'outcome')) missing.push('outcome metric');
    if (!i.metrics.some(m => m.kind === 'leading')) missing.push('leading metric');
    if (!i.metrics.some(m => m.kind === 'counter')) missing.push('counter metric');
    if (!i.data.length) missing.push('data');
    if (!i.marketAlternatives.some(x => x.type === 'manual')) missing.push('manual alternative');
    if (!i.marketAlternatives.some(x => x.type === 'build')) missing.push('build alternative');
    if (!i.mvp.continueCriteria.length || !i.mvp.changeCriteria.length || !i.mvp.stopCriteria.length) missing.push('MVP stop rules');
    if (!i.nextActions.length) missing.push('next action');
    if (missing.length) issues.push(issue('REQUIRED_BLOCK_MISSING', `${i.id}: ${missing.join(', ')}.`));
    if (!i.internalAlternatives.length) issues.push(issue('INTERNAL_ALTERNATIVES_UNKNOWN', `${i.id}: аналог не найден в указанном объёме проверки; нужно внутреннее уточнение.`, null, 'warning'));
    for (const m of i.metrics) if (m.baseline === null) issues.push(issue('BASELINE_UNKNOWN', `${i.id}/${m.id}: baseline неизвестен.`, null, 'warning'));
    if (i.mvp.thresholds === 'user_agreed') issues.push(issue('THRESHOLDS_REQUIRE_USER_ACCEPTANCE', `${i.id}: согласование численных порогов не доказано входным контрактом.`));
    if (i.monetization.status === 'evidenced' && !i.monetization.claimIds.length) issues.push(issue('MONETIZATION_UNSUPPORTED', `${i.id}: тариф и прогноз требуют подтверждения.`));
    for (const d of i.data) if (d.permission === 'confirmed') {
      const probe: Finding = { id: `permission:${i.id}`, initiativeId: i.id, kind: 'source_statement', text: d.field, scope: d.limits,
        evidence: d.permissionEvidence, support: 'content_retrieved', quote: null, eventAt: null, numberBasis: 'none',
        alternativeExplanations: [], independenceKey: null, supersedesClaimIds: [] };
      if (!d.permissionEvidence.length || checkEvidence([probe], input).issues.some(x => x.severity === 'error'))
        issues.push(issue('DATA_PERMISSION_UNSUPPORTED', `${i.id}: разрешённость использования не подтверждена.`));
      // Even a valid reference is not a legal permission check.
      issues.push(issue('DATA_PERMISSION_REQUIRES_REVIEW', `${i.id}: смысл разрешения и его границы проверяет пользователь.`, null, 'warning'));
    }
    for (const id of i.monetization.calculationIds) if (!analysis.calculations.some(x => x.id === id)) issues.push(issue('UNKNOWN_CALCULATION', `${i.id}: расчёт отсутствует.`));
  }
  const calculatedClaims = new Set<string>();
  for (const calculation of analysis.calculations) {
    if (!claims.has(calculation.claimId) || claims.get(calculation.claimId)!.kind !== 'calculation') issues.push(issue('CALCULATION_CLAIM_MISMATCH', 'Расчёт должен ссылаться на утверждение calculation.', calculation.claimId));
    calculatedClaims.add(calculation.claimId);
    try { evaluateExpression(calculation.expression); } catch (e) { if (!(e instanceof ResearchError)) throw e; issues.push(issue(e.code, 'Проверка формулы, результата или единиц не пройдена.', calculation.claimId)); }
  }
  for (const c of analysis.claims) if ((c.kind === 'calculation' || c.numberBasis === 'calculation') && !calculatedClaims.has(c.id))
    issues.push(issue('CALCULATION_MISSING', 'Нет исполняемой формулы для заявленного расчёта.', c.id));
  for (const p of analysis.proposalDrafts) {
    refs([p.claimId], 'proposal');
    if (p.kind === 'review_existing' && !input.request.context.facts.concat(input.request.context.decisions).some(x => x.id === p.targetEntryId))
      issues.push(issue('PROPOSAL_TARGET_MISSING', 'Запись для пересмотра отсутствует во входном снимке.', p.claimId));
    if (p.kind === 'add_finding' && p.targetEntryId !== null) issues.push(issue('PROPOSAL_TARGET_INVALID', 'Добавление не заменяет существующую запись.', p.claimId));
  }
  return issues;
}
export function referenceExists(ref: EvidenceRef, input: ResearchInput): boolean {
  return input.fragments.some(f => f.id === ref.fragmentId && f.sourceId === ref.sourceId && f.sourceVersion === ref.sourceVersion);
}
