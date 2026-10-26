import { readFileSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const base = '9d4a992227b682f92b665fcae9c0bb7b0e52a2a2';
const lines = (path) => readFileSync(resolve(root, path), 'utf8').trim().split('\n');
const ui = lines('docs/ux/PUBLIC_FILES.txt');
const baseline = lines('PUBLIC_FILES.txt');
const allowed = new Set([...baseline, ...ui]);
const problems = [];
function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 30_000_000 });
  if (result.status !== 0) throw new Error('Git inspection failed');
  return result.stdout;
}
const owned = (path) => path.startsWith('apps/web/') || path.startsWith('docs/ux/') || path === 'docs/handoffs/ui.md';
if (new Set(ui).size !== ui.length || ui.some((p) => !owned(p) || p.includes('..') || p.startsWith('/'))) throw new Error('Unsafe UI allowlist');
if (git(['branch', '--show-current']).trim() !== 'codex/ui') throw new Error('Expected codex/ui');
git(['merge-base', '--is-ancestor', base, 'HEAD']);
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/, /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /\/Users\/[^/\s]+\/(?:Documents|Downloads|Library)\//];
function check(path, content, where) {
  if (!allowed.has(path)) problems.push(`${where}: outside allowlist: ${path}`);
  if (content.length > 1_000_000 || content.includes('\0')) problems.push(`${where}: binary or oversize: ${path}`);
  if (patterns.some((pattern) => pattern.test(content))) problems.push(`${where}: credential/private path pattern: ${path}`);
  if (/(?:^|\/)(?:auth\.json|\.env|.*\.(?:sqlite|db|log|jsonl|pdf|docx|xlsx))$/.test(path)) problems.push(`${where}: private filename: ${path}`);
}
for (const path of ui) {
  if (!lstatSync(resolve(root, path)).isFile()) throw new Error('Expected regular source file');
  check(path, readFileSync(resolve(root, path), 'utf8'), 'worktree');
}
const changes = git(['diff', '--name-only', base, '--']).trim().split('\n').filter(Boolean);
for (const path of changes) if (!ui.includes(path)) problems.push(`unapproved change: ${path}`);
const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
for (const path of new Set(files)) if (!allowed.has(path)) problems.push(`unapproved file: ${path}`);
const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean);
for (const path of staged) check(path, git(['show', `:${path}`]), 'staged');
const commits = git(['rev-list', 'HEAD']).trim().split('\n').filter(Boolean);
for (const sha of commits) {
  for (const path of git(['ls-tree', '-r', '--name-only', '-z', sha]).split('\0').filter(Boolean)) check(path, git(['show', `${sha}:${path}`]), 'history');
}
git(['diff', '--cached', '--check']);
console.log(JSON.stringify({ uiAllowlist: ui.length, stagedFiles: staged.length, inspectedCommits: commits.length, problems }, null, 2));
if (problems.length) process.exitCode = 1;
