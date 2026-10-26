import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { BOOTSTRAP_TEXT, BOOTSTRAP_OUTPUT_SCHEMA, validateBootstrapResult, type Task } from '../../contracts/src/index.ts';
import { Store, inputSha256 } from '../../memory/src/store.ts';
import { SubscriptionClient } from './client.ts';
import { findCodex } from '../../../scripts/doctor.mjs';
import { billingConfirmation } from './billing.ts';
export { billingConfirmation } from './billing.ts';

export function runtimeError(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  if (/^[A-Z_0-9]+$/.test(text)) return text;
  return 'RUNTIME_FAILED';
}
export class ModelQueue {
  #store: Store;
  #running: { task: Task; controller: AbortController } | null = null;
  #draining: Promise<void> | null = null;
  #stopping = false;
  constructor(store: Store) { this.#store = store; }
  start() {
    if (!this.#draining && !this.#stopping) {
      this.#draining = this.#drain().finally(() => { this.#draining = null; });
    }
  }
  async #drain() {
    while (!this.#stopping) {
      const task = this.#store.nextQueued(); if (!task) break;
      const controller = new AbortController(); this.#running = { task, controller };
      let client: SubscriptionClient | undefined; let workspace: string | undefined;
      this.#store.transition(task.projectId, task.id, 'running');
      try {
        if (task.inputSha256 !== inputSha256) throw new Error('STALE_INPUT');
        if (!billingConfirmation(this.#store.directory).verifiedByUser) throw new Error('PAID_CONTINUATION_UNVERIFIED');
        const installed = findCodex().selected; if (!installed) throw new Error('AUTH_REQUIRED');
        workspace = mkdtempSync(join(this.#store.directory, 'task-workspace-'));
        client = new SubscriptionClient(installed.binary, workspace, this.#store.directory);
        const { selected } = await client.initialize();
        const result = await client.structured({ text: BOOTSTRAP_TEXT, schema: BOOTSTRAP_OUTPUT_SCHEMA,
          model: selected, billingConfirmed: true, signal: controller.signal });
        this.#store.transition(task.projectId, task.id, 'completed', { result: validateBootstrapResult(result.value),
          model: selected.model, clientVersion: installed.version ?? 'unknown' });
      } catch (error) {
        this.#store.transition(task.projectId, task.id, controller.signal.aborted ? 'cancelled' : 'failed', { error: runtimeError(error) });
      } finally {
        await client?.close();
        if (workspace) rmSync(workspace, { recursive: true, force: true });
        this.#running = null;
      }
    }
  }
  cancel(projectId: string, id: string) {
    const task = this.#store.getTask(projectId, id);
    if (!task) throw new Error('TASK_NOT_FOUND');
    if (this.#running?.task.id === id) this.#running.controller.abort();
    else if (task.status === 'queued') this.#store.transition(projectId, id, 'cancelled', { error: 'CANCELLED' });
    else throw new Error('TASK_NOT_ACTIVE');
  }
  async stop() { this.#stopping = true; this.#running?.controller.abort(); await this.#draining; }
}
