import type { ResearchArtifact } from './types.ts';
// Consumers must still render Markdown without raw HTML. Escape all imported/model text and URLs.
const esc = (s: string) => s.replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]!)).replace(/([\\`*_[\]{}()!#|])/g, '\\$1');
export function renderMarkdown(a: ResearchArtifact): string {
  const sections = [`# Предложение по исследованию`, esc(a.result.recommendation),
    ...a.result.reasons.map(r => `- ${esc(r)}`),
    `Проверка: ${a.result.verification}. Модельная оценка не подтверждает достоверность. Принятие пользователем: pending.`,
    `Остановка: ${a.stopReason}; вызовы: ${a.usage.modelCalls}; сбор: ${a.usage.collectorCalls}.`];
  // Risks and critical issues remain visible even when the summary is shortened.
  sections.push('## Ограничения и требуемые исправления', ...a.issues.map(i => `- ${esc(i.code)} (${i.severity}${i.claimId ? `, ${esc(i.claimId)}` : ''}): ${esc(i.detail)}`),
    ...a.critique.limitations.map(x => `- ${esc(x)}`), ...a.analysis.unresolved.map(x => `- ${esc(x)}`));
  sections.push(...a.collections.flatMap(c => c.gaps.map(x => `- Пробел сбора: ${esc(x)}`)));
  for (const i of a.analysis.initiatives) {
    sections.push(`## ${esc(i.id)}`, `Потребитель: ${esc(i.consumer)}. Плательщик: ${esc(i.payer)}. Решение принимает: ${esc(i.decisionMaker)}.`,
      `Задача: ${esc(i.jobToBeDone)}. Основания спроса: ${i.demandClaimIds.map(esc).join(', ')}.`,
      `Внутренняя проверка: ${esc(i.internalCheckScope)}. Найдено: ${i.internalAlternatives.map(esc).join('; ') || 'не найдено в проверенном объёме'}.`,
      `Неизвестно: ${i.internalUnknowns.map(esc).join('; ')}. Уточнить: ${i.internalContacts.map(esc).join('; ')}.`,
      `Альтернативы: ${i.marketAlternatives.map(x => `${esc(x.name)} (${x.type}): ${esc(x.scenario)}`).join('; ')}.`,
      `Цепочка ценности: ${Object.values(i.valueChain).map(esc).join(' → ')}.`,
      ...i.metrics.map(m => `- ${esc(m.name)} [${m.kind}, ${m.control}]: ${esc(m.formula)}; ${esc(m.unit)}; baseline: ${esc(m.baseline ?? 'неизвестен')}; ${esc(m.segment)}; ${esc(m.observationWindow)}; ${esc(m.measurementSource)}`),
      ...i.data.map(d => `- Данные ${esc(d.field)}: ${d.availability}; ${esc(d.quality)}; ${esc(d.coverage)}; ${esc(d.freshness)}; ${esc(d.access)}; permission: ${d.permission}; ${esc(d.limits)}`),
      `Монетизация (${i.monetization.status}): ${esc(i.monetization.paidFor)}; ${esc(i.monetization.billingUnit)}; ${esc(i.monetization.purchasePath)}; затраты: ${esc(i.monetization.costs)}.`,
      `MVP: ${esc(i.mvp.mainRisk)} → ${esc(i.mvp.experiment)}. Исключено: ${i.mvp.excludedFeatures.map(esc).join('; ')}.`,
      `Продолжить: ${i.mvp.continueCriteria.map(esc).join('; ')}. Изменить: ${i.mvp.changeCriteria.map(esc).join('; ')}. Остановить: ${i.mvp.stopCriteria.map(esc).join('; ')}. Пороги: ${i.mvp.thresholds}.`,
      ...i.risks.map(r => `- Риск: ${esc(r)}`), ...i.unknowns.map(r => `- Неизвестно: ${esc(r)}`));
  }
  sections.push('## Следующие действия', ...a.nextActions.map(x => `- ${x.kind}: ${esc(x.task)} → ${esc(x.expectedResult)}`),
    '<details><summary>Адресные доказательства и история</summary>', '');
  for (const c of a.claims) sections.push(`- ${esc(c.id)} [${c.kind}, ${c.support}]: ${esc(c.text)}; scope: ${esc(c.scope)}; альтернативные объяснения: ${c.alternativeExplanations.map(esc).join('; ') || 'не указаны'}`, ...c.evidence.map(e =>
    `  - source=${esc(e.sourceId)}; version=${e.sourceVersion}; chunk=${esc(e.fragmentId)}; semanticSupport=model_only_unverified`),
    c.quote === null ? '  - Дословная цитата не заявлена.' : `  - Заявленная цитата: ${esc(c.quote)}`);
  for (const s of a.evidenceBundle.sources) sections.push(`Источник ${esc(s.id)}, версия ${s.version}: ${esc(s.title)}; origin: ${esc(s.origin)}; published: ${esc(s.publishedAt ?? 'неизвестно')}; retrieved: ${esc(s.retrievedAt)}.`,
    ...a.evidenceBundle.fragments.filter(f => f.sourceId === s.id && f.sourceVersion === s.version).map(f =>
      `Фрагмент ${esc(f.id)}; locator: ${esc(JSON.stringify(f.location))}; sha256: ${f.sha256}\n\n${esc(f.text)}`));
  sections.push('', '</details>', '', `Предложения памяти: ${a.proposals.length}; ни одно не принято автоматически.`);
  return sections.join('\n\n');
}
