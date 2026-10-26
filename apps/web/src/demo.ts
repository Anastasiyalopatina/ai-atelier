import type { KnowledgeEntry, ResearchResult, Source, Task } from '../../../packages/contracts/src/index.ts';
import type { DemoWorkspace } from './state.ts';

// Entirely fictional fixtures. Never used as a fallback for a failed request.
export const DEMO_PROJECT_ID = 'demo-garden';
export const DEMO_DATE = '2026-10-26T09:30:00.000Z';
const projectId = DEMO_PROJECT_ID;
const sources: Source[] = [
  { id: 'demo-interviews', projectId, title: 'Разговоры с соседями', origin: 'Вымышленные заметки · текст',
    publishedAt: '2026-10-23T08:00:00Z', retrievedAt: DEMO_DATE, version: 2, sha256: '2d46ad6d9ae8440db4f72c056ab5fcbb9e1b515a29364dd716972bf5d95fa0e6', disclosure: 'codex_allowed' },
  { id: 'demo-plan', projectId, title: 'План пробного дня', origin: 'Вымышленный документ · текст',
    publishedAt: '2026-10-24T08:00:00Z', retrievedAt: DEMO_DATE, version: 1, sha256: 'f714675c6b88d429659a2dd1c90056d68c125ecd5be26f03ce022be25f570eac', disclosure: 'codex_allowed' },
  { id: 'demo-private', projectId, title: 'Личные рабочие заметки', origin: 'Вымышленный локальный текст',
    publishedAt: null, retrievedAt: DEMO_DATE, version: 1, sha256: '31f8ba64ee47c694de6d79ae9bdaeb705985439717b79e7fb4545b934a3987b6', disclosure: 'local_only' },
];
const entries: KnowledgeEntry[] = [
  { id: 'demo-e1', projectId, kind: 'source_statement', verification: 'needs_review', text: 'Соседям интересен формат коротких встреч по выходным.',
    scope: 'Первичные интервью, без оценки всего района', evidence: [{ sourceId: 'demo-interviews', fragmentId: 'demo-f1', sourceVersion: 1 }], disclosure: 'codex_allowed', version: 1 },
  { id: 'demo-e2', projectId, kind: 'hypothesis', verification: 'unverified', text: 'Совместный уход за садом поможет соседям возвращаться каждую неделю.',
    scope: 'Нужно проверить на одном пробном дне', evidence: [{ sourceId: 'demo-plan', fragmentId: 'demo-f3', sourceVersion: 1 }], disclosure: 'codex_allowed', version: 1 },
  { id: 'demo-e3', projectId, kind: 'decision', verification: 'unverified', text: 'Начать с одного пробного дня, без покупки постоянного оборудования.',
    scope: 'Принято пользователем для вымышленного проекта', evidence: [{ sourceId: 'demo-plan', fragmentId: 'demo-f3', sourceVersion: 1 }], disclosure: 'codex_allowed', version: 1 },
  { id: 'demo-e4', projectId, kind: 'calculation', verification: 'unverified', text: 'Для пробного дня потребуется 12 саженцев: 7 + 5.',
    scope: 'Демонстрационный расчёт', evidence: [], disclosure: 'codex_allowed', version: 1,
    calculation: { formula: '7 + 5 = 12', inputs: { firstGroup: 7, secondGroup: 5 }, units: 'саженцы', assumptions: ['Две группы не пересекаются.'] } },
  { id: 'demo-e5', projectId, kind: 'user_statement', verification: 'unknown', text: 'Вымышленная личная заметка: обсудить собственное участие отдельно.',
    scope: 'Только локально', evidence: [{ sourceId: 'demo-private', fragmentId: 'demo-f4', sourceVersion: 1 }], disclosure: 'local_only', version: 1 },
];
export function initialDemo(): DemoWorkspace[] {
  return [{ project: { id: projectId, name: 'Лунный сад', goal: 'Понять, как небольшой городской сад может объединить соседей — и стоит ли запускать регулярные встречи.',
    constraints: ['Сначала проверить спрос, затем вкладываться.', 'Один пробный день, без постоянного оборудования.'],
    version: 3, createdAt: '2026-10-20T08:00:00Z' }, archived: false, sources: structuredClone(sources), entries: structuredClone(entries),
    fragments: [
      { id: 'demo-f1', projectId, sourceId: 'demo-interviews', sourceVersion: 1, location: { kind: 'text', start: 0, end: 124 }, sha256: '2160ca694fd760a19497e51ea3835062adb5f68bb6e085c368a1e8924fe25aa4',
        text: 'Трое из пяти вымышленных собеседников предложили попробовать короткую встречу в выходной. Регулярность участия не обсуждали.' },
      { id: 'demo-f2', projectId, sourceId: 'demo-interviews', sourceVersion: 2, location: { kind: 'text', start: 0, end: 133 }, sha256: '2d46ad6d9ae8440db4f72c056ab5fcbb9e1b515a29364dd716972bf5d95fa0e6',
        text: 'После уточнения двое из пяти готовы прийти один раз. Ещё трое пока не определились. Готовность возвращаться каждую неделю неизвестна.' },
      { id: 'demo-f3', projectId, sourceId: 'demo-plan', sourceVersion: 1, location: { kind: 'text', start: 0, end: 150 }, sha256: 'f714675c6b88d429659a2dd1c90056d68c125ecd5be26f03ce022be25f570eac',
        text: 'Провести один пробный день в саду. Заранее пригласить пять соседей, собрать обратную связь и спросить о следующем визите. Оборудование взять на время.' },
      { id: 'demo-f4', projectId, sourceId: 'demo-private', sourceVersion: 1, location: { kind: 'text', start: 0, end: 68 }, sha256: '31f8ba64ee47c694de6d79ae9bdaeb705985439717b79e7fb4545b934a3987b6',
        text: 'Вымышленная личная заметка. Исключить из передачи контекста и Codex.' },
    ], proposals: [
      { id: 'demo-p1', projectId, baseVersion: 3, status: 'pending', changes: [{ path: '/knowledge/demo-e1/text', before: entries[0].text,
        after: 'Трое из пяти вымышленных собеседников предложили разовую встречу. Регулярный интерес в этой версии заметок не проверялся.' }] },
      { id: 'demo-p2', projectId, baseVersion: 2, status: 'conflict', changes: [{ path: '/knowledge/demo-e2/text', before: 'Соседи будут регулярно участвовать.',
        after: 'Повторное участие — гипотеза. Проверить готовность вернуться после пробного дня.' }] },
    ], history: [{ id: 'demo-h1', at: DEMO_DATE, description: 'Добавлена версия 2 заметок. Связанный вывод требует пересмотра.' }],
    sourceIssues: {}, internetAllowed: { 'demo-interviews': false, 'demo-plan': false, 'demo-private': false } },
    { project: { id: 'demo-shelf', name: 'Тихая полка — соседская библиотека и обмен книгами во дворе',
      goal: 'Проверить интерес к соседскому обмену книгами.', constraints: ['Без аренды помещения.'], version: 1, createdAt: DEMO_DATE },
      archived: false, entries: [], sources: [], fragments: [], proposals: [], history: [], sourceIssues: {}, internetAllowed: {} },
  ];
}

export const demoResearch: ResearchResult = {
  schemaVersion: 1, recommendation: 'Провести один пробный день. Регулярные встречи пока не запускать.',
  reasons: ['Есть первичный интерес к разовому участию, но не к регулярному формату.', 'Пробный день даст обратную связь без покупки оборудования.'],
  verification: 'unverified', proposedChanges: [],
  initiatives: [
    { id: 'demo-i1', consumer: 'Соседи, которым интересно попробовать садоводство', payer: 'Организатор пробного дня; бюджет не согласован',
      internalAlternatives: ['Разовая встреча без посадок'], internalCheckScope: 'Только вымышленные заметки пяти разговоров. Поиска внутри организации не было.',
      marketAlternatives: ['Личные посадки дома', 'Открытые районные встречи; цены не проверены'],
      valueMechanism: 'Небольшое общее дело снижает порог первого знакомства.', metrics: ['Пришедшие / приглашённые: доля фактически пришедших из пяти приглашённых.'],
      counterMetrics: ['Время организатора на одного участника.', 'Число отказов после знакомства с форматом.'],
      dataQualityAndUsageLimits: 'Малая вымышленная выборка; выводы нельзя переносить на весь район.',
      economics: { formula: 'Затраты = материалы + время организатора', inputs: {}, assumptions: ['Инструменты можно взять на время.', 'Денежные оценки пока неизвестны.'] },
      mvpExperiment: 'Пригласить пять соседей на один пробный день, затем спросить об участии в следующей встрече.',
      continueCriteria: ['Хотя бы трое пришли и двое согласовали следующий визит.'], changeCriteria: ['Интерес есть, но день или формат не подходят.'],
      stopCriteria: ['Никто не готов согласовать участие после повторного приглашения.'], risks: ['Организатор берёт на себя весь уход.'],
      unknowns: ['Готовность возвращаться.', 'Разрешение на использование места.', 'Реальные затраты.'], nextActions: ['Согласовать место.', 'Провести пять интервью.', 'Записать приглашения и фактические визиты.'],
      evidence: [{ sourceId: 'demo-interviews', fragmentId: 'demo-f2', sourceVersion: 2 }, { sourceId: 'demo-plan', fragmentId: 'demo-f3', sourceVersion: 1 }] },
    { id: 'demo-i2', consumer: 'Соседи, готовые ухаживать за садом каждую неделю', payer: 'Не определён',
      internalAlternatives: [], internalCheckScope: 'Внутренние аналоги не исследовались. Отсутствие данных не доказывает отсутствие аналогов.',
      marketAlternatives: [], valueMechanism: 'Общие обязанности могут поддерживать регулярное участие; пока гипотеза.',
      metrics: ['Повторные визиты / участники первой встречи за четыре недели.'], counterMetrics: ['Пропущенные дежурства.', 'Время организатора в неделю.'],
      dataQualityAndUsageLimits: 'Данных о регулярном участии нет.', economics: { formula: 'Ежемесячные затраты = расходные материалы + обслуживание', inputs: {}, assumptions: ['Регулярный бюджет не оценён.'] },
      mvpExperiment: 'Сначала проверить повторный визит после одного пробного дня.',
      continueCriteria: ['Повторные участники согласовали простой график.'], changeCriteria: ['Сократить частоту, если график неудобен.'],
      stopCriteria: ['Нет готовых разделить обязанности.'], risks: ['Формат станет нагрузкой для одного человека.'],
      unknowns: ['Спрос на регулярный формат.', 'Кто платит.', 'Кто отвечает за уход.'], nextActions: ['Не покупать оборудование до проверки повторного участия.'], evidence: [] },
  ],
};
export const initiativeNames: Record<string, string> = { 'demo-i1': 'Пробный день', 'demo-i2': 'Регулярные встречи', 'demo-i3': 'Обмен саженцами' };
export function demoTasks(id: string): Task[] {
  if (id !== DEMO_PROJECT_ID) return [];
  return [
    { id: 'demo-t1', projectId: id, status: 'completed', inputSha256: '0e8d1ff2c3c11e4f6cea404a9e6693f3df83d84299cb5c416db2a6f967a4d424', result: { project: 'Лунный сад', total: 12, kind: 'calculation' }, error: null,
      createdAt: '2026-10-26T08:15:00Z', completedAt: '2026-10-26T08:15:18Z' },
    { id: 'demo-t2', projectId: id, status: 'interrupted', inputSha256: '0e8d1ff2c3c11e4f6cea404a9e6693f3df83d84299cb5c416db2a6f967a4d424', result: null, error: 'PROCESS_INTERRUPTED',
      createdAt: '2026-10-25T09:00:00Z', completedAt: '2026-10-25T09:01:00Z' },
  ];
}
