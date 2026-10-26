import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { billingConfirmation } from '../packages/codex-bridge/src/billing.ts';
import { childEnvironment } from '../packages/codex-bridge/src/environment.mjs';
export { childEnvironment } from '../packages/codex-bridge/src/environment.mjs';

// Credentials remain owned by the official client. Never open auth.json.
function version(binary, args, env) {
  const result = spawnSync(binary, args, { env, encoding: 'utf8', timeout: 8_000 });
  if (result.error || result.status !== 0) return null;
  // Do not print arbitrary stderr or credentials from CLI diagnostics.
  return result.stdout.trim().split('\n')[0]?.slice(0, 180) || null;
}

function candidates(env) {
  return [...new Set([
    process.env.AI_ATELIER_CODEX_BIN,
    ...(env.PATH || '').split(':').map((dir) => join(dir, 'codex')),
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
    '/Applications/Codex.app/Contents/Resources/codex',
  ].filter(Boolean))];
}

export function findCodex(env = childEnvironment()) {
  const installations = candidates(env).filter(existsSync).map((binary) => ({
    binary, version: version(binary, ['--version'], env),
  }));
  return { installations, selected: installations.find((entry) => entry.version?.startsWith('codex-cli ')) ?? null };
}

const READ_ONLY_METHODS = new Set(['initialize', 'account/read', 'model/list', 'account/rateLimits/read']);

export function publicRpcError(method, error) {
  const reason = /workspace routing discovery failed/i.test(error?.message ?? '')
    ? 'WORKSPACE_ROUTING_DISCOVERY_FAILED' : 'RPC_FAILED';
  return `${method}:${reason}:${Number.isInteger(error?.code) ? error.code : 'UNKNOWN'}`;
}

export class ReadOnlyAppServer {
  #pending = new Map();
  #nextId = 0;
  #process;
  #lines;
  #directory;
  #startupFailure;
  constructor(binary, env) {
    this.#directory = mkdtempSync(join(tmpdir(), 'ai-atelier-doctor-'));
    this.#process = spawn(binary, [
      'app-server', '--listen', 'stdio://',
      '-c', 'model_provider="openai"',
      '-c', 'analytics.enabled=false',
      '-c', 'feedback.enabled=false',
      '-c', 'otel.exporter="none"',
      '-c', 'otel.metrics_exporter="none"',
      '-c', 'otel.trace_exporter="none"',
      '-c', 'otel.log_user_prompt=false',
      '-c', `log_dir=${JSON.stringify(this.#directory)}`,
    ], { env, cwd: this.#directory, stdio: ['pipe', 'pipe', 'pipe'] });
    this.#process.stderr.on('data', (chunk) => {
      // Classify startup failures without storing or printing private stderr.
      const text = chunk.toString();
      if (text.includes('failed to initialize sqlite state runtime')) this.#startupFailure = 'CODEX_STATE_WRITE_REQUIRED';
      if (text.includes('error loading otel config')) this.#startupFailure = 'CODEX_TELEMETRY_START_FAILED';
    });
    this.#process.stdin.on('error', () => this.#failAll('CODEX_STDIN_UNAVAILABLE'));
    this.#process.on('error', () => this.#failAll('CODEX_START_FAILED'));
    this.#process.on('exit', () => this.#failAll(this.#startupFailure ?? 'CODEX_EXITED'));
    this.#lines = createInterface({ input: this.#process.stdout });
    this.#lines.on('line', (line) => {
      if (line.length > 2_000_000) return this.#failAll('RPC_RESPONSE_TOO_LARGE');
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.method) {
        // This diagnostic never answers server requests granting tool execution.
        if (message.id !== undefined) this.#process.stdin.write(JSON.stringify({
          id: message.id, error: { code: -32601, message: 'Read-only diagnostic' },
        }) + '\n');
        return;
      }
      const waiting = this.#pending.get(message.id);
      if (!waiting) return;
      clearTimeout(waiting.timer);
      this.#pending.delete(message.id);
      if (message.error) waiting.reject(new Error(publicRpcError(waiting.method, message.error)));
      else waiting.resolve(message.result);
    });
  }
  #failAll(code) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(code));
    }
    this.#pending.clear();
  }
  request(method, params = {}) {
    if (!READ_ONLY_METHODS.has(method)) return Promise.reject(new Error('READ_ONLY_METHOD_REQUIRED'));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error('RPC_TIMEOUT'));
      }, 15_000);
      this.#pending.set(id, { resolve, reject, timer, method });
      this.#process.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }
  initialized() {
    this.#process.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  }
  async close() {
    this.#failAll('DOCTOR_CLOSED');
    this.#lines.close();
    if (this.#process.exitCode === null && this.#process.signalCode === null) {
      await new Promise((resolve) => {
        const killTimer = setTimeout(() => this.#process.kill('SIGKILL'), 1_000);
        this.#process.once('exit', () => { clearTimeout(killTimer); resolve(); });
        this.#process.kill('SIGTERM');
      });
    }
    rmSync(this.#directory, { recursive: true, force: true });
  }
}

export function publicAccount(result) {
  return {
    type: typeof result?.account?.type === 'string' ? result.account.type : 'not_authenticated',
    planType: typeof result?.account?.planType === 'string' ? result.account.planType : null,
    requiresOpenaiAuth: typeof result?.requiresOpenaiAuth === 'boolean' ? result.requiresOpenaiAuth : null,
  };
}

export function publicLimits(result) {
  const snapshot = result?.rateLimits;
  const window = (value) => value ? {
    usedPercent: value.usedPercent ?? null,
    windowDurationMins: value.windowDurationMins ?? null,
    resetsAt: value.resetsAt ?? null,
  } : null;
  return {
    available: Boolean(snapshot),
    primary: window(snapshot?.primary),
    secondary: window(snapshot?.secondary),
    credits: snapshot?.credits ? {
      hasCredits: snapshot.credits.hasCredits ?? null,
      unlimited: snapshot.credits.unlimited ?? null,
    } : null,
    // The documented rate-limit snapshot does not attest auto-top-up settings.
    automaticPaidContinuation: 'unknown',
  };
}

export async function doctor() {
  const env = childEnvironment();
  const installations = candidates(env).filter(existsSync).map((binary) => ({
    binary, version: version(binary, ['--version'], env),
  }));
  const selected = installations.find((entry) => entry.version?.startsWith('codex-cli '));
  const report = {
    application: 'ai-atelier',
    checkedAt: new Date().toISOString(),
    environment: { platform: process.platform, arch: process.arch, node: process.version,
      git: version('git', ['--version'], env), githubPublication: 'browser_user_preference' },
    codex: { installations, selected: selected ?? null, adapter: 'official-app-server-stdio',
      account: null, models: [], modelCatalogComplete: false, limits: null },
    modelInvocation: 'not_started',
    liveWebSearch: 'not_tested',
    blockers: [],
  };
  const dataDir = resolve(process.env.AI_ATELIER_DATA_DIR || join(homedir(), 'Library/Application Support/ai-atelier'));
  try { report.modelCheck = JSON.parse(readFileSync(join(dataDir, 'model-check.json'), 'utf8')); report.modelInvocation = report.modelCheck.completed ? 'previous_smoke_passed' : 'not_verified'; } catch { /* no prior verified cycle */ }
  try { report.webSearchCheck = JSON.parse(readFileSync(join(dataDir, 'web-search-check.json'), 'utf8')); report.liveWebSearch = report.webSearchCheck.available ? 'verified' : 'not_verified'; } catch { /* no prior search probe */ }
  if (!selected) report.blockers.push('CODEX_UNAVAILABLE');
  else {
    const server = new ReadOnlyAppServer(selected.binary, env);
    try {
      await server.request('initialize', { clientInfo: {
        name: 'ai-atelier', title: 'ai-atelier — локальная диагностика', version: '0.0.0',
      } });
      server.initialized();
      report.codex.account = publicAccount(await server.request('account/read', { refreshToken: false }));
      if (report.codex.account.type !== 'chatgpt') report.blockers.push('CHATGPT_LOGIN_REQUIRED');
      else {
        let cursor;
        do {
          const models = await server.request('model/list', { includeHidden: false, limit: 100, ...(cursor ? { cursor } : {}) });
          report.codex.models.push(...(models?.data ?? []).map((model) => ({
            id: model.id, model: model.model, displayName: model.displayName,
            isDefault: model.isDefault, supportedReasoningEfforts: model.supportedReasoningEfforts,
          })));
          cursor = models?.nextCursor;
        } while (cursor && report.codex.models.length < 500);
        report.codex.modelCatalogComplete = !cursor;
        try { report.codex.limits = publicLimits(await server.request('account/rateLimits/read')); }
        catch (error) { report.codex.limits = { available: false, error: error.message, automaticPaidContinuation: 'unknown' }; }
        report.billingConfirmation = billingConfirmation(resolve(process.env.AI_ATELIER_DATA_DIR || join(homedir(), 'Library/Application Support/ai-atelier')));
        if (!report.billingConfirmation.verifiedByUser) report.blockers.push('PAID_CONTINUATION_UNVERIFIED');
      }
    } catch (error) { report.blockers.push(error.message); }
    finally { await server.close(); }
  }
  report.status = report.blockers.length ? 'BOOTSTRAP_BLOCKED' : 'PREFLIGHT_OK';
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await doctor();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.blockers.length ? 1 : 0;
  } catch {
    console.log(JSON.stringify({ status: 'BOOTSTRAP_BLOCKED', blockers: ['DOCTOR_FAILED'] }));
    process.exitCode = 1;
  }
}
