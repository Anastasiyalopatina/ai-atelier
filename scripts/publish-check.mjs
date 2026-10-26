import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = realpathSync(new URL('../', import.meta.url));
const allowed = readFileSync(resolve(root, 'PUBLIC_FILES.txt'), 'utf8').trim().split('\n');
const allow = new Set(allowed);
if (allow.size !== allowed.length) throw new Error('Duplicate public file');
function git(args, allowFailure = false) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 20_000_000 });
  if (result.status !== 0 && !allowFailure) throw new Error('Git inspection failed');
  return result.status === 0 ? result.stdout : '';
}
const problems = [];
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /\/Users\/[^/\s]+\/(?:Documents|Downloads|Library)\//,
];
function check(path, content, where) {
  if (!allow.has(path)) problems.push(`${where}: file is outside allowlist: ${path}`);
  if (content.length > 1_000_000 || content.includes('\0')) problems.push(`${where}: binary/oversize: ${path}`);
  if (patterns.some((pattern) => pattern.test(content))) problems.push(`${where}: credential/private-path pattern: ${path}`);
  if (/(?:^|\/)(?:auth\.json|\.env|.*\.(?:sqlite|db|log|jsonl|pdf|docx|xlsx))$/.test(path)) problems.push(`${where}: private-data filename: ${path}`);
}
for (const path of allowed) {
  const absolute = resolve(root, path);
  if (relative(root, absolute).startsWith('..') || path.startsWith('/') || lstatSync(absolute).isSymbolicLink()) throw new Error('Unsafe public path');
  check(path, readFileSync(absolute, 'utf8'), 'worktree');
}
const current = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
for (const path of new Set(current)) if (!allow.has(path)) problems.push(`unapproved file: ${path}`);
const staged = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']).split('\0').filter(Boolean);
for (const path of staged) check(path, git(['show', `:${path}`]), 'staged');
const commits = git(['rev-list', '--all'], true).trim().split('\n').filter(Boolean);
for (const sha of commits) {
  const paths = git(['ls-tree', '-r', '--name-only', '-z', sha]).split('\0').filter(Boolean);
  for (const path of paths) check(path, git(['show', `${sha}:${path}`]), 'history');
}
if (git(['diff', '--cached', '--check']).trim()) problems.push('Staged whitespace errors');
console.log(JSON.stringify({ allowedFiles: allowed.length, inspectedStagedFiles: staged.length,
  inspectedCommits: commits.length, problems, note: 'Pattern scan is not a guarantee; review the explicit allowlist and source diff.' }, null, 2));
if (problems.length) process.exitCode = 1;
