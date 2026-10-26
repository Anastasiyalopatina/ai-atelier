import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EvidenceRef, Project, Task } from '../../../packages/contracts/src/index.ts';
import { ApiError, createApi, explainError, isAbort, takeSession } from './api.ts';
import type { BackendStatus } from './api.ts';
import { EmptyState, Unavailable } from './components.ts';
import { Context } from './Context.tsx';
import { DEMO_PROJECT_ID, demoTasks, initialDemo } from './demo.ts';
import { Memory, ProposalDialog } from './Memory.tsx';
import { Overview } from './Overview.tsx';
import { Research, ResearchResultPage, newResearchDraft } from './Research.tsx';
import type { ResearchDraft } from './Research.tsx';
import { Settings } from './Settings.tsx';
import { EvidenceDrawer, Sources } from './Sources.tsx';
import { scopedTasks } from './state.ts';
import type { DemoWorkspace, Mode, Route } from './state.ts';
import { Tasks } from './Tasks.tsx';
import { Dialog, Icon, PageHeading } from './ui.tsx';

const navigation: { id: Route; label: string; icon: string }[] = [
  { id: 'overview', label: 'Обзор проекта', icon: 'overview' }, { id: 'memory', label: 'Память', icon: 'memory' },
  { id: 'sources', label: 'Источники', icon: 'sources' }, { id: 'research', label: 'Исследования', icon: 'research' },
  { id: 'tasks', label: 'Ход работы', icon: 'tasks' }, { id: 'context', label: 'Передача контекста', icon: 'context' },
  { id: 'settings', label: 'Настройки', icon: 'settings' },
];
const routeNames = new Set([...navigation.map((r) => r.id), 'result']);
function readLocation(): { mode: Mode; route: Route } {
  const params = new URLSearchParams(location.search);
  const value = params.get('view') ?? 'overview';
  return { mode: params.get('demo') === '1' ? 'demo' : 'live', route: routeNames.has(value) ? value as Route : 'overview' };
}
type Health = 'loading' | 'ready' | 'offline' | 'session' | 'error';

export function App() {
  const [session] = useState(() => takeSession(window));
  const api = useMemo(() => createApi(session), [session]);
  const [locationState, setLocationState] = useState(readLocation);
  const { mode, route } = locationState;
  const [demo, setDemo] = useState(initialDemo);
  const [liveProjects, setLiveProjects] = useState<Project[]>([]);
  const [liveId, setLiveId] = useState('');
  const [demoId, setDemoId] = useState(DEMO_PROJECT_ID);
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [health, setHealth] = useState<Health>('loading');
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [taskRevision, setTaskRevision] = useState(0);
  const [taskState, setTaskState] = useState<{ id: string; tasks: Task[]; loading: boolean; error: string }>({ id: '', tasks: [], loading: false, error: '' });
  const [modal, setModal] = useState<'projects' | 'new' | 'edit' | 'proposals' | null>(null);
  const [reference, setReference] = useState<EvidenceRef | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ResearchDraft>>({});
  const [creationDraft, setCreationDraft] = useState({ name: '', goal: '' });
  const selected = mode === 'demo' ? demoId : liveId;
  const scope = `${mode}:${selected}`;
  const modeRef = useRef(mode); modeRef.current = mode;
  const workspace = mode === 'demo' ? demo.find((w) => w.project.id === selected && !w.archived) : undefined;
  const projects = mode === 'demo' ? demo.filter((w) => !w.archived).map((w) => w.project) : liveProjects;
  const project = projects.find((p) => p.id === selected);
  const tasks = mode === 'demo' ? demoTasks(selected) : taskState.id === selected ? scopedTasks(taskState.tasks, selected) : [];
  const pending = workspace?.proposals.filter((p) => p.status === 'pending' || p.status === 'conflict').length ?? 0;
  const navigate = (next: Route, nextMode: Mode = mode) => {
    const params = new URLSearchParams();
    if (nextMode === 'demo') params.set('demo', '1');
    if (next !== 'overview') params.set('view', next);
    history.pushState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
    setLocationState({ mode: nextMode, route: next }); setModal(null); setReference(null);
  };
  const startDemo = () => { setDemoId(DEMO_PROJECT_ID); navigate('overview', 'demo'); };
  const selectProject = (id: string) => { if (mode === 'demo') setDemoId(id); else setLiveId(id); setModal(null); setReference(null); navigate('overview'); };
  const updateWorkspace = (next: DemoWorkspace) => setDemo((old) => old.map((w) => w.project.id === next.project.id ? next : w));
  useEffect(() => {
    const pop = () => { setLocationState(readLocation()); setModal(null); setReference(null); };
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => {
    document.title = `${project?.name ? `${project.name} · ` : ''}ai-atelier`;
    const frame = requestAnimationFrame(() => { document.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true }); });
    window.scrollTo({ top: 0 });
    return () => cancelAnimationFrame(frame);
  }, [scope, route, project?.name]);
  useEffect(() => {
    if (mode !== 'live') return;
    const controller = new AbortController(); let alive = true;
    setHealth('loading'); setLoadError('');
    void Promise.allSettled([api.status(controller.signal), api.projects(controller.signal)]).then(([statusResult, projectsResult]) => {
      if (!alive) return;
      if (statusResult.status === 'fulfilled') { setStatus(statusResult.value); setHealth('ready'); }
      else if (!isAbort(statusResult.reason)) {
        setStatus(null); setLoadError(explainError(statusResult.reason));
        setHealth(statusResult.reason instanceof ApiError && statusResult.reason.code === 'UNAUTHORIZED' ? 'session' :
          statusResult.reason instanceof ApiError && statusResult.reason.code === 'NETWORK_UNAVAILABLE' ? 'offline' : 'error');
      }
      if (projectsResult.status === 'fulfilled') {
        setLiveProjects(projectsResult.value); setLiveId((old) => projectsResult.value.some((p) => p.id === old) ? old : projectsResult.value[0]?.id ?? '');
      } else if (!isAbort(projectsResult.reason)) setLoadError(explainError(projectsResult.reason));
    });
    return () => { alive = false; controller.abort(); };
  }, [api, mode, revision]);
  useEffect(() => {
    if (mode !== 'live' || !liveId) return;
    const id = liveId, controller = new AbortController(); let alive = true, inFlight = false;
    setTaskState({ id, tasks: [], loading: true, error: '' });
    const refresh = async () => {
      if (inFlight) return; inFlight = true;
      try {
        const value = await api.tasks(id, controller.signal);
        if (alive) setTaskState({ id, tasks: scopedTasks(value, id), loading: false, error: '' });
      } catch (e) {
        if (alive && !isAbort(e)) {
          setTaskState((old) => ({ id, tasks: old.id === id ? old.tasks : [], loading: false, error: explainError(e) }));
          if (e instanceof ApiError && ['NETWORK_UNAVAILABLE', 'UNAUTHORIZED', 'REQUEST_TIMEOUT'].includes(e.code)) {
            setHealth(e.code === 'UNAUTHORIZED' ? 'session' : e.code === 'NETWORK_UNAVAILABLE' ? 'offline' : 'error');
          }
        }
      } finally { inFlight = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 2500);
    return () => { alive = false; controller.abort(); clearInterval(timer); };
  }, [api, mode, liveId, taskRevision]);

  const createProject = async () => {
    const name = creationDraft.name.trim(), goal = creationDraft.goal.trim();
    if (!name) return;
    if (mode === 'demo') {
      const id = `demo-${crypto.randomUUID()}`;
      const created: DemoWorkspace = { project: { id, name, goal, constraints: [], version: 1, createdAt: new Date().toISOString() },
        archived: false, entries: [], sources: [], fragments: [], proposals: [], history: [], sourceIssues: {}, internetAllowed: {} };
      setDemo((old) => [...old, created]); setDemoId(id);
    } else {
      let value: Project;
      try { value = await api.createProject(name, goal); }
      catch (e) {
        if (modeRef.current === 'live' && e instanceof ApiError) setHealth(e.code === 'UNAUTHORIZED' ? 'session' : e.code === 'NETWORK_UNAVAILABLE' ? 'offline' : 'error');
        throw e;
      }
      if (modeRef.current !== 'live') return;
      setLiveProjects((old) => [...old.filter((p) => p.id !== value.id), value]); setLiveId(value.id);
    }
    setCreationDraft({ name: '', goal: '' }); setModal(null); navigate('overview');
  };
  const unsupported = (name: string, reason: string) => <><PageHeading eyebrow="ВОЗМОЖНОСТИ ПРОЕКТА" title={name}/><div className="card"><EmptyState title="Здесь пока нет подключённых данных" action={<button className="secondary" onClick={startDemo}>Посмотреть на вымышленном примере <Icon name="arrow" size={16}/></button>}><p>{reason} Данные других проектов и демонстрационные записи сюда не подставляются.</p></EmptyState></div></>;

  let page;
  if (route === 'settings') page = <Settings key={mode} api={api} status={status} demo={mode === 'demo'} health={health} refresh={() => setRevision((x) => x + 1)}/>;
  else if (!project) page = <><PageHeading eyebrow="ВАША МАСТЕРСКАЯ" title="Дайте проекту точку опоры"><p>Соберите контекст, сохраните основания и решите, что делать дальше.</p></PageHeading><div className="card welcome"><div className="welcome-illustration" aria-hidden="true"><span><Icon name="leaf" size={48}/></span><div/><div/></div><h2>{mode === 'live' && health === 'loading' ? 'Проверяем локальную мастерскую…' : 'Начните с одного проекта'}</h2><p>Память проектов хранится на этом Mac. Вы сами выбираете контекст, который сможет обработать Codex.</p><div className="button-row"><button disabled={mode === 'live' && health !== 'ready'} onClick={() => setModal('new')}><Icon name="plus"/>Создать проект</button><button className="secondary" onClick={startDemo}>Посмотреть демонстрацию</button></div>{mode === 'live' && health !== 'ready' && health !== 'loading' && <p className="caption">Создание недоступно, пока нет подтверждённого локального сеанса. Запустите приложение через launcher.</p>}</div><div className="first-run-notes"><div><Icon name="lock"/><h3>Хранится локально</h3><p>Проекты и результаты — в локальном хранилище вне Git.</p></div><div><Icon name="context"/><h3>Передача под контролем</h3><p>Перед вызовом Codex вы увидите точный контекст и подтвердите отправку.</p></div><div><Icon name="research"/><h3>Без выдуманной уверенности</h3><p>Неизвестные лимиты и непроверенные выводы так и обозначаются.</p></div></div></>;
  else if (route === 'overview') page = <Overview key={scope} project={project} workspace={workspace} tasks={tasks} navigate={navigate} edit={() => setModal('edit')} evidence={setReference} proposals={() => setModal('proposals')} startDemo={startDemo}/>;
  else if (route === 'memory') page = workspace ? <Memory key={scope} workspace={workspace} evidence={setReference} proposals={() => setModal('proposals')}/> : unsupported('Память проекта', 'API чтения и изменения памяти ещё не реализован.');
  else if (route === 'sources') page = workspace ? <Sources key={scope} workspace={workspace} update={updateWorkspace} evidence={setReference}/> : unsupported('Источники', 'Импорт, версии и поиск фрагментов ещё не подключены.');
  else if (route === 'research') page = workspace ? <Research key={scope} workspace={workspace} draft={drafts[scope] ?? newResearchDraft(workspace)} setDraft={(draft) => setDrafts((old) => ({ ...old, [scope]: draft }))} openResult={() => navigate('result')}/> : unsupported('Исследования', 'Backend не предоставляет исследовательский сценарий.');
  else if (route === 'result') page = workspace?.project.id === DEMO_PROJECT_ID ? <ResearchResultPage evidence={setReference} back={() => navigate('research')}/> : unsupported('Результат исследования', 'В этом проекте нет доступного исследования.');
  else if (route === 'context') page = workspace ? <Context key={scope} workspace={workspace}/> : unsupported('Передача контекста', 'Экспорт настоящей памяти ещё не подключён.');
  else page = <Tasks key={scope} projectId={selected} tasks={tasks} loading={mode === 'live' && (taskState.id !== selected || taskState.loading)} loadError={mode === 'live' && taskState.id === selected ? taskState.error : ''} demo={mode === 'demo'} api={api} status={status} refresh={() => setTaskRevision((x) => x + 1)} settings={() => navigate('settings')}/>;

  return <div className="app-shell"><a className="skip-link" href="#main-content">К содержимому</a><aside className="sidebar"><a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate('overview'); }} aria-label="ai-atelier — обзор"><span className="brand-mark" aria-hidden="true">✳</span><span>ai-atelier<small>мастерская проектов</small></span></a>
    <div className="workspace-label overline">РАБОЧЕЕ ПРОСТРАНСТВО</div><button className="project-picker" aria-label="Выбрать проект" onClick={() => setModal('projects')}><span className="project-monogram"><Icon name="leaf" size={19}/></span><span>{project?.name ?? 'Выберите проект'}<small>{mode === 'demo' ? 'Демонстрация' : 'Локальный проект'}</small></span><Icon name="down" size={14}/></button>
    <button className="new-project-button" disabled={mode === 'live' && health !== 'ready'} aria-describedby={mode === 'live' && health !== 'ready' ? 'create-unavailable' : undefined} onClick={() => setModal('new')}><Icon name="plus" size={15}/>Новый проект</button>{mode === 'live' && health !== 'ready' && <span className="sr-only" id="create-unavailable">Нужен доступный backend и локальный сеанс.</span>}
    <nav aria-label="Разделы проекта">{navigation.map((item) => <button key={item.id} className={(route === item.id || route === 'result' && item.id === 'research') ? 'nav-item active' : 'nav-item'} aria-current={(route === item.id || route === 'result' && item.id === 'research') ? 'page' : undefined} onClick={() => navigate(item.id)}><Icon name={item.icon} size={19}/><span>{item.label}</span>{item.id === 'memory' && pending > 0 && <span className="nav-count" aria-label={`${pending} изменения`}>{pending}</span>}</button>)}</nav>
    <div className="sidebar-bottom"><div className="local-note"><Icon name="lock" size={17}/><span><strong>На вашем Mac</strong><small>Вы управляете передачей контекста</small></span></div><button className="demo-switch" onClick={() => mode === 'demo' ? navigate('overview', 'live') : startDemo()}>{mode === 'demo' ? '← Вернуться к моим проектам' : 'Посмотреть демонстрацию'}<Icon name="arrow" size={14}/></button></div>
  </aside><div className="main-shell"><header className="topbar"><div className="breadcrumb"><span>Мастерская</span><Icon name="chevron" size={13}/><strong>{project?.name ?? 'Начало работы'}</strong></div><button className="topbar-status" onClick={() => navigate('settings')}><span className={`connection-dot ${mode === 'live' && health === 'ready' ? 'ready' : ''}`}/>{mode === 'demo' ? 'Демонстрационный режим' : { ready: 'Локальный сервер отвечает', loading: 'Проверяем сервер…', session: 'Нужен локальный сеанс', offline: 'Нет связи с сервером', error: 'Не удалось проверить сервер' }[health]}</button></header>
    {mode === 'demo' && <div className="demo-banner"><span><strong>Демонстрационные данные</strong><span>Вымышленный проект · изменения до перезагрузки · без вызовов модели</span></span><button onClick={() => navigate('overview', 'live')}>Мои проекты <Icon name="arrow" size={14}/></button></div>}
    <main id="main-content" className="main-content"><div className="content-wrap">{mode === 'live' && loadError && <div role="alert" className="alert"><div><strong>Не удалось обновить мастерскую</strong><p>{loadError}</p>{liveProjects.length > 0 && <p className="caption">Показаны последние загруженные проекты. Их состояние могло измениться.</p>}</div><button className="secondary" onClick={() => setRevision((x) => x + 1)}>Повторить проверку</button></div>}{page}</div><footer className="page-footer"><span>Меньше потерянного контекста. Больше ясных решений.</span><span><Icon name="lock" size={12}/>Локальное хранение · выбранный контекст обрабатывает Codex</span></footer></main>
  </div>
    {modal === 'projects' && <ProjectPicker projects={projects} archived={mode === 'demo' ? demo.filter((w) => w.archived).map((w) => w.project) : []} selected={selected} onClose={() => setModal(null)} select={selectProject} restore={(id) => setDemo((old) => old.map((w) => w.project.id === id ? { ...w, archived: false } : w))} create={() => setModal('new')}/>}
    {modal === 'new' && <CreateProject demo={mode === 'demo'} draft={creationDraft} setDraft={setCreationDraft} submit={createProject} onClose={() => setModal(null)}/>}
    {modal === 'edit' && project && <EditProject key={scope} project={project} workspace={workspace} onClose={() => setModal(null)} save={(name, goal) => { if (workspace) updateWorkspace({ ...workspace, project: { ...workspace.project, name, goal, version: workspace.project.version + 1 } }); setModal(null); }} archive={() => {
      if (!workspace) return; updateWorkspace({ ...workspace, archived: true }); setDemoId(demo.find((w) => !w.archived && w.project.id !== selected)?.project.id ?? ''); setModal(null);
    }}/>}
    {modal === 'proposals' && workspace && <ProposalDialog workspace={workspace} update={updateWorkspace} onClose={() => setModal(null)}/>}
    {reference && workspace && <EvidenceDrawer workspace={workspace} reference={reference} onClose={() => setReference(null)}/>}
  </div>;
}

function ProjectPicker({ projects, archived, selected, select, restore, create, onClose }: { projects: Project[]; archived: Project[]; selected: string;
  select: (id: string) => void; restore: (id: string) => void; create: () => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const filtered = projects.filter((p) => p.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
  return <Dialog title="Ваши проекты" onClose={onClose}><label className="search-field"><Icon name="research" size={18}/><span className="sr-only">Найти проект</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти проект по названию"/></label><div className="project-list">{filtered.map((p) => <button className={`project-option ${selected === p.id ? 'selected' : ''}`} key={p.id} onClick={() => select(p.id)}><Icon name="folder"/><span>{p.name}<small>Версия {p.version}</small></span>{selected === p.id ? <Icon name="check"/> : <Icon name="chevron" size={16}/>}</button>)}{!filtered.length && <p className="muted">{query ? 'Проекты не найдены.' : 'Пока нет проектов.'}</p>}</div>{archived.length > 0 && <details><summary>В архиве ({archived.length})</summary>{archived.map((p) => <div className="archived-project" key={p.id}><span>{p.name}</span><button className="text-button" onClick={() => restore(p.id)}>Восстановить</button></div>)}</details>}<div className="dialog-actions"><button className="secondary" onClick={onClose}>Закрыть</button><button onClick={create}><Icon name="plus" size={16}/>Создать проект</button></div></Dialog>;
}
function CreateProject({ demo, draft, setDraft, submit, onClose }: { demo: boolean; draft: { name: string; goal: string }; setDraft: (d: { name: string; goal: string }) => void; submit: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  return <Dialog title="Новый проект" onClose={() => { if (!lock.current) onClose(); }}><p className="muted">{demo ? 'Создаётся вымышленный проект в этой вкладке. После перезагрузки он исчезнет.' : 'Название и цель сохранятся в локальном хранилище. Создание проекта не вызывает Codex.'}</p><form onSubmit={(e) => {
    e.preventDefault(); if (lock.current || !draft.name.trim()) return; lock.current = true; setBusy(true); setError('');
    void submit().catch((err) => setError(explainError(err))).finally(() => { lock.current = false; setBusy(false); });
  }}><label htmlFor="project-name">Название проекта</label><input id="project-name" maxLength={120} required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Например, городской сад"/><label htmlFor="project-goal">Что хотите решить? <span className="caption">Необязательно</span></label><textarea id="project-goal" maxLength={1500} rows={3} value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} placeholder="Кратко опишите цель или ближайший вопрос"/>{error && <p role="alert" className="inline-error">{error}</p>}<div className="dialog-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Отмена</button><button disabled={busy || !draft.name.trim()}>{busy ? 'Создаём…' : 'Создать проект'}</button></div></form></Dialog>;
}
function EditProject({ project, workspace, save, archive, onClose }: { project: Project; workspace?: DemoWorkspace; save: (name: string, goal: string) => void; archive: () => void; onClose: () => void }) {
  const [name, setName] = useState(project.name), [goal, setGoal] = useState(project.goal), [confirmArchive, setConfirmArchive] = useState(false);
  return <Dialog title="Управление проектом" onClose={onClose}>{!workspace && <Unavailable title="Изменение пока недоступно">Backend поддерживает создание, но не переименование и архивацию. Подключение этих действий ожидает API интегратора.</Unavailable>}<form onSubmit={(e) => { e.preventDefault(); if (workspace && name.trim()) save(name.trim(), goal.trim()); }}><label htmlFor="edit-name">Название</label><input id="edit-name" value={name} maxLength={120} readOnly={!workspace} onChange={(e) => setName(e.target.value)}/><label htmlFor="edit-goal">Цель</label><textarea id="edit-goal" value={goal} maxLength={1500} rows={3} readOnly={!workspace} onChange={(e) => setGoal(e.target.value)}/><div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Закрыть</button><button disabled={!workspace || !name.trim()}>Сохранить изменения</button></div></form><div className="archive-section"><h3>Архив проекта</h3><p className="caption">Проект будет скрыт из выбора. В демонстрации его можно восстановить в списке проектов.</p>{confirmArchive ? <div className="button-row"><button className="danger-button" onClick={archive}>Подтвердить архивацию</button><button className="secondary" onClick={() => setConfirmArchive(false)}>Не архивировать</button></div> : <button className="secondary" disabled={!workspace} onClick={() => setConfirmArchive(true)}>Архивировать проект</button>}</div></Dialog>;
}
