import React, { useEffect, useRef, useState } from 'react';
import type { AtelierApi, BackendStatus } from './api.ts';
import { explainError } from './api.ts';
import { StatusBadge, Unavailable } from './components.ts';
import { Icon, PageHeading, SectionHeading } from './ui.tsx';

export function Settings({ status, api, demo, health, refresh }: { status: BackendStatus | null; api: AtelierApi; demo: boolean;
  health: 'loading' | 'ready' | 'offline' | 'session' | 'error'; refresh: () => void }) {
  const [paid, setPaid] = useState(false), [topup, setTopup] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const confirm = async () => {
    if (lock.current || demo || !paid || !topup) return;
    lock.current = true; setBusy(true); setError('');
    try { await api.confirmBilling(); if (alive.current) { setMessage('Ваше подтверждение сохранено. Обновляем состояние сервера.'); refresh(); } }
    catch (e) { if (alive.current) setError(explainError(e)); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const diagnostic = async () => {
    const text = JSON.stringify({ application: 'ai-atelier', mode: demo ? 'demo' : 'live', backend: demo ? 'not_checked' : health,
      contracts: demo ? 'not_checked' : status?.contractsVersion ?? 'unknown', codexAuth: 'unknown', codexLimits: 'unknown',
      liveWebSearch: 'not_verified', features: demo ? undefined : status?.features }, null, 2);
    try { await navigator.clipboard.writeText(text); setMessage('Краткая диагностика скопирована. Секреты и пути в неё не включены.'); }
    catch { setMessage('Буфер обмена недоступен. Повторите в браузере с доступом к копированию.'); }
  };
  return <><PageHeading eyebrow="НАСТРОЙКИ" title="Прозрачно и под вашим контролем"><p>Данные хранятся на этом Mac. Только выбранный и одобренный контекст может обрабатываться Codex.</p></PageHeading>
    {demo && <Unavailable title="Настройки настоящего подключения здесь не меняются">Вернитесь к своим проектам, чтобы проверить backend и подтвердить настройки расходов.</Unavailable>}
    <section className="card settings-section"><SectionHeading title="Локальная мастерская" action={<button className="secondary" disabled={demo || busy} onClick={refresh}>Обновить состояние</button>}/><div className="settings-row"><div><strong>Локальный backend</strong><p>Соединение с сервером приложения</p></div><span className={`connection-label ${!demo && health === 'ready' ? 'is-ready' : ''}`}>{demo ? 'Не проверяется в демонстрации' : { loading: 'Проверяем…', ready: 'Сервер отвечает', offline: 'Нет связи', session: 'Нужен локальный сеанс', error: 'Ошибка проверки' }[health]}</span></div><div className="settings-row"><div><strong>Авторизация Codex</strong><p>Backend пока не передаёт статус авторизации в интерфейс.</p></div><StatusBadge status="unknown"/></div><div className="settings-row"><div><strong>Лимиты Codex</strong><p>Остаток и время сброса не получены. Неизвестный лимит не означает безлимит.</p></div><span className="neutral-label">Неизвестны</span></div><div className="settings-row"><div><strong>Интернет-поиск</strong><p>Live web search не подтверждён. Реальные поисковые источники не отображаются.</p></div><StatusBadge status="unknown"/></div><div className="inset"><h3>Официальный вход</h3><p>Вход выполняется в официальном локальном Codex через ChatGPT. Подключение входа из мастерской ещё не реализовано.</p><button className="secondary" disabled aria-describedby="login-reason">Войти через ChatGPT</button><p id="login-reason" className="caption">Недоступно: backend не предоставляет действие входа. Пароли и ключи мастерской не нужны.</p></div></section>
    <section className="card settings-section"><SectionHeading title="Контроль расходов" detail="Ручное подтверждение действует 24 часа; приложение не проверяет настройки аккаунта автоматически."/>
      {!demo && status?.billing.verifiedByUser ? <div className="notice compact"><Icon name="check"/><p>Вы подтвердили отключённое платное продолжение и автопополнение. Это подтверждение пользователя, а не проверка аккаунта.</p></div> : <><p>Проверьте две настройки в аккаунте ChatGPT перед модельным запуском.</p><label className="checkbox-label"><input type="checkbox" checked={paid} disabled={demo} onChange={(e) => setPaid(e.target.checked)}/>Автоматическое платное продолжение отключено</label><label className="checkbox-label"><input type="checkbox" checked={topup} disabled={demo} onChange={(e) => setTopup(e.target.checked)}/>Автопополнение кредитов отключено</label><button disabled={demo || busy || !paid || !topup || health !== 'ready'} onClick={() => void confirm()}>{busy ? 'Сохраняем…' : 'Сохранить моё подтверждение'}</button></>}
      {error && <p role="alert" className="inline-error">{error}</p>}
    </section>
    <div className="two-column"><section className="card settings-section"><SectionHeading title="Модель и роли"/><label htmlFor="model-select">Модель</label><select id="model-select" disabled aria-describedby="model-reason"><option>Каталог моделей не получен</option></select><p id="model-reason" className="caption">Backend не предоставляет каталог и настройки модели. Недоступные модели не предлагаются.</p><h3 className="spaced">Профили ролей</h3><p className="muted">Планирование, исследование, анализ, проверка и редактура — будущие этапы. Редактирование профилей ещё не подключено.</p><button className="secondary" disabled>Настроить роли</button><p className="caption">Нужен общий API профилей от интегратора.</p></section>
      <section className="card settings-section"><SectionHeading title="Данные и восстановление"/><h3>Директория данных</h3><p className="muted">Назначается локальным сервером вне Git. Backend пока не предоставляет просмотр и смену директории.</p><div className="button-row"><button className="secondary" disabled>Резервная копия</button><button className="secondary" disabled>Восстановить</button></div><p className="caption">Недоступно: API резервного копирования и восстановления ещё не реализован.</p><h3 className="spaced">Ограничения запусков</h3><p className="muted">Один исполнитель, до 20 задач в очереди, 150 секунд на задачу. Автоматических повторов нет.</p><p className="caption">Фиксированные ограничения текущего Bootstrap. Изменение из интерфейса недоступно.</p></section></div>
    <section className="card settings-section"><SectionHeading title="Диагностика" detail="Краткое состояние без токенов, email, путей и пользовательского содержимого." action={<button className="secondary" onClick={() => void diagnostic()}><Icon name="copy" size={16}/>Скопировать диагностику</button>}/>{message && <p role="status" className="caption">{message}</p>}</section>
  </>;
}
