# Координация четырёх чатов

Lead: apps/server, packages/memory, packages/codex-bridge, packages/mcp,
packages/contracts, root manifest/lockfile, общие конфиги и миграции.
UI: apps/web, docs/ux. Research: packages/research, docs/research.
QA: tests/e2e, tests/security, tests/evals, docs/qa.
Каждый владеет своим docs/handoffs/<role>.md.

После подтверждённой публикации Lead сообщает **один окончательный bootstrap
SHA main**. Он является исходной точкой всех ролей. SHA находится в итоговом
сообщении Lead и истории main; документ не содержит собственного хеша.
До этой точки соседние чаты не начинают работу.

Создайте отдельный worktree-чат от main на указанном SHA. Ветки:
`codex/research`, `codex/ui`, `codex/qa`. Если создан detached HEAD,
в соответствующем worktree выполните, например:

```sh
git switch -c codex/research
```

Для UI/QA замените имя. Если ветка уже существует, не перезаписывайте её:
проверьте историю и согласуйте с Lead. Не переключайте чужой worktree.
Не полагайтесь на перенос незакоммиченных файлов: ориентир — общий commit.

## Команды и зависимости

Один `npm ci --ignore-scripts --no-audit --no-fund` в каждом worktree.
Доступны npm test, npm run build, npm run typecheck, npm run test:ui,
npm run test:research, npm run test:qa. Node test runner работает с TS/MJS;
React/Vite установлены. Отсутствие тестов research не означает его приёмку.
Новые зависимости, contracts и миграции — запрос Lead через handoff;
root lockfile другие роли не меняют.

Не коммитить в main и не мержить соседние роли. Каждый завершает работу
проверенным коммитом: SHA, файлы, команды, фактические результаты, ограничения,
запросы Lead. Общей памяти чатов не предполагается.

По указанию владельца публикация выполняется через личный GitHub во встроенном
браузере. Рабочая локальная GitHub-авторизация не используется. gh не требуется
для запуска приложения; локально скачанный инструмент не публикуется.
