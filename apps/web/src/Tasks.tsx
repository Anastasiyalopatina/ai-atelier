import React, { useEffect, useRef, useState } from 'react';
import type { Task } from '../../../packages/contracts/src/index.ts';
import type { AtelierApi, BackendStatus, BootstrapPreview } from './api.ts';
import { ApiError, explainError } from './api.ts';
import { EmptyState, StatusBadge, Unavailable } from './components.ts';
import { taskViewStatus } from './state.ts';
import { Dialog, Icon, PageHeading, SectionHeading, formatDate } from './ui.tsx';

export function Tasks({ projectId, tasks, loading, loadError, demo, api, status, refresh, settings }: {
  projectId: string; tasks: Task[]; loading: boolean; loadError: string; demo: boolean; api: AtelierApi;
  status: BackendStatus | null; refresh: () => void; settings: () => void;
}) {
  const [preview, setPreview] = useState<BootstrapPreview | null>(null);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [requested, setRequested] = useState<string[]>([]);
  const key = useRef(crypto.randomUUID());
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const action = async (fn: () => Promise<void>) => {
    if (lock.current || demo) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) {
      if (alive.current) { setError(explainError(e)); if (e instanceof ApiError && e.code === 'STALE_INPUT') { setPreview(null); setApproved(false); } }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const prepare = () => action(async () => {
    const value = await api.preview(projectId);
    if (!alive.current) return;
    key.current = crypto.randomUUID(); setApproved(false); setPreview(value);
  });
  const run = () => action(async () => {
    if (!preview || !approved || !status?.billing.verifiedByUser) return;
    const task = await api.run(projectId, preview.inputSha256, key.current);
    if (task.projectId !== projectId) throw new ApiError('INVALID_RESPONSE');
    if (!alive.current) return;
    setPreview(null); setApproved(false); setNotice('Задача принята сервером. Состояние ниже обновляется из backend.'); refresh();
  });
  const cancel = (task: Task) => action(async () => {
    await api.cancel(projectId, task.id);
    if (!alive.current) return;
    setRequested((old) => [...old, task.id]); setNotice('Запрос отмены отправлен. Ожидаем подтверждение состояния от сервера.'); refresh();
  });
  const active = tasks.filter((t) => ['running', 'queued'].includes(t.status));
  const finished = tasks.filter((t) => !['running', 'queued'].includes(t.status));
  const renderTask = (task: Task) => <article className="card task-card" key={task.id}><div className="row-between"><div className="task-heading"><span className="task-icon"><Icon name="tasks" size={20}/></span><div><h3>Проверка Codex на вымышленном тексте</h3><span className="caption">Создана {formatDate(task.createdAt)}</span></div></div><StatusBadge status={taskViewStatus(task)}/></div>
    {task.result && <div className="task-artifact"><span className="overline">СОХРАНЁННЫЙ РЕЗУЛЬТАТ</span><p>«{task.result.project}»: <strong>{task.result.total} деревьев</strong></p><span className="caption">Расчёт на вымышленных данных · результат не добавлен в память</span></div>}
    {task.error && <p className={task.status === 'cancelled' ? 'muted spaced' : 'inline-error'}>{explainError(new ApiError(task.error))}</p>}
    {['queued', 'running'].includes(task.status) && <div className="task-stage"><span className="caption">Этап: {task.status === 'queued' ? 'ожидание общего исполнителя' : 'выполнение официальным Codex'}. Процент выполнения неизвестен.</span><button className="secondary" disabled={demo || busy || requested.includes(task.id)} onClick={() => void cancel(task)}>{requested.includes(task.id) ? 'Отмена запрошена…' : 'Отменить задачу'}</button></div>}
    <details className="task-details"><summary>Технические сведения</summary><dl className="detail-list"><div><dt>Завершена</dt><dd>{task.completedAt ? formatDate(task.completedAt) : 'Ещё не завершена'}</dd></div><div><dt>Автоматический повтор</dt><dd>Отключён</dd></div><div><dt>Контекст</dt><dd>Фиксированный вымышленный текст</dd></div></dl><p className="caption">Содержательные журналы не загружаются в интерфейс. Здесь только состояние задачи.</p></details>
  </article>;
  return <><PageHeading eyebrow="ХОД РАБОТЫ" title="Результаты прежде журналов" action={!demo ? <button disabled={busy} onClick={() => void prepare()}><Icon name="plus"/>{busy ? 'Подождите…' : 'Проверить Codex'}</button> : undefined}><p>Состояния приходят с локального сервера. После перезапуска незавершённые задачи не запускаются повторно.</p></PageHeading>
    {demo && <Unavailable title="Примеры сохранённых задач">Показаны вымышленные завершённая и прерванная задачи. Запуски и отмена доступны только в режиме ваших проектов.</Unavailable>}
    {!demo && !status?.billing.verifiedByUser && <Unavailable title="Перед первым запуском">Подтвердите отключённое платное продолжение и автопополнение в <button className="inline-button" onClick={settings}>настройках</button>. Подготовить предпросмотр можно заранее.</Unavailable>}
    {error && <p role="alert" className="inline-error">{error}</p>}{notice && <p role="status" className="notice compact">{notice}</p>}
    {loadError && <div role="alert" className="alert"><p>{loadError}</p><button className="secondary" onClick={refresh}>Обновить задачи</button></div>}
    {loading && !tasks.length ? <p role="status" className="muted">Загружаем сохранённые задачи…</p> : <>
      {active.length > 0 && <section className="task-section"><SectionHeading title="В работе" detail="Один общий модельный исполнитель. Без выдуманных процентов."/>{active.map(renderTask)}</section>}
      {finished.length > 0 && <section className="task-section"><SectionHeading title="Сохранённые результаты"/>{finished.map(renderTask)}</section>}
      {!tasks.length && !loadError && <div className="card"><EmptyState title="Задач пока нет"><p>Проверьте Codex на коротком вымышленном тексте. Сначала вы увидите всё, что будет передано.</p></EmptyState></div>}
    </>}
    {preview && <Dialog title="Что получит Codex" onClose={() => { if (!busy) { setPreview(null); setApproved(false); } }}>
      <p className="demo-caption">ТОЛЬКО ВЫМЫШЛЕННЫЙ ТЕКСТ · РЕАЛЬНЫЙ ВЫЗОВ CODEX</p><blockquote className="evidence-quote">{preview.text}</blockquote><dl className="detail-list"><div><dt>Получатель</dt><dd>{preview.destination}</dd></div><div><dt>Подготовлен</dt><dd>{formatDate(preview.createdAt)}</dd></div><div><dt>Не включено</dt><dd>Документы и память проекта. Это отдельная проверка подключения.</dd></div></dl>
      <label className="checkbox-label spaced"><input type="checkbox" checked={approved} disabled={busy} onChange={(e) => setApproved(e.target.checked)}/>Разрешаю передать показанный текст официальному Codex с авторизацией ChatGPT.</label>
      {!status?.billing.verifiedByUser && <p className="inline-error">Нужна проверка настроек расходов. <button className="inline-button" onClick={settings}>Перейти в настройки</button></p>}
      {error && <p role="alert" className="inline-error">{error}</p>}<p className="caption">Один запуск, до 150 секунд, без автоматического повтора. Остаток лимита в этом интерфейсе неизвестен.</p><div className="dialog-actions"><button className="secondary" disabled={busy} onClick={() => { setPreview(null); setApproved(false); }}>Назад</button><button disabled={!approved || !status?.billing.verifiedByUser || busy} onClick={() => void run()}>{busy ? 'Отправляем…' : 'Запустить проверку'}</button></div>
    </Dialog>}
  </>;
}
