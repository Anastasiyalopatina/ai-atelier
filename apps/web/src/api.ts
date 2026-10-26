import type { Project, Task } from '../../../packages/contracts/src/index.ts';
import { validateBootstrapResult } from '../../../packages/contracts/src/index.ts';

// HTTP envelopes for existing endpoints; domain entities come from contracts.
// Move these envelopes to shared contracts when Lead exposes the full API.
export interface BackendStatus {
  application: 'ai-atelier'; contractsVersion: string;
  billing: { verifiedByUser: boolean };
  features: { projects: boolean; syntheticModelTask: boolean; imports: boolean;
    research: boolean; memoryEdits: boolean; mcp: boolean };
  note: string;
}
export interface BootstrapPreview {
  schemaVersion: 1; createdAt: string; projectVersion: number; text: string;
  inputSha256: string; disclosure: 'public'; excludedCount: number;
  destination: string; syntheticOnly: true;
}
export class ApiError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export const errorMessages: Record<string, string> = {
  UNAUTHORIZED: 'Сеанс недоступен. Откройте мастерскую заново через локальный launcher.',
  NETWORK_UNAVAILABLE: 'Нет связи с локальным сервером. Проверьте, что мастерская запущена. Ваш ввод сохранён в этой вкладке.',
  REQUEST_TIMEOUT: 'Сервер не ответил вовремя. Ввод сохранён. Проверьте список задач перед повторным запуском.',
  INVALID_RESPONSE: 'Сервер вернул неожиданный ответ. Обновите состояние; введённые данные сохранены.',
  AUTH_REQUIRED: 'Нужен вход через ChatGPT в официальном локальном Codex.',
  CHATGPT_LOGIN_REQUIRED: 'В официальном Codex требуется авторизация через ChatGPT.',
  PAID_CONTINUATION_UNVERIFIED: 'Перед запуском проверьте отключение платного продолжения и автопополнения в аккаунте.',
  USAGE_LIMIT_REACHED: 'Лимит Codex исчерпан. Задача сохранена. Автоматического повтора не будет.',
  MODEL_TIMEOUT: 'Время выполнения истекло. Автоматического повтора не будет.',
  CANCELLED: 'Задача отменена по вашему запросу. Повторного запуска не будет.',
  INVALID_MODEL_JSON: 'Ответ Codex не прошёл проверку формата. Он не добавлен в память.',
  STALE_INPUT: 'Контекст изменился. Откройте новый предпросмотр и подтвердите его ещё раз.',
  PROCESS_INTERRUPTED: 'Работа прервалась при остановке приложения. Автоматического повтора не будет.',
  CUSTOM_ROUTE_BLOCKED: 'В Codex обнаружен неподтверждённый маршрут. Запуск заблокирован.',
  TASK_NOT_ACTIVE: 'Задача уже закончилась. Обновите список, чтобы увидеть её результат.',
  QUEUE_FULL: 'Очередь заполнена. Дождитесь завершения текущих задач.',
  NOT_IMPLEMENTED: 'Эта возможность ещё не подключена к локальному серверу.',
  INVALID_PROJECT: 'Проверьте название проекта: от 1 до 120 символов.',
  PROJECT_NOT_FOUND: 'Проект не найден. Обновите список проектов.',
  REQUEST_FAILED: 'Действие не выполнено. Ввод сохранён; попробуйте обновить состояние.',
};
export function explainError(error: unknown): string {
  return errorMessages[error instanceof ApiError ? error.code : ''] ?? errorMessages.REQUEST_FAILED;
}
export function isAbort(error: unknown) { return error instanceof DOMException && error.name === 'AbortError'; }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function project(value: unknown): value is Project {
  return object(value) && typeof value.id === 'string' && typeof value.name === 'string' && typeof value.goal === 'string' &&
    Array.isArray(value.constraints) && value.constraints.every((c) => typeof c === 'string') && Number.isInteger(value.version) &&
    typeof value.createdAt === 'string';
}
function task(value: unknown): value is Task {
  if (!object(value) || typeof value.id !== 'string' || typeof value.projectId !== 'string' || typeof value.status !== 'string' ||
    !['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'].includes(value.status) || typeof value.inputSha256 !== 'string' ||
    typeof value.createdAt !== 'string' || !(value.completedAt === null || typeof value.completedAt === 'string') ||
    !(value.error === null || typeof value.error === 'string')) return false;
  try { if (value.result !== null) validateBootstrapResult(value.result); } catch { return false; }
  return true;
}
function validate<T>(value: T, check: (value: T) => boolean): T { if (!check(value)) throw new ApiError('INVALID_RESPONSE'); return value; }
export function takeSession(browser: Pick<Window, 'location' | 'history' | 'sessionStorage'>): string {
  const incoming = new URLSearchParams(browser.location.hash.slice(1)).get('session');
  if (incoming) {
    try { browser.sessionStorage.setItem('ai-atelier-session', incoming); } catch { /* Storage may be disabled. */ }
    browser.history.replaceState(null, '', browser.location.pathname + browser.location.search);
    return incoming;
  }
  try { return browser.sessionStorage.getItem('ai-atelier-session') ?? ''; } catch { return ''; }
}
export function createApi(token: string, transport: typeof fetch = fetch) {
  async function request<T>(path: string, data?: unknown, signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 15_000);
    try {
      const response = await transport(`/api/${path}`, {
        method: data === undefined ? 'GET' : 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      let value: unknown;
      try { value = await response.json(); } catch { throw new ApiError('INVALID_RESPONSE'); }
      if (!response.ok) {
        const code = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'REQUEST_FAILED';
        throw new ApiError(code);
      }
      return value as T;
    } catch (error) {
      if (timedOut) throw new ApiError('REQUEST_TIMEOUT');
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (error instanceof ApiError) throw error;
      throw new ApiError('NETWORK_UNAVAILABLE');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  const projectPath = (id: string) => `projects/${encodeURIComponent(id)}`;
  return {
    status: async (signal?: AbortSignal) => validate(await request<BackendStatus>('status', undefined, signal),
      (s) => object(s) && s.application === 'ai-atelier' && typeof s.contractsVersion === 'string' && object(s.billing) &&
        typeof s.billing.verifiedByUser === 'boolean' && object(s.features) && ['projects', 'syntheticModelTask', 'imports', 'research', 'memoryEdits', 'mcp'].every((k) => typeof (s.features as unknown as Record<string, unknown>)[k] === 'boolean')),
    projects: async (signal?: AbortSignal) => validate(await request<Project[]>('projects', undefined, signal), (list) => Array.isArray(list) && list.every(project)),
    createProject: async (name: string, goal: string) => validate(await request<Project>('projects', { name, goal }), project),
    tasks: async (id: string, signal?: AbortSignal) => validate(await request<Task[]>(`${projectPath(id)}/tasks`, undefined, signal), (list) => Array.isArray(list) && list.every(task)),
    preview: async (id: string) => validate(await request<BootstrapPreview>(`${projectPath(id)}/preview`),
      (p) => object(p) && p.schemaVersion === 1 && p.syntheticOnly === true && typeof p.text === 'string' && typeof p.destination === 'string' &&
        typeof p.createdAt === 'string' && typeof p.inputSha256 === 'string' && /^[a-f0-9]{64}$/.test(p.inputSha256)),
    run: (id: string, inputSha256: string, idempotencyKey: string) => request<Task>(`${projectPath(id)}/tasks`,
      { approved: true, inputSha256, idempotencyKey }),
    cancel: (id: string, task: string) => request<{ status: 'cancellation_requested' }>(`${projectPath(id)}/tasks/${encodeURIComponent(task)}/cancel`, {}),
    confirmBilling: () => request('settings/billing-confirmation', { paidContinuationDisabled: true, autoTopUpDisabled: true }),
  };
}
export type AtelierApi = ReturnType<typeof createApi>;
