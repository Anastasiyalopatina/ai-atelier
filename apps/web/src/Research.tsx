import React, { useEffect, useRef, useState } from 'react';
import type { ContextSnapshot, EvidenceRef, ResearchRequest } from '../../../packages/contracts/src/index.ts';
import { EmptyState, Unavailable, VerificationBadge } from './components.ts';
import { DEMO_PROJECT_ID, demoResearch, initiativeNames } from './demo.ts';
import type { DemoWorkspace } from './state.ts';
import { buildContext } from './state.ts';
import { Dialog, Icon, PageHeading, SectionHeading } from './ui.tsx';

export interface ResearchDraft {
  scenario: ResearchRequest['scenario']; decision: string; initiatives: string[]; sources: string[];
  depth: 'short' | 'standard' | 'deep'; maxRuns: string;
}
export function newResearchDraft(workspace?: DemoWorkspace): ResearchDraft {
  return { scenario: 'new_research', decision: workspace?.project.id === DEMO_PROJECT_ID ? 'Какой формат проверить первым: пробный день или регулярные встречи?' : '',
    initiatives: ['demo-i1', 'demo-i2'], sources: workspace?.sources.filter((s) => s.disclosure !== 'local_only').map((s) => s.id) ?? [], depth: 'short', maxRuns: '1' };
}
export function Research({ workspace, draft, setDraft, openResult }: { workspace: DemoWorkspace; draft: ResearchDraft; setDraft: (draft: ResearchDraft) => void; openResult: () => void }) {
  const [preview, setPreview] = useState<ContextSnapshot | null>(null);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const isGarden = workspace.project.id === DEMO_PROJECT_ID;
  const selectedSourceIds = workspace.sources.filter((s) => s.disclosure !== 'local_only' && draft.sources.includes(s.id)).map((s) => s.id);
  const valid = !!draft.decision.trim() && draft.initiatives.length >= 2 && draft.initiatives.length <= 3 && selectedSourceIds.length > 0;
  const prepare = async () => {
    if (lock.current || !valid) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const contextWorkspace = { ...workspace, sources: workspace.sources.map((s) => selectedSourceIds.includes(s.id) ? s : { ...s, disclosure: 'local_only' as const }) };
      const snapshot = await buildContext(contextWorkspace, 'full', new Date().toISOString(), draft.decision);
      if (alive.current) { setPreview(snapshot); setApproved(false); }
    } catch { if (alive.current) setError('Не удалось подготовить контекст. Поля формы сохранены.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <><PageHeading eyebrow="ИССЛЕДОВАНИЕ" title="От вопроса к следующему шагу"><p>Сначала определите решение. Затем — что стоит сравнить и на какие материалы опереться.</p></PageHeading>
    {!isGarden ? <div className="card"><EmptyState title="Исследований ещё нет"><p>В этом проекте нет исследовательского примера. Выберите «Лунный сад», чтобы посмотреть весь сценарий на вымышленных данных.</p></EmptyState></div> : <>
      <Unavailable title="Демонстрация постановки исследования">Модель не вызывается. После предпросмотра можно открыть заранее подготовленный пример результата; он не будет учитывать изменения этой формы.</Unavailable>
      <form className="research-form" onSubmit={(e) => { e.preventDefault(); void prepare(); }}>
        <section className="card"><div className="step-heading"><span>01</span><h2>Какое решение принимаем?</h2></div><div className="scenario-choice"><label className={draft.scenario === 'new_research' ? 'selected' : ''}><input type="radio" name="scenario" value="new_research" checked={draft.scenario === 'new_research'} onChange={() => setDraft({ ...draft, scenario: 'new_research' })}/><Icon name="research"/><span><strong>Новое исследование</strong><small>Сопоставить варианты и найти пробелы</small></span></label><label className={draft.scenario === 'analyze_report' ? 'selected' : ''}><input type="radio" name="scenario" value="analyze_report" checked={draft.scenario === 'analyze_report'} onChange={() => setDraft({ ...draft, scenario: 'analyze_report' })}/><Icon name="sources"/><span><strong>Разобрать отчёт</strong><small>Проверить выводы по материалам</small></span></label></div>
          <label htmlFor="research-question">Вопрос и решение</label><textarea id="research-question" rows={3} maxLength={2000} required value={draft.decision} onChange={(e) => setDraft({ ...draft, decision: e.target.value })}/><p className="caption">Что вы сделаете иначе, когда получите ответ?</p>
        </section><div className="two-column"><section className="card"><div className="step-heading"><span>02</span><h2>Что сравниваем?</h2></div><p className="muted">Выберите 2–3 инициативы.</p><div className="choice-list">{Object.entries(initiativeNames).map(([id, name]) => <label className="checkbox-label" key={id}><input type="checkbox" checked={draft.initiatives.includes(id)} onChange={(e) => setDraft({ ...draft, initiatives: e.target.checked ? [...draft.initiatives, id] : draft.initiatives.filter((x) => x !== id) })}/><span>{name}</span></label>)}</div>{draft.initiatives.length < 2 && <p className="inline-error">Нужны хотя бы две инициативы для сравнения.</p>}</section>
          <section className="card"><div className="step-heading"><span>03</span><h2>На что опираемся?</h2></div><p className="muted">Только выбранные материалы и допустимые записи памяти.</p><div className="choice-list">{workspace.sources.map((s) => <label className="checkbox-label" key={s.id}><input type="checkbox" disabled={s.disclosure === 'local_only'} checked={s.disclosure !== 'local_only' && draft.sources.includes(s.id)} onChange={(e) => setDraft({ ...draft, sources: e.target.checked ? [...draft.sources, s.id] : draft.sources.filter((x) => x !== s.id) })}/><span>{s.title}<small>{s.disclosure === 'local_only' ? 'Исключён: только локально' : `Версия ${s.version}`}</small></span></label>)}</div></section></div>
        <section className="card"><div className="step-heading"><span>04</span><h2>Глубина и границы</h2></div><div className="two-column"><div><label htmlFor="research-depth">Глубина</label><select id="research-depth" value={draft.depth} onChange={(e) => setDraft({ ...draft, depth: e.target.value as ResearchDraft['depth'] })}><option value="short">Кратко · ключевые основания и пробелы</option><option value="standard">Подробно · сравнение и проверка</option><option value="deep">Глубоко · отдельная проверка допущений</option></select></div><div><label htmlFor="research-runs">Максимум запусков</label><select id="research-runs" value={draft.maxRuns} onChange={(e) => setDraft({ ...draft, maxRuns: e.target.value })}><option value="1">1 · без автоматического повтора</option></select></div></div><p className="caption spaced">Это настройки будущего сценария. Каталог моделей и остаток лимита backend пока не передаёт. Live web search не подтверждён.</p></section>
        {error && <p role="alert" className="inline-error">{error}</p>}<div className="form-footer"><p className="caption">Ничего не отправляется без предпросмотра и согласия.</p><button disabled={!valid || busy}><Icon name="context"/>{busy ? 'Готовим контекст…' : 'Предпросмотр контекста'}</button></div>
      </form>
    </>}
    {preview && <Dialog title="Перед открытием примера" onClose={() => setPreview(null)}><p>Показан реальный состав подготовленного демонстрационного контекста. Передачи в Codex не будет.</p><dl className="detail-list"><div><dt>Задача</dt><dd>{preview.task}</dd></div><div><dt>Инициативы</dt><dd>{draft.initiatives.map((id) => initiativeNames[id]).join(', ')}</dd></div><div><dt>Версия проекта</dt><dd>{preview.projectVersion}</dd></div><div><dt>Исключено</dt><dd>{preview.excludedCount} записей и источников</dd></div></dl><details><summary>Посмотреть точный JSON</summary><pre className="context-code">{JSON.stringify(preview, null, 2)}</pre></details><label className="checkbox-label spaced"><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)}/>Открыть подготовленный пример. Понимаю, что он не является новым исследованием.</label><div className="dialog-actions"><button className="secondary" onClick={() => setPreview(null)}>Назад к вопросу</button><button disabled={!approved} onClick={openResult}>Открыть пример результата <Icon name="arrow" size={16}/></button></div></Dialog>}
  </>;
}

export function ResearchResultPage({ evidence, back }: { evidence: (r: EvidenceRef) => void; back: () => void }) {
  const result = demoResearch;
  return <><button className="text-button back-link" onClick={back}>← К исследованиям</button><PageHeading eyebrow="РЕЗУЛЬТАТ · ВЫМЫШЛЕННЫЙ ПРИМЕР" title="Сначала — один пробный день"><p>Сравнение двух инициатив для «Лунного сада». Это подготовленный пример, интернет-поиск не выполнялся.</p></PageHeading>
    <section className="recommendation"><div className="recommendation-label"><Icon name="leaf" size={20}/><span className="overline">РЕКОМЕНДАЦИЯ</span><VerificationBadge value={result.verification}/></div><h2>{result.recommendation}</h2><ul>{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><button className="evidence-link" onClick={() => evidence(result.initiatives[0].evidence[0])}>На чём основан вывод <Icon name="arrow" size={15}/></button></section>
    <section className="card comparison"><SectionHeading title="Два варианта — одна шкала вопросов" detail="Оценок в баллах нет: данных для рейтинга недостаточно."/><div className="table-scroll" tabIndex={0} role="region" aria-label="Сравнение инициатив"><table><caption className="sr-only">Сопоставление пробного дня и регулярных встреч</caption><thead><tr><th scope="col">Критерий</th>{result.initiatives.map((i) => <th scope="col" key={i.id}>{initiativeNames[i.id]}</th>)}</tr></thead><tbody>{[
      ['Кому помогает', ...result.initiatives.map((i) => i.consumer)], ['Кто платит', ...result.initiatives.map((i) => i.payer)],
      ['Механизм ценности', ...result.initiatives.map((i) => i.valueMechanism)], ['Данных достаточно?', 'Только первичный интерес к одному визиту', 'Нет данных о регулярном участии'],
      ['Первый эксперимент', ...result.initiatives.map((i) => i.mvpExperiment)],
    ].map(([label, ...values]) => <tr key={label}><th scope="row">{label}</th>{values.map((v, index) => <td key={index}>{v}</td>)}</tr>)}</tbody></table></div></section>
    {result.initiatives.map((i) => <details className="card initiative-details" key={i.id}><summary><span><span className="overline">ИНИЦИАТИВА</span><strong>{initiativeNames[i.id]}</strong></span><span className="caption">Метрики, экономика, риски и основания</span></summary><div className="two-column details-content"><section><h3>Метрика и контрметрики</h3><ul>{i.metrics.map((m) => <li key={m}>{m}</li>)}</ul><p className="caption">Следим за побочными эффектами:</p><ul>{i.counterMetrics.map((m) => <li key={m}>{m}</li>)}</ul><h3>Экономика</h3><p>{i.economics.formula}</p><ul>{i.economics.assumptions.map((a) => <li key={a}>{a}</li>)}</ul><p className="caption">Численные входы пока не собраны.</p><h3>Аналоги и объём проверки</h3><p>{i.internalCheckScope}</p><ul>{[...i.internalAlternatives, ...i.marketAlternatives].map((a) => <li key={a}>{a}</li>)}</ul></section><section><h3>Продолжить / изменить / остановить</h3><dl className="criteria"><dt>Продолжить</dt><dd>{i.continueCriteria.join(' ')}</dd><dt>Изменить</dt><dd>{i.changeCriteria.join(' ')}</dd><dt>Остановить</dt><dd>{i.stopCriteria.join(' ')}</dd></dl><h3>Риски и неизвестное</h3><ul>{[...i.risks, ...i.unknowns].map((u) => <li key={u}>{u}</li>)}</ul><p className="caption">{i.dataQualityAndUsageLimits}</p><h3>Основания</h3>{i.evidence.length ? i.evidence.map((r, index) => <button className="evidence-link evidence-row" key={r.fragmentId} onClick={() => evidence(r)}><Icon name="sources" size={15}/>Фрагмент {index + 1} · версия {r.sourceVersion}<Icon name="chevron" size={12}/></button>) : <p className="muted">Нет данных. Это не доказательство отсутствия интереса или аналогов.</p>}</section></div></details>)}
    <section className="card"><SectionHeading title="Что сделать дальше"/><ol className="numbered-actions">{result.initiatives[0].nextActions.map((a) => <li key={a}>{a}</li>)}</ol><p className="caption">Изменения памяти не применяются автоматически.</p></section>
  </>;
}
