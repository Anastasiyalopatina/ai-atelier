import type { ChangeProposal, ContextSnapshot, EvidenceRef, KnowledgeEntry, Project, Source, SourceFragment, Task } from '../../../packages/contracts/src/index.ts';

export type Route = 'overview' | 'memory' | 'sources' | 'research' | 'tasks' | 'context' | 'settings' | 'result';
export type Mode = 'live' | 'demo';
export type ViewStatus = Task['status'] | 'needs_decision' | 'limit' | 'offline' | 'unknown';
export const statusLabels: Record<ViewStatus, string> = {
  queued: 'Ожидает', running: 'Выполняется', needs_decision: 'Требует решения', limit: 'Лимит исчерпан',
  offline: 'Нет связи', failed: 'Ошибка', cancelled: 'Отменено', interrupted: 'Прервано',
  completed: 'Завершено', unknown: 'Не проверено',
};
export function taskViewStatus(task: Pick<Task, 'status' | 'error'>): ViewStatus {
  if (task.status === 'failed' && task.error === 'USAGE_LIMIT_REACHED') return 'limit';
  if (task.status === 'failed' && task.error === 'NETWORK_UNAVAILABLE') return 'offline';
  return task.status;
}
export interface DemoFragment extends SourceFragment { sourceVersion: number }
export interface DemoHistory { id: string; at: string; description: string; before?: string; after?: string }
export interface DemoWorkspace {
  project: Project; archived: boolean; entries: KnowledgeEntry[]; sources: Source[];
  fragments: DemoFragment[]; proposals: ChangeProposal[]; history: DemoHistory[];
  sourceIssues: Record<string, string>; internetAllowed: Record<string, boolean>;
}
export function scopedTasks(tasks: Task[], projectId: string): Task[] { return tasks.filter((task) => task.projectId === projectId); }
export function demoFileError(name: string, size: number): string | null {
  if (!/\.(txt|md)$/i.test(name)) return 'Этот формат пока не извлекается. Используйте текстовый .txt или .md. Сканам нужен текстовый слой; OCR не подключён.';
  if (size > 128_000) return 'Для демонстрации выберите текст до 128 КБ. Уже введённый текст сохранён.';
  return null;
}
export function findEvidence(workspace: DemoWorkspace, ref: EvidenceRef) {
  const source = workspace.sources.find((s) => s.projectId === workspace.project.id && s.id === ref.sourceId);
  const fragment = workspace.fragments.find((f) => f.projectId === workspace.project.id && f.sourceId === ref.sourceId &&
    f.id === ref.fragmentId && f.sourceVersion === ref.sourceVersion);
  return { source, fragment, outdated: !!source && source.version !== ref.sourceVersion };
}
export function applyProposals(workspace: DemoWorkspace, ids: string[], at: string): DemoWorkspace {
  const selected = workspace.proposals.filter((p) => ids.includes(p.id) && p.projectId === workspace.project.id);
  if (!selected.length) return workspace;
  const stale = selected.filter((p) => p.baseVersion !== workspace.project.version || p.status !== 'pending');
  if (stale.length) return { ...workspace, proposals: workspace.proposals.map((p) => stale.some((s) => s.id === p.id) &&
    p.status !== 'accepted' ? { ...p, status: 'conflict' } : p) };
  const paths = selected.flatMap((p) => p.changes.map((c) => c.path));
  if (new Set(paths).size !== paths.length) return { ...workspace, proposals: workspace.proposals.map((p) => ids.includes(p.id) ? { ...p, status: 'conflict' } : p) };
  let entries = [...workspace.entries];
  for (const p of selected) for (const c of p.changes) {
    const entry = entries.find((e) => c.path === `/knowledge/${e.id}/text`);
    if (!entry || entry.projectId !== workspace.project.id || c.before !== entry.text || typeof c.after !== 'string') {
      return { ...workspace, proposals: workspace.proposals.map((p) => ids.includes(p.id) ? { ...p, status: 'conflict' } : p) };
    }
    entries = entries.map((e) => e.id === entry.id ? { ...e, text: c.after as string, version: e.version + 1 } : e);
  }
  return { ...workspace, project: { ...workspace.project, version: workspace.project.version + 1 }, entries,
    proposals: workspace.proposals.map((p) => ids.includes(p.id) ? { ...p, status: 'accepted' } : p),
    history: [...selected.flatMap((p) => p.changes.map((c, i) => ({ id: `${p.id}-${i}`, at,
      description: 'Пользователь принял редакцию записи. Статус проверки не изменён.', before: String(c.before), after: String(c.after) }))), ...workspace.history] };
}
export function refreshProposal(workspace: DemoWorkspace, id: string): DemoWorkspace {
  return { ...workspace, proposals: workspace.proposals.map((p) => p.id !== id ? p : {
    ...p, baseVersion: workspace.project.version, status: 'pending', changes: p.changes.map((c) => {
      const entry = workspace.entries.find((e) => c.path === `/knowledge/${e.id}/text`);
      return { ...c, before: entry?.text ?? c.before };
    }),
  }) };
}
export type ContextScope = 'brief' | 'full' | 'decisions';
export async function buildContext(workspace: DemoWorkspace, scope: ContextScope, at: string, task?: string): Promise<ContextSnapshot> {
  const { project } = workspace;
  const sources = workspace.sources.filter((s) => s.projectId === project.id && s.disclosure !== 'local_only' && !workspace.sourceIssues[s.id]);
  const sourceIds = new Set(sources.map((s) => s.id));
  const eligible = workspace.entries.filter((e) => e.projectId === project.id && e.disclosure !== 'local_only' &&
    e.evidence.every((ref) => sourceIds.has(ref.sourceId) && !!findEvidence(workspace, ref).fragment));
  const decisions = eligible.filter((e) => e.kind === 'decision');
  const facts = scope === 'decisions' ? [] : eligible.filter((e) => e.kind !== 'decision').slice(0, scope === 'brief' ? 2 : undefined);
  const used = new Set([...decisions, ...facts].flatMap((e) => e.evidence.map((ref) => ref.sourceId)));
  const includedSources = sources.filter((s) => used.has(s.id));
  const snapshot: ContextSnapshot = { schemaVersion: 1, projectId: project.id, projectVersion: project.version,
    createdAt: at, task: task ?? project.goal,
    decisions, constraints: [...project.constraints], facts, sources: includedSources,
    gaps: project.id === 'demo-garden' ? ['Неизвестна готовность соседей регулярно участвовать.', 'Расходы на сезон ещё не подтверждены.'] : [],
    nextActions: project.id === 'demo-garden' ? ['Провести 5 интервью с соседями.', 'Согласовать место для одного пробного дня.'] : [],
    excludedCount: workspace.entries.filter((e) => e.projectId === project.id).length - decisions.length - facts.length +
      workspace.sources.filter((s) => s.projectId === project.id).length - includedSources.length,
    sha256: '',
  };
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  snapshot.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
  return snapshot;
}
export function contextMarkdown(snapshot: ContextSnapshot): string {
  return ['# Контекст проекта · демонстрационные данные', '', `Версия проекта: ${snapshot.projectVersion} · схема: ${snapshot.schemaVersion}`,
    `Дата: ${snapshot.createdAt}`, `SHA-256: ${snapshot.sha256}`, '', '## Задача', snapshot.task, '', '## Ограничения',
    ...snapshot.constraints.map((c) => `- ${c}`), '', '## Решения', ...snapshot.decisions.map((e) => `- ${e.text} [${e.verification}]`),
    '', '## Записи и гипотезы', ...snapshot.facts.map((e) => `- ${e.text} [${e.kind}; ${e.verification}]`), '', '## Источники',
    ...snapshot.sources.map((s) => `- ${s.title} · версия ${s.version} · ${s.id}`), '', '## Точные основания',
    ...[...snapshot.decisions, ...snapshot.facts].flatMap((e) => e.evidence.map((r) => `- ${e.id} → ${r.sourceId}, фрагмент ${r.fragmentId}, версия ${r.sourceVersion}`)),
    '', '## Пробелы', ...snapshot.gaps.map((g) => `- ${g}`), '', '## Следующие действия', ...snapshot.nextActions.map((a) => `- ${a}`),
    '', `Исключено записей и источников: ${snapshot.excludedCount}. Local-only материалы не включены.`,
    'Это подготовленный контекст, а не подтверждение достоверности записей.'].join('\n');
}
