import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Project, Task } from '../../../packages/contracts/src/index.ts';
import './style.css';

const incomingToken = new URLSearchParams(location.hash.slice(1)).get('session');
if (incomingToken) { sessionStorage.setItem('ai-atelier-session', incomingToken); history.replaceState(null, '', location.pathname); }
const token = sessionStorage.getItem('ai-atelier-session') ?? '';
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: data === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'REQUEST_FAILED');
  return value;
}
type Status = { contractsVersion: string; billing: { verifiedByUser: boolean }; note: string };
type Preview = { text: string; inputSha256: string; destination: string; createdAt: string };
const errors: Record<string, string> = {
  UNAUTHORIZED: 'Откройте приложение через launcher: нужна ссылка текущего локального сеанса.',
  PAID_CONTINUATION_UNVERIFIED: 'Сначала подтвердите отключение платного продолжения в настройках аккаунта.',
  AUTH_REQUIRED: 'Требуется официальный вход в Codex через ChatGPT.',
  CHATGPT_LOGIN_REQUIRED: 'В Codex нужен вход через ChatGPT.',
  USAGE_LIMIT_REACHED: 'Лимит исчерпан. Задача сохранена; новых запусков не будет.',
  MODEL_TIMEOUT: 'Истекло время задачи. Состояние сохранено.', INVALID_MODEL_JSON: 'Ответ модели не прошёл проверку схемы.',
  STALE_INPUT: 'Предпросмотр устарел. Откройте его снова.', PROCESS_INTERRUPTED: 'Процесс прерван. Автоматический повтор отключён.',
  CUSTOM_ROUTE_BLOCKED: 'В настройках Codex обнаружен неподтверждённый маршрут. Запуск заблокирован.',
};
function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [approved, setApproved] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const showError = (e: unknown) => setError(errors[e instanceof Error ? e.message : ''] ?? 'Не удалось выполнить действие. Диагностика сохранена локально.');
  const load = async () => {
    setStatus(await api<Status>('status'));
    const list = await api<Project[]>('projects'); setProjects(list); setSelected((old) => old || list[0]?.id || '');
  };
  useEffect(() => { void load().catch(showError); }, []);
  useEffect(() => {
    setPreview(null); setApproved(false); setTasks([]); setRequestKey(crypto.randomUUID());
    if (!selected) return;
    let alive = true;
    const refresh = () => api<Task[]>(`projects/${selected}/tasks`).then((value) => { if (alive) setTasks(value); }).catch(showError);
    void refresh(); const timer = setInterval(() => { void refresh(); }, 2000);
    return () => { alive = false; clearInterval(timer); };
  }, [selected]);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); try { await fn(); } catch (e) { showError(e); } finally { setBusy(false); }
  };
  const create = () => action(async () => { const project = await api<Project>('projects', { name });
    setProjects((old) => [...old, project]); setSelected(project.id); setName(''); });
  const prepare = () => action(async () => { setPreview(await api<Preview>(`projects/${selected}/preview`));
    setApproved(false); setRequestKey(crypto.randomUUID()); });
  const run = () => action(async () => {
    if (!preview || !approved) return;
    const task = await api<Task>(`projects/${selected}/tasks`, { approved: true, inputSha256: preview.inputSha256, idempotencyKey: requestKey });
    setTasks((old) => [task, ...old.filter((x) => x.id !== task.id)]); setPreview(null); setApproved(false);
  });
  return <div className="app"><header><a className="brand" href="/">ai-atelier<span>мастерская проектов</span></a><span className="badge">BOOTSTRAP · contracts {status?.contractsVersion ?? '1.0.0'}</span></header>
    <main><section className="intro"><p className="eyebrow">ПАМЯТЬ И ИССЛЕДОВАНИЯ</p><h1>Место, где проект<br/>сохраняет контекст.</h1><p>Локальный каркас мастерской. Сейчас доступны проекты и проверка подключения к Codex на вымышленном тексте.</p></section>
    {error && <div role="alert" className="alert">{error}</div>}
    <div className="columns"><aside className="panel"><h2>Ваши проекты</h2><div className="project-list">{projects.map((p) => <button className={selected === p.id ? 'project selected' : 'project'} key={p.id} onClick={() => setSelected(p.id)}>{p.name}<small>Версия {p.version}</small></button>)}{!projects.length && <p className="muted">Создайте первый проект. Его данные останутся вне репозитория.</p>}</div>
      <form onSubmit={(e) => { e.preventDefault(); void create(); }}><label htmlFor="project-name">Новый проект</label><input id="project-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Название проекта"/><button disabled={busy || !name.trim()}>Создать проект</button></form></aside>
    <section className="panel workspace"><div className="section-top"><h2>Проверка Codex</h2><span className="dot-label">Официальный клиент · ChatGPT</span></div><p>Один реальный вызов на вымышленном тексте: результат проверяется и сохраняется в локальной SQLite.</p>
      <div className="billing"><strong>Контроль расходов</strong><p>{status?.billing.verifiedByUser ? 'Вы подтвердили: платное продолжение и автопополнение отключены. Подтверждение действует 24 часа.' : 'Перед запуском проверьте в аккаунте ChatGPT, что автоматическое платное продолжение и автопополнение отключены.'}</p><small>Мастерская не управляет аккаунтным биллингом и не может гарантировать его настройки.</small>
      {!status?.billing.verifiedByUser && <button className="secondary" disabled={busy} onClick={() => void action(async () => { await api('settings/billing-confirmation', { paidContinuationDisabled: true, autoTopUpDisabled: true }); await load(); })}>Я проверила: обе настройки отключены</button>}</div>
      <button disabled={!selected || busy} onClick={() => void prepare()}>Посмотреть данные перед отправкой</button>
      {preview && <div className="preview"><h3>Что получит Codex</h3><p className="synthetic">ТОЛЬКО ВЫМЫШЛЕННЫЕ ДАННЫЕ</p><blockquote>{preview.text}</blockquote><small>{preview.destination} · {new Date(preview.createdAt).toLocaleString('ru-RU')}</small><label className="check"><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)}/>Разрешаю отправить показанный текст</label><button disabled={!approved || !status?.billing.verifiedByUser || busy} onClick={() => void run()}>Запустить проверку</button></div>}
      <div className="results"><h3>Сохранённые задачи</h3>{!tasks.length && <p className="muted">Результат появится здесь после проверки.</p>}{tasks.map((task) => <article key={task.id} className="task"><div className="section-top"><strong>{{ queued: 'В очереди', running: 'Выполняется', completed: 'Завершено', failed: 'Ошибка', cancelled: 'Отменено', interrupted: 'Прервано' }[task.status]}</strong><small>{new Date(task.createdAt).toLocaleString('ru-RU')}</small></div>{task.result && <p>«{task.result.project}»: {task.result.total} деревьев. Тип — расчёт на вымышленных данных.</p>}{task.error && <p className="error">{errors[task.error] ?? `Диагностический код: ${task.error}`}</p>}{['queued', 'running'].includes(task.status) && <button className="secondary" onClick={() => void action(async () => { await api(`projects/${selected}/tasks/${task.id}/cancel`, {}); })}>Отменить</button>}</article>)}</div>
    </section></div><section className="roadmap"><h2>Следующие этапы</h2><p>Импорт документов, изменения памяти через diff, исследования и MCP ещё не реализованы. Этот экран служит проверке Bootstrap.</p></section></main><footer>Данные — на вашем Mac. Обработка Codex передаёт одобренный контекст официальному сервису OpenAI.</footer></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
