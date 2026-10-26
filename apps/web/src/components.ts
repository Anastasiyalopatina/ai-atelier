import { createElement as h } from 'react';
import type { ReactNode } from 'react';
import type { KnowledgeKind, Verification } from '../../../packages/contracts/src/index.ts';
import { statusLabels } from './state.ts';
import type { ViewStatus } from './state.ts';

export const kindLabels: Record<KnowledgeKind, string> = { user_statement: 'Запись пользователя', source_statement: 'Из источника',
  hypothesis: 'Гипотеза', inference: 'Вывод', calculation: 'Расчёт', decision: 'Решение' };
export const verificationLabels: Record<Verification, string> = { unverified: 'Не проверено', verified: 'Проверено', disputed: 'Оспаривается',
  needs_review: 'Нужен пересмотр', unknown: 'Нет данных о проверке' };
export function StatusBadge({ status }: { status: ViewStatus }) {
  const symbol = status === 'completed' ? '✓' : ['failed', 'limit', 'offline'].includes(status) ? '!' : status === 'cancelled' ? '×' : '○';
  return h('span', { className: `status status-${status}` }, h('span', { 'aria-hidden': true }, symbol), statusLabels[status]);
}
export function VerificationBadge({ value }: { value: Verification }) {
  return h('span', { className: `verification verification-${value}` },
    h('span', { 'aria-hidden': true }, value === 'verified' ? '✓ ' : value === 'needs_review' || value === 'disputed' ? '! ' : '○ '), verificationLabels[value]);
}
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return h('div', { className: 'empty-state' }, h('div', { className: 'empty-symbol', 'aria-hidden': true }, '↗'),
    h('h2', null, title), h('div', { className: 'empty-copy' }, children), action);
}
export function Unavailable({ title = 'Пока не подключено', children }: { title?: string; children: ReactNode }) {
  return h('div', { className: 'notice' }, h('span', { className: 'notice-symbol', 'aria-hidden': true }, 'i'),
    h('div', null, h('strong', null, title), h('p', null, children)));
}
export function DiffBlock({ before, after }: { before: string; after: string }) {
  return h('div', { className: 'diff-grid' }, h('div', { className: 'diff-before' }, h('span', { className: 'overline' }, '− БЫЛО'), h('p', null, before)),
    h('div', { className: 'diff-after' }, h('span', { className: 'overline' }, '+ ПРЕДЛАГАЕТСЯ'), h('p', null, after)));
}
