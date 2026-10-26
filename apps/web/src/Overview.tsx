import React, { useState } from 'react';
import type { EvidenceRef, Project, Task } from '../../../packages/contracts/src/index.ts';
import { EmptyState, Unavailable, VerificationBadge } from './components.ts';
import { DEMO_PROJECT_ID, demoResearch } from './demo.ts';
import type { DemoWorkspace, Route } from './state.ts';
import { Icon, PageHeading, SectionHeading, formatDate } from './ui.tsx';

export function Overview({ project, workspace, tasks, navigate, edit, evidence, proposals, startDemo }: {
  project: Project; workspace?: DemoWorkspace; tasks: Task[]; navigate: (r: Route) => void;
  edit: () => void; evidence: (r: EvidenceRef) => void; proposals: () => void; startDemo: () => void;
}) {
  const [checked, setChecked] = useState<string[]>([]);
  const isGarden = workspace?.project.id === DEMO_PROJECT_ID;
  const decisions = workspace?.entries.filter((e) => e.kind === 'decision') ?? [];
  const pending = workspace?.proposals.filter((p) => p.status === 'pending' || p.status === 'conflict') ?? [];
  return <>
    <PageHeading eyebrow="ОБЗОР ПРОЕКТА" title={project.name} action={<button onClick={() => navigate('research')}><Icon name="plus"/>Начать исследование</button>}>
      <p>{project.goal || 'Добавьте цель, чтобы сохранять фокус проекта.'}</p>
      <div className="heading-meta"><span>Версия {project.version}</span><span>Создан {formatDate(project.createdAt)}</span><button className="text-button" onClick={edit}>Управление проектом <Icon name="chevron" size={13}/></button></div>
    </PageHeading>
    {!workspace ? <>
      <div className="focus-card"><span className="focus-icon"><Icon name="leaf" size={26}/></span><div><p className="overline">ПРОЕКТ СОЗДАН</p><h2>Контекст начинается с ясной цели</h2><p>{project.goal || 'Название сохранено на этом Mac. Цель можно задать при создании нового проекта.'}</p></div></div>
      <div className="two-column"><section className="card"><SectionHeading title="Решения и память"/><EmptyState title="Пока нет подключённой памяти"><p>Backend ещё не предоставляет записи проекта. Здесь появятся решения, вопросы и основания.</p></EmptyState></section>
        <section className="card"><SectionHeading title="Сохранённые задачи" action={<button className="text-button" onClick={() => navigate('tasks')}>Открыть <Icon name="arrow" size={16}/></button>}/><p className="muted">{tasks.length ? `Задач в этом проекте: ${tasks.length}. Результаты загружены с локального сервера.` : 'Пока нет задач. Можно выполнить проверку Codex на вымышленном тексте.'}</p><button className="secondary" onClick={() => navigate('tasks')}>Проверить Codex</button></section></div>
      <Unavailable title="Посмотрите будущий рабочий процесс">Память, источники и исследования можно изучить на вымышленном примере. <button className="inline-button" onClick={startDemo}>Открыть демонстрацию</button></Unavailable>
    </> : <>
      <div className="focus-card"><span className="focus-icon"><Icon name="leaf" size={28}/></span><div className="focus-main"><p className="overline">СЕЙЧАС ВАЖНО</p><h2>{isGarden ? 'Проверить интерес, прежде чем вкладываться' : 'Сформулировать первый проверяемый вопрос'}</h2><p>{isGarden ? 'Разовый интерес уже есть. Готовность возвращаться каждую неделю ещё предстоит проверить.' : project.goal}</p></div><div className="focus-decision"><span className="overline">БЛИЖАЙШЕЕ РЕШЕНИЕ</span><p>{isGarden ? 'Какой формат попробовать первым?' : 'С чего начать проверку?'}</p><button className="text-button" onClick={() => navigate('research')}>Разобраться <Icon name="arrow" size={16}/></button></div></div>
      <div className="two-column overview-grid"><section className="card"><SectionHeading title="Текущая картина" action={<button className="text-button" onClick={() => navigate('memory')}>Вся память <Icon name="arrow" size={15}/></button>}/>
        {workspace.entries.length ? <div className="picture-list">{workspace.entries.slice(0, 2).map((e) => <article key={e.id}><VerificationBadge value={e.verification}/><p>{e.text}</p>{e.evidence[0] && <button className="evidence-link" onClick={() => evidence(e.evidence[0])}><Icon name="sources" size={14}/>Посмотреть основание</button>}</article>)}</div> : <EmptyState title="Картина ещё не сложилась"><p>Начните с источника или запишите гипотезу.</p></EmptyState>}
      </section><section className="card"><SectionHeading title="Следующие действия" detail="Небольшие шаги к ближайшему решению"/>
        {isGarden ? <div className="action-list">{['Поговорить с пятью соседями', 'Согласовать место для пробного дня', 'Узнать стоимость расходных материалов'].map((text, i) => <label key={text} className={`action-check ${checked.includes(text) ? 'done' : ''}`}><input type="checkbox" checked={checked.includes(text)} onChange={(e) => setChecked((old) => e.target.checked ? [...old, text] : old.filter((x) => x !== text))}/><span>{text}<small>{['Проверить готовность прийти ещё раз', 'До приглашения участников', 'Пока нет подтверждённой оценки'][i]}</small></span></label>)}</div> : <p className="muted">Добавьте первые материалы, чтобы определить действия.</p>}
        {isGarden && <p className="caption card-footnote">Отметки в демонстрации сохраняются до смены экрана.</p>}
      </section></div>
      {isGarden && <section className="card research-summary"><div className="research-mark"><Icon name="research" size={22}/></div><div><p className="overline">ПОСЛЕДНИЙ РАЗБОР · ПРИМЕР РЕЗУЛЬТАТА</p><h2>{demoResearch.recommendation}</h2><p>Две инициативы, основания и неизвестные. Без рейтинга на неполных данных.</p><div className="inline-tags"><span>Пробный день</span><span>Регулярные встречи</span><span className="muted">Вывод не проверен</span></div></div><button className="secondary" onClick={() => navigate('result')}>Открыть результат <Icon name="arrow" size={16}/></button></section>}
      <div className="two-column"><section className="card"><SectionHeading title="Принятые решения"/>{decisions.length ? decisions.map((e) => <div className="decision-item" key={e.id}><span className="decision-check" aria-hidden="true">✓</span><div><p>{e.text}</p><span className="caption">Принято в проект · достоверность отдельно</span></div></div>) : <p className="muted">Решений пока нет.</p>}</section>
        <section className="card"><SectionHeading title="Требует внимания"/>{pending.length ? <><button className="attention-row" onClick={proposals}><span className="attention-icon">!</span><span><strong>{pending.length} изменения памяти</strong><small>Сравните версии перед принятием</small></span><Icon name="chevron" size={16}/></button><p className="caption">{workspace.history[0]?.description}</p></> : <p className="muted">Новых предложений нет.</p>}{isGarden && <div className="open-question"><span className="overline">ОТКРЫТЫЙ ВОПРОС</span><p>Кто готов разделить регулярный уход?</p><span className="caption">Ответа пока нет — это не отрицательная оценка.</span></div>}</section></div>
    </>}
  </>;
}
