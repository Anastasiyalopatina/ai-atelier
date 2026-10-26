import React, { useEffect, useRef, useState } from 'react';
import type { Disclosure, EvidenceRef, FragmentLocation, Source } from '../../../packages/contracts/src/index.ts';
import { EmptyState, Unavailable } from './components.ts';
import { demoFileError, findEvidence } from './state.ts';
import type { DemoWorkspace } from './state.ts';
import { Dialog, Icon, PageHeading, formatDate } from './ui.tsx';

const disclosureLabels: Record<Disclosure, string> = { local_only: 'Только локально', codex_allowed: 'Можно передать Codex', public: 'Открытый материал' };
function locationLabel(location: FragmentLocation): string {
  switch (location.kind) {
    case 'text': return `Символы ${location.start}–${location.end}`;
    case 'pdf': return `Страница ${location.page}, символы ${location.start}–${location.end}`;
    case 'docx': return `Абзац ${location.paragraph}`;
    case 'table': return `Лист «${location.sheet}», ${location.range}`;
  }
}
export function Sources({ workspace, update, evidence }: { workspace: DemoWorkspace; update: (w: DemoWorkspace) => void; evidence: (r: EvidenceRef) => void }) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const source = workspace.sources.find((s) => s.id === selected && s.projectId === workspace.project.id);
  const q = query.toLocaleLowerCase('ru');
  const sources = workspace.sources.filter((s) => s.projectId === workspace.project.id && (s.title.toLocaleLowerCase('ru').includes(q) ||
    workspace.fragments.some((f) => f.projectId === workspace.project.id && f.sourceId === s.id && f.text.toLocaleLowerCase('ru').includes(q))));
  return <><PageHeading eyebrow="ИСТОЧНИКИ ПРОЕКТА" title="У каждого вывода есть основание" action={<button onClick={() => setAdding(true)}><Icon name="plus"/>Добавить источник</button>}><p>Версии, точные фрагменты и понятные границы доступа.</p></PageHeading>
    <div className="filter-bar"><label className="search-field"><Icon name="research" size={17}/><span className="sr-only">Поиск источников и фрагментов</span><input placeholder="Поиск по названиям и тексту фрагментов" value={query} onChange={(e) => setQuery(e.target.value)}/></label><span className="caption">Только текущий проект</span></div>
    <div className="source-grid">{sources.map((s) => <article className="card source-card" key={s.id}><div className="row-between"><span className="source-icon"><Icon name="sources" size={22}/></span><span className="caption">Версия {s.version}</span></div><h2><button className="entry-title" onClick={() => setSelected(s.id)}>{s.title}</button></h2><p className="caption">{s.origin}</p><span className="source-access"><Icon name={s.disclosure === 'local_only' ? 'lock' : 'check'} size={13}/>{disclosureLabels[s.disclosure]}</span><div className="source-bottom"><span className="caption">{formatDate(s.retrievedAt)}</span><button className="text-button" onClick={() => setSelected(s.id)}>Открыть <Icon name="arrow" size={15}/></button></div>{query && workspace.fragments.filter((f) => f.sourceId === s.id && f.projectId === workspace.project.id && f.text.toLocaleLowerCase('ru').includes(q)).slice(0, 2).map((f) => <button className="fragment-hit" key={f.id} onClick={() => evidence({ sourceId: s.id, fragmentId: f.id, sourceVersion: f.sourceVersion })}><span className="caption">Фрагмент · v{f.sourceVersion}</span><p>{f.text}</p></button>)}</article>)}</div>
    {!sources.length && <div className="card"><EmptyState title={query ? 'Фрагментов не найдено' : 'Первые основания проекта'}><p>{query ? 'Проверьте запрос. Поиск ведётся только внутри этого проекта.' : 'Добавьте вымышленный текст, чтобы посмотреть работу с версиями и доказательствами.'}</p></EmptyState></div>}
    <Unavailable title="Границы демонстрации">Текст и Markdown читаются только в этой вкладке. Извлечение PDF/DOCX, таблиц и OCR ещё не подключено. Файлы никуда не отправляются.</Unavailable>
    {adding && <AddSource workspace={workspace} update={update} onClose={() => setAdding(false)}/>}
    {source && <Dialog title={source.title} drawer onClose={() => setSelected(null)}><p className="caption">{source.origin} · текущая версия {source.version}</p><h3>Доступ к материалу</h3><label htmlFor="source-disclosure">Куда можно передавать</label><select id="source-disclosure" value={source.disclosure} onChange={(e) => {
      const disclosure = e.target.value as Disclosure;
      update({ ...workspace, project: { ...workspace.project, version: workspace.project.version + 1 }, sources: workspace.sources.map((s) => s.id === source.id ? { ...s, disclosure } : s),
        internetAllowed: { ...workspace.internetAllowed, [source.id]: disclosure === 'local_only' ? false : workspace.internetAllowed[source.id] } });
    }}>{Object.entries(disclosureLabels).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select><label className="checkbox-label"><input type="checkbox" checked={!!workspace.internetAllowed[source.id]} disabled={source.disclosure === 'local_only'} onChange={(e) => update({ ...workspace, internetAllowed: { ...workspace.internetAllowed, [source.id]: e.target.checked } })}/>Разрешить использовать текст в интернет-запросах</label><p className="caption">Для local-only эта опция недоступна. Переключатели показывают будущие настройки; интернет-поиск не выполняется.</p><h3 className="spaced">Фрагменты и версии</h3>{workspace.fragments.filter((f) => f.projectId === workspace.project.id && f.sourceId === source.id).map((f) => <article className="fragment-card" key={f.id}><div className="row-between"><strong>Версия {f.sourceVersion}</strong><span className="caption">{locationLabel(f.location)}</span></div><blockquote>{f.text}</blockquote><button className="text-button" onClick={() => { setSelected(null); evidence({ sourceId: source.id, fragmentId: f.id, sourceVersion: f.sourceVersion }); }}>Показать основание рядом <Icon name="arrow" size={15}/></button></article>)}</Dialog>}
  </>;
}

function AddSource({ workspace, update, onClose }: { workspace: DemoWorkspace; update: (w: DemoWorkspace) => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const readFile = async (file?: File) => {
    if (!file) return;
    setError('');
    const issue = demoFileError(file.name, file.size);
    if (issue) { setError(issue); return; }
    setBusy(true);
    try {
      const value = await file.text();
      if (!alive.current) return;
      if (value.includes('\u0000') || value.includes('\uFFFD')) { setError('Не удалось прочитать текст UTF-8. Проверьте кодировку или вставьте текст вручную.'); return; }
      setText(value); if (!title) setTitle(file.name.replace(/\.(txt|md)$/i, ''));
    } catch { if (alive.current) setError('Файл не прочитан. Текст формы сохранён.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const save = async () => {
    if (lock.current || !title.trim() || !text.trim()) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, '0')).join('');
      if (!alive.current) return;
      const id = `demo-source-${crypto.randomUUID()}`, fragmentId = `demo-fragment-${crypto.randomUUID()}`;
      const source: Source = { id, projectId: workspace.project.id, title: title.trim(), origin: 'Текст, добавленный в демонстрации',
        publishedAt: null, retrievedAt: new Date().toISOString(), version: 1, sha256, disclosure: 'local_only' };
      update({ ...workspace, project: { ...workspace.project, version: workspace.project.version + 1 }, sources: [...workspace.sources, source],
        fragments: [...workspace.fragments, { id: fragmentId, projectId: workspace.project.id, sourceId: id, location: { kind: 'text', start: 0, end: text.length }, sha256, text, sourceVersion: 1 }] });
      onClose();
    } catch { if (alive.current) setError('Источник не добавлен. Введённый текст сохранён.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <Dialog title="Добавить вымышленный источник" onClose={onClose}><p className="muted">Только для демонстрации. Используйте вымышленные материалы. После перезагрузки они исчезнут; в backend и Codex ничего не передаётся.</p><form onSubmit={(e) => { e.preventDefault(); void save(); }}>
    <label htmlFor="source-title">Название</label><input id="source-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder="Например, план пробного дня"/>
    <label htmlFor="source-text">Текст источника</label><textarea id="source-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={128000} rows={8} required placeholder="Вставьте вымышленный текст…"/>
    <label htmlFor="source-file">Или локальный текстовый файл</label><input id="source-file" type="file" accept=".txt,.md,.pdf,.docx,.csv,.xlsx" disabled={busy} onChange={(e) => void readFile(e.target.files?.[0])}/><p className="caption">В демонстрации читаются .txt и .md до 128 КБ. Другие форматы покажут ограничение.</p>
    {error && <p role="alert" className="inline-error">{error}</p>}{busy && <p role="status" className="caption">Читаем и проверяем локальный текст…</p>}
    <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Отмена</button><button disabled={busy || !title.trim() || !text.trim()}>{busy ? 'Обработка…' : 'Добавить в демонстрацию'}</button></div>
  </form></Dialog>;
}

export function EvidenceDrawer({ workspace, reference, onClose }: { workspace: DemoWorkspace; reference: EvidenceRef; onClose: () => void }) {
  const { source, fragment, outdated } = findEvidence(workspace, reference);
  return <Dialog title="Точное основание" drawer onClose={onClose}>
    {!source || !fragment ? <EmptyState title="Фрагмент недоступен"><p>Основание не найдено в текущем проекте. Нельзя заменить его похожим текстом из другого проекта.</p></EmptyState> : <>
      <div className="document-label"><Icon name="sources"/><span>{source.title}</span></div><dl className="detail-list"><div><dt>Версия основания</dt><dd>{reference.sourceVersion}</dd></div><div><dt>Расположение</dt><dd>{locationLabel(fragment.location)}</dd></div><div><dt>Получен</dt><dd>{formatDate(source.retrievedAt)}</dd></div></dl>
      {outdated && <div className="conflict"><strong>Есть новая версия источника</strong><p>Утверждение ссылается на версию {reference.sourceVersion}. Текущая версия — {source.version}. Вывод требует пересмотра.</p></div>}
      <p className="overline spaced">ИСХОДНЫЙ ФРАГМЕНТ · ВЫМЫШЛЕННЫЙ ТЕКСТ</p><blockquote className="evidence-quote">{fragment.text}</blockquote>
      <p className="caption">Это основание утверждения, а не автоматическое доказательство его достоверности.</p>
    </>}
  </Dialog>;
}
