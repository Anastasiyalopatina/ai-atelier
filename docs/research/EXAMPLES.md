# Синтетические примеры

Все данные в `packages/research/tests/fixtures.mjs` вымышлены. Чтобы посмотреть
полный валидный вход и результат двух сценариев без модели:

```sh
node --input-type=module <<'JS'
import { research, renderMarkdown } from './packages/research/src/index.ts';
import { makeFixture, ScriptedQueue } from './packages/research/tests/fixtures.mjs';
for (const scenario of ['analyze_report', 'new_research']) {
  const fixture = makeFixture(scenario);
  const result = await research(fixture.input, new ScriptedQueue(fixture));
  console.log(JSON.stringify(fixture.input, null, 2));
  console.log(renderMarkdown(result));
}
JS
```

Это пример транспорта с заранее заданными ответами, **не семантическая оценка**.
Он не запускает Codex, не пишет файлы и не подтверждает доступность модели.

Ключевые поля входа (сокращение, не самостоятельный валидный JSON):

```json
{
  "request": {
    "schemaVersion": 1, "projectId": "moon", "scenario": "analyze_report",
    "decision": "Какой из двух пилотов проверять первым?",
    "initiativeIds": ["journal", "assistant"],
    "context": { "projectVersion": 3, "constraints": ["Без персональных данных"] }
  },
  "sourceStates": [{ "status": "content_retrieved", "access": "ok" }],
  "settings": { "summaryWordLimit": 500 }
}
```

Результат контрольного примера: 5 вызовов адаптера; 1 collector; одна находка
о ручном учёте одного вымышленного садовника; 2 инициативы; неизвестные спрос,
плательщик и экономика; интервью как следующий шаг; `verification: unverified`;
pending proposal от `baseVersion: 3`; `model: performed_unverified`;
`userAcceptance: pending`. Рекомендация — проверить задачу интервью и ручным
прототипом, а не утверждать существование рынка. Evidence раскрывает конкретный
исходный текст, locator, version, hash и отдельный результат проверки цитаты.

Критические ошибки возвращают `ResearchError.code` без исходного содержимого:
STALE_INPUT, LOCAL_ONLY_INPUT, INVALID_SCHEMA, CONTEXT_BUDGET_EXCEEDED,
FINDING_BUDGET_EXHAUSTED, CANCELLED, MODEL_TIMEOUT, RUNTIME_FAILED.
Недостоверные/неполные находки дают issues, needs_review/disputed и конфликтное
предложение. Ни один путь не принимает изменение памяти автоматически.
