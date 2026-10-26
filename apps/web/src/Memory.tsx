import React, { useState } from 'react';
import type { EvidenceRef, KnowledgeEntry } from '../../../packages/contracts/src/index.ts';
import { DiffBlock, EmptyState, VerificationBadge, kindLabels } from './components.ts';
import type { DemoWorkspace } from './state.ts';
import { applyProposals, refreshProposal } from './state.ts';
import { Dialog, Icon, PageHeading, formatDate } from './ui.tsx';

export function Memory({ workspace, evidence, proposals }: { workspace: DemoWorkspace; evidence: (r: EvidenceRef) => void; proposals: () => void }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'entries' | 'history'>('entries');
  const [entry, setEntry] = useState<KnowledgeEntry | null>(null);
  const entries = workspace.entries.filter((e) => e.projectId === workspace.project.id &&
    (filter === 'all' || e.kind === filter) && e.text.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru')));
  const pending = workspace.proposals.filter((p) => p.status === 'pending' || p.status === 'conflict');
  return <><PageHeading eyebrow="ПАМЯТЬ ПРОЕКТА" title="Знать, на чём стоим" action={pending.length ? <button onClick={proposals}>Рассмотреть изменения <span className="button-count">{pending.length}</span></button> : undefined}><p>Записи, решения и гипотезы. Принятие записи и проверка достоверности — разные действия.</p></PageHeading>
    <div className="tabs" aria-label="Раздел памяти"><button aria-pressed={tab === 'entries'} onClick={() => setTab('entries')}>Записи</button><button aria-pressed={tab === 'history'} onClick={() => setTab('history')}>История изменений</button></div>
    {tab === 'entries' ? <><div className="filter-bar"><label className="search-field"><Icon name="research" size={17}/><span className="sr-only">Поиск по памяти</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти в памяти проекта"/></label><label className="select-label"><span className="sr-only">Тип записи</span><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Все типы</option>{Object.entries(kindLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      <div className="card memory-list">{entries.map((e) => <article className="memory-row" key={e.id}><div className="entry-meta"><span className="type-label">{kindLabels[e.kind]}</span><VerificationBadge value={e.verification}/>{e.disclosure === 'local_only' && <span className="caption"><Icon name="lock" size={12}/>Только локально</span>}</div><h2><button className="entry-title" onClick={() => setEntry(e)}>{e.text}</button></h2><div className="row-between"><p className="caption">{e.scope}</p>{e.evidence.length ? <button className="evidence-link" onClick={() => evidence(e.evidence[0])}><Icon name="sources" size={14}/>Основание <Icon name="chevron" size={12}/></button> : <span className="caption">Источник не приложен</span>}</div></article>)}{!entries.length && <EmptyState title={query ? 'Совпадений нет' : 'Память пока пуста'}><p>{query ? 'Измените запрос или выберите другой тип записи.' : 'Здесь появятся записи с источниками и статусами проверки.'}</p></EmptyState>}</div>
    </> : <div className="card history-list">{workspace.history.length ? workspace.history.map((h) => <article key={h.id}><span className="caption">{formatDate(h.at)}</span><h3>{h.description}</h3>{h.before !== undefined && <DiffBlock before={h.before} after={h.after ?? ''}/>}</article>) : <EmptyState title="Изменений ещё нет"><p>Принятые редакции появятся здесь с предыдущим текстом.</p></EmptyState>}</div>}
    {entry && <Dialog title={kindLabels[entry.kind]} onClose={() => setEntry(null)} drawer><VerificationBadge value={entry.verification}/><h3 className="drawer-statement">{entry.text}</h3><p className="muted">{entry.scope}</p><dl className="detail-list"><div><dt>Версия записи</dt><dd>{entry.version}</dd></div><div><dt>Доступность</dt><dd>{entry.disclosure === 'local_only' ? 'Только на этом Mac' : 'Разрешена передача Codex'}</dd></div></dl>{entry.calculation && <section className="inset"><h3>Как получен расчёт</h3><code>{entry.calculation.formula}</code><p>Единицы: {entry.calculation.units}</p><ul>{entry.calculation.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></section>}<h3>Доказательства</h3>{entry.evidence.length ? entry.evidence.map((r) => <button className="secondary" key={r.fragmentId} onClick={() => { setEntry(null); evidence(r); }}><Icon name="sources"/>Открыть точный фрагмент · v{r.sourceVersion}</button>) : <p className="muted">Источник не приложен. Эта запись не получает статус «Проверено» автоматически.</p>}</Dialog>}
  </>;
}

export function ProposalDialog({ workspace, update, onClose }: { workspace: DemoWorkspace; update: (w: DemoWorkspace) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const proposals = workspace.proposals.filter((p) => p.status === 'pending' || p.status === 'conflict');
  const invalid = proposals.some((p) => selected.includes(p.id) && (p.baseVersion !== workspace.project.version || p.status === 'conflict'));
  const accept = () => {
    const next = applyProposals(workspace, selected, new Date().toISOString());
    const applied = next.project.version !== workspace.project.version;
    update(next); setSelected([]);
    setMessage(applied ? 'Выбранные редакции приняты. Достоверность записей не изменена.' : 'Версия изменилась. Пакет не применён; пересмотрите новый diff.');
  };
  return <Dialog title="Изменения памяти" onClose={onClose}>
    <p className="muted">Сравните текст и выберите редакции. Проект сейчас на версии {workspace.project.version}. Это демонстрация; изменения не записываются в backend.</p>
    {message && <p role="status" className="notice compact">{message}</p>}
    {!proposals.length && <EmptyState title="Все изменения рассмотрены"><p>История принятых редакций доступна в памяти проекта.</p></EmptyState>}
    {proposals.map((p) => {
      const conflict = p.status === 'conflict' || p.baseVersion !== workspace.project.version;
      return <section className="proposal-card" key={p.id}><div className="row-between"><label className="checkbox-label"><input type="checkbox" checked={selected.includes(p.id)} disabled={conflict} onChange={(e) => setSelected((old) => e.target.checked ? [...old, p.id] : old.filter((x) => x !== p.id))}/>Редакция записи</label><span className="caption">Основана на v{p.baseVersion}</span></div>{p.changes.map((c) => <DiffBlock key={c.path} before={String(c.before)} after={String(c.after)}/>)}
        {conflict && <div className="conflict"><strong>Конфликт версий · предложение устарело</strong><p>Текст не будет перезаписан. Подготовьте сравнение с текущей версией и выберите изменение заново.</p><button className="secondary" onClick={() => { update(refreshProposal(workspace, p.id)); setSelected([]); setMessage('Сравнение обновлено. Проверьте его перед принятием.'); }}>Сравнить с текущей версией</button></div>}
      </section>;
    })}
    <div className="dialog-actions"><button className="secondary" onClick={onClose}>Закрыть</button><button disabled={!selected.length || invalid} onClick={accept}>Принять выбранные записи ({selected.length})</button></div>
  </Dialog>;
}
