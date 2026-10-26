// Entirely fictional benchmark. No user/corporate documents or real market claims.
import { sha256, stableSourceId, stableFragmentId, inputDigest, settings, STAGE_PROTOCOL } from '../src/index.ts';

export function makeFixture(scenario = 'new_research') {
  const sourceId = stableSourceId('synthetic:moon-garden/report');
  const content = 'Вымышленный отчёт: садовник Луна тратит время на ручной учёт посадок. Спрос и экономический эффект ещё не проверены.';
  const location = { kind: 'text', start: 0, end: content.length };
  const fragmentId = stableFragmentId(sourceId, 1, location, content);
  const source = { id: sourceId, projectId: 'moon', origin: 'synthetic:moon-garden/report', title: 'Вымышленный отчёт',
    publishedAt: '2026-10-01T00:00:00.000Z', retrievedAt: '2026-10-26T00:00:00.000Z', version: 1, sha256: sha256(content), disclosure: 'codex_allowed' };
  const fragment = { id: fragmentId, projectId: 'moon', sourceId, sourceVersion: 1, location, sha256: sha256(content), text: content };
  const ref = { sourceId, fragmentId, sourceVersion: 1 };
  const decision = { id: 'accepted-decision', projectId: 'moon', kind: 'decision', verification: 'unverified',
    text: 'Не передавать персональные данные в пилот.', scope: 'Вымышленный пилот', evidence: [], disclosure: 'codex_allowed', version: 1 };
  const context = { schemaVersion: 1, projectId: 'moon', projectVersion: 3, createdAt: '2026-10-26T00:00:00.000Z',
    task: 'Сравнить журнал и помощник посадок.', decisions: [decision], constraints: ['Без персональных данных'], facts: [],
    sources: [source], gaps: ['Плательщик не определён'], nextActions: ['Поговорить с садовником'], excludedCount: 0,
    sha256: sha256('fictional-context-revision-3') };
  const input = { request: { schemaVersion: 1, projectId: 'moon', scenario, decision: 'Какой из двух пилотов проверять первым?',
    initiativeIds: ['journal', 'assistant'], context, approvedContextSha256: context.sha256 },
    sources: [source], fragments: [fragment], sourceStates: [{ sourceId, sourceVersion: 1, status: 'content_retrieved',
      access: 'ok', independentOrigin: 'moon-report', supersedesVersion: null }], reportFragmentIds: scenario === 'analyze_report' ? [fragmentId] : [],
    settings: settings({ criteria: [{ id: 'risk', label: 'Снизить риск неверного решения' }], asOf: '2026-10-26T00:00:00.000Z',
      budget: { maxStageChars: 120000 } }), approvedInputSha256: '' };
  input.approvedInputSha256 = inputDigest(input);
  const action = (id, initiativeId, kind = 'interview') => ({ id, initiativeId, kind,
    task: 'Уточнить процесс принятия решения у вымышленного садовника.', expectedResult: 'Назван плательщик и конкретная задача.' });
  const brief = { decision: input.request.decision, initiativeIds: input.request.initiativeIds, criteria: input.settings.criteria,
    constraints: context.constraints, proposedCriteria: [], questions: [action('find-report', 'journal', 'search'), action('payer-interview', 'assistant')],
    readinessCriteria: ['Понятно, какой риск проверяется первым'], stopConditions: ['Остановиться при исчерпании бюджета или достаточности'] };
  const claim = { id: 'manual-process', initiativeId: 'journal', kind: 'source_statement', text: 'Луна ведёт ручной учёт посадок.',
    scope: 'Один вымышленный садовник; не весь рынок', alternativeExplanations: ['Отчёт может быть неполным'],
    evidence: [ref], support: 'content_retrieved', quote: 'ручной учёт посадок', eventAt: null, numberBasis: 'none',
    independenceKey: 'moon-report', supersedesClaimIds: [] };
  const metric = (id, kind, control) => ({ id, name: 'Доля заполненных записей', kind, control, baseline: null,
    formula: 'filled / expected', unit: '1', segment: 'Участники вымышленного пилота', observationWindow: 'Одна неделя', measurementSource: 'Журнал пилота' });
  const initiative = id => ({ id, consumer: 'Вымышленный садовник', payer: 'Неизвестен — требуется интервью', decisionMaker: 'Неизвестен',
    jobToBeDone: 'Не терять записи о посадках', demandClaimIds: id === 'journal' ? [claim.id] : [], internalAlternatives: [],
    internalCheckScope: 'Проверен только предоставленный вымышленный отчёт', internalUnknowns: ['Внутренний инструмент неизвестен'], internalContacts: ['Владелец процесса'],
    marketAlternatives: [{ name: 'Бумажный журнал', type: 'manual', scenario: 'Учёт тех же посадок', claimIds: [] },
      { name: 'Свой журнал', type: 'build', scenario: 'Учёт тех же посадок', claimIds: [] }],
    valueChain: { dataOrModel: 'Записи посадок', use: 'Сверка журнала', changedAction: 'Дополнить пропуски', effect: 'Гипотеза: меньше пропусков', economicValue: 'Не измерена' },
    metrics: [metric('coverage', 'outcome', 'external'), metric('entries', 'leading', 'team'), metric('errors', 'counter', 'team')],
    data: [{ field: 'Запись посадки', availability: 'unknown', quality: 'Не проверено', coverage: 'Неизвестно', freshness: 'Неизвестна',
      access: 'Требует уточнения', permission: 'unknown', permissionEvidence: [], limits: 'Без персональных данных' }],
    monetization: { paidFor: 'Гипотеза: удобство учёта', billingUnit: 'Не определена', purchasePath: 'Не определён', costs: 'Не рассчитаны',
      status: 'hypothesis', claimIds: [], calculationIds: [] },
    mvp: { mainRisk: 'Неизвестна востребованность', experiment: 'Проверить ручной прототип в вымышленном пилоте', excludedFeatures: ['Автоматическая монетизация'],
      continueCriteria: ['Пользователь подтверждает задачу'], changeCriteria: ['Задача сформулирована иначе'], stopCriteria: ['Задача не подтверждается'], thresholds: 'none' },
    claimIds: id === 'journal' ? [claim.id] : [], risks: ['Внешняя применимость не установлена'], unknowns: ['Спрос и плательщик неизвестны'], nextActions: [action(`next-${id}`, id)] });
  const analysis = { recommendation: 'Начать с интервью и ручного журнала.\n\nВывод ограничен вымышленным отчётом; спрос и экономика не подтверждены.',
    reasons: ['Один отчёт описывает ручной процесс; это основание для проверки, а не доказательство рынка.'], recommendationClaimIds: [claim.id],
    initiatives: input.request.initiativeIds.map(initiative), claims: [claim], calculations: [],
    proposalDrafts: [{ id: 'add-process', kind: 'add_finding', claimId: claim.id, targetEntryId: null, reason: 'Сохранить непроверенную находку' }],
    unresolved: ['Нужно интервью о спросе'], nextActions: [action('follow-up', 'journal')] };
  const collection = { findings: [claim], gaps: ['Плательщик неизвестен'], nextActions: [action('next-collector', 'journal')],
    sufficientForDecision: true, sufficiencyReason: 'Достаточно для выбора следующего шага — интервью, не для рыночного вывода.' };
  const critique = { issues: [], limitations: ['Это синтетический ответ тестового адаптера; семантика реальной модели не проверена.'] };
  const edit = { recommendationParagraphIndexes: [0, 1], reasonIndexes: [0], claimOrder: [claim.id] };
  return Object.fromEntries(Object.entries({ input, brief, claim, collection, analysis, critique, edit, ref }).map(([k, v]) => [k, structuredClone(v)]));
}
export function approve(input) { input.approvedInputSha256 = inputDigest(input); return input; }
/** Scripted transport fixture only. It is not a semantic critic or a model substitute in acceptance. */
export class ScriptedQueue {
  protocol = STAGE_PROTOCOL;
  calls = [];
  constructor(fixture, change = {}) { this.fixture = fixture; this.change = change; }
  async run(request) {
    this.calls.push(request);
    const names = { planner: 'brief', researcher: 'collection', analyst: 'analysis', reviewer: 'critique', editor: 'edit' };
    const value = this.change[request.role] ? await this.change[request.role](request, this) : this.fixture[names[request.role]];
    return structuredClone(value);
  }
}
