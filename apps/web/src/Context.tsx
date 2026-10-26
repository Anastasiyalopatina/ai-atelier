import React, { useEffect, useState } from 'react';
import type { ContextSnapshot } from '../../../packages/contracts/src/index.ts';
import type { ContextScope, DemoWorkspace } from './state.ts';
import { buildContext, contextMarkdown } from './state.ts';
import { Icon, PageHeading, formatDate } from './ui.tsx';

export function Context({ workspace }: { workspace: DemoWorkspace }) {
  const [scope, setScope] = useState<ContextScope>('brief');
  const [format, setFormat] = useState<'markdown' | 'json'>('markdown');
  const [snapshot, setSnapshot] = useState<ContextSnapshot | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let alive = true; setSnapshot(null); setMessage('');
    void buildContext(workspace, scope, new Date().toISOString()).then((value) => { if (alive) setSnapshot(value); })
      .catch(() => { if (alive) setMessage('Предпросмотр не подготовлен. Экспорт недоступен; попробуйте изменить объём.'); });
    return () => { alive = false; };
  }, [workspace, scope]);
  const content = snapshot ? format === 'json' ? JSON.stringify(snapshot, null, 2) : contextMarkdown(snapshot) : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(content); setMessage('Контекст скопирован. В Codex ничего не отправлено.'); }
    catch { setMessage('Копирование недоступно. Выделите текст предпросмотра или скачайте файл.'); }
  };
  const download = () => {
    if (!snapshot) return;
    const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `ai-atelier-demo-context-v${snapshot.projectVersion}.${format === 'json' ? 'json' : 'md'}`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Подготовлен файл с демонстрационным контекстом.');
  };
  return <><PageHeading eyebrow="ПЕРЕДАЧА КОНТЕКСТА" title="Продолжить с ясной отправной точки"><p>Выберите объём, проверьте состав и передайте контекст в новый чат вручную.</p></PageHeading>
    <div className="context-layout"><aside className="card context-controls"><h2>Что включить</h2><fieldset><legend className="sr-only">Объём контекста</legend>{[
      ['brief', 'Кратко', 'Решения и две ключевые записи'], ['full', 'Полнее', 'Все доступные записи и их источники'], ['decisions', 'Только решения', 'Принятые решения и ограничения'],
    ].map(([value, title, description]) => <label className="context-scope" key={value}><input type="radio" name="context-scope" value={value} checked={scope === value} onChange={() => setScope(value as ContextScope)}/><span><strong>{title}</strong><small>{description}</small></span></label>)}</fieldset><div className="exclusion-note"><Icon name="lock" size={17}/><p>Материалы «только локально» и записи, ссылающиеся на них, исключены. Неиспользованные источники тоже не попадут в файл.</p></div><p className="caption">Это экспорт вымышленного примера. Экспорт настоящей памяти ещё не подключён.</p></aside>
      <section className="card context-preview"><div className="section-heading"><h2>Предпросмотр</h2><div className="segmented" aria-label="Формат контекста"><button aria-pressed={format === 'markdown'} onClick={() => { setFormat('markdown'); setMessage(''); }}>Markdown</button><button aria-pressed={format === 'json'} onClick={() => { setFormat('json'); setMessage(''); }}>JSON</button></div></div><div className="context-meta"><span>Проект v{snapshot?.projectVersion ?? '…'}</span><span>{snapshot ? formatDate(snapshot.createdAt) : 'Подготовка…'}</span><span>Исключено: {snapshot?.excludedCount ?? '…'}</span></div><pre className="context-code" tabIndex={0} aria-label="Точный текст экспорта">{content || 'Подготовка предпросмотра…'}</pre><div className="export-actions"><button className="secondary" disabled={!snapshot} onClick={() => void copy()}><Icon name="copy" size={16}/>Копировать</button><button disabled={!snapshot} onClick={download}><Icon name="context" size={16}/>Скачать {format === 'json' ? 'JSON' : 'Markdown'}</button></div>{message && <p role="status" className="caption">{message}</p>}</section></div>
  </>;
}
