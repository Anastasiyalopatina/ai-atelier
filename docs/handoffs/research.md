# Research → Lead

Дата: 26 октября 2026, Москва. Bootstrap:
`9d4a992227b682f92b665fcae9c0bb7b0e52a2a2`.
Отдельный worktree, ветка `codex/research`. Итоговый SHA — в отчёте чата и
истории ветки: документ входит в этот commit и не может содержать свой хеш.

## Реализовано

Два сценария `research(input, runtime, {signal})`: разбор отчёта и новое
сравнение 2–3 инициатив. Версия пакета/шаблонов 1.0.0. Planner, bounded collector,
analyst, отдельный reviewer, editor с выбором существующего текста и финальная
проверка. Сопоставимые карточки, evidence/история/пробелы, классифицированные
действия, предложения памяти. Ограничения бюджета, отмена, timeout и отсутствие
автоповторов. Реальные очередь, модель, поиск и хранение не подменяются.

Source/version/chunk IDs, input approval digest, проверка disclosure/проектов,
фрагментных хешей и локаторов, ссылочной целостности, буквальных цитат,
перепечаток, дат/устаревания/версий, обязательных блоков, неподтверждённых чисел,
конфликтов и единиц. Арифметика через ограниченную postfix-программу, без eval.
Формула в proposal/result восстанавливается из выполняемых операций.

Изменения только `packages/research/**`, `docs/research/**` и этот handoff.
Общие contracts/backend/UI/migrations/manifest/lockfile не изменены;
новых зависимостей нет. Явный allowlist всех 22 файлов роли —
`docs/research/PUBLIC_FILES.txt`; новые материалы и fixtures только вымышленные.

## Контракт и примеры

Общие contracts 1.0.0 / schema 1 используются без изменения. Вход включает
`ResearchRequest`, sources/fragments/sourceStates/reportFragmentIds/settings
и одобрение полного входа `approvedInputSha256`. Фрагменты расширены локальным
`sourceVersion`. Выход — расширенный `ResearchArtifact` плюс совместимый
`ResearchResult`. Полные типы — `packages/research/src/types.ts`, схемы этапов
там же; inputSchema — `integrity.ts`. Примеры и исполняемый синтетический
пример обоих сценариев — `docs/research/EXAMPLES.md`.

Один общий `RuntimePort` пока не вмещает stage payload/schema. Локальное
расширение `ResearchRuntimePort` требует явный protocol marker, принимает
исходные context/hash/role/signal плюс `research` envelope с template/hash,
payload, JSON Schema, input hash и требованием fresh context. Не передавать
старый bootstrap runtime с принудительным cast: он не исполняет этот договор.

Pending/conflict `ChangeProposal` содержат baseVersion. Существующее решение
не перезаписывается даже в предлагаемом diff: review хранит исходную запись
и требует отдельного пользовательского решения. Локальные пути
`/research/findings` и `/research/review` нуждаются в согласовании с Lead.
Они не являются реализованным API записи памяти. `rebaseProposals` отмечает
устаревшую версию; атомарную проверку project/version и принятие делает backend.

## Фактически выполнено

- `npm ci --ignore-scripts --no-audit --no-fund`: успешно, lockfile не изменён.
- `npm run test:research`: 35 тестов, все пройдены, без реальной модели.
- `npm run typecheck` и `npm run build`: успешно.
- `npm test`: 13 существующих smoke/security тестов пройдены; для HTTP
  разрешён локальный loopback, модель и внешняя сеть не использованы.
- Проверка allowlist/секретов, рабочего дерева, staged diff и полной истории
  выполняется `node packages/research/scripts/check-publication.mjs` перед commit.
  Корневой scanner пока знает только bootstrap allowlist и не подходит для
  новых файлов роли до изменения его списка интегратором.

## Не выполнено и ограничения

Модельная семантическая оценка и пользовательская приёмка не выполнены.
Причина: действующая общая очередь пока принимает только bootstrap-текст,
а не RuntimePort research. Ни scripted critic, ни 35 автотестов не доказывают
правильность смысловой поддержки или устойчивость модели к prompt injection.
Рубрика 11 синтетических случаев и ручной runner через переданный адаптер —
`packages/research/benchmark`; порядок проверки — `docs/research/EVALUATION.md`.

Ни поиск, ни получение URL в пакете не реализованы. Новое исследование работает
с предоставленным набором доказательств и честно оставляет неизвестное.
Проверка цитаты буквальная; verification никогда не становится verified.
Даты/полные source hashes и линии происхождения считаются метаданными
интегратора, смысл подтверждений и разрешений требует человека. Эвристики
неподтверждённых чисел, отсутствия аналогов и причинности неполны.
Редактор не перефразирует; если выбрать резюме до лимита не удалось,
возвращается SUMMARY_LIMIT_EXCEEDED. Весь анализ и существенные риски не обрезаются.

## Запросы Lead

1. Подключить stage-aware адаптер к одной общей очереди; сохранить auth/billing,
   cancellation/turn shutdown, persistence, fresh threads и запрет платного fallback.
   Полный договор и размеры envelope — `docs/research/README.md`.
2. Согласовать расширение общих contracts: versioned fragments, source access/
   origin states, типы claims/metrics/actions/calculations, StageRequest и
   расширенный ResearchArtifact. Пока они локальны; schema 1 не изменена.
3. Добавить безопасный отбор источников/предпросмотр полного входа и approve
   digest; не передавать local_only. Очередь Bootstrap ограничена 12 000
   символами: большой артефакт отклоняется до отправки, требует адресной
   выборки/нового согласия или отдельно согласованного изменения лимита Lead.
4. Согласовать модель proposal с CRUD памяти и atomic project/version CAS;
   подключить ручное принятие. Общий economics v1 теряет часть единиц входов:
   расширенный артефакт должен сохраняться целиком вне Git.
5. Включить allowlist роли в общий PUBLIC_FILES.txt и test:research в общую
   проверку/будущий CI. Ничего не мержить автоматически. После подключения
   провести реальную семантическую оценку и пользовательскую приёмку.

Публикация: рабочая локальная GitHub-авторизация не используется. Для личного
репозитория применяется встроенный браузер; состояние ветки и точный SHA
фиксируются в итоговом сообщении после проверки результата.
