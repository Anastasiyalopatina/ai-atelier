import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
const bootstrap = '9d4a992227b682f92b665fcae9c0bb7b0e52a2a2';
const lines = file => readFileSync(resolve(root, file), 'utf8').trim().split('\n');
const base = new Set(lines('PUBLIC_FILES.txt')), role = new Set(lines('docs/research/PUBLIC_FILES.txt'));
const allowed = new Set([...base, ...role]);
const scope = p => p.startsWith('packages/research/') || p.startsWith('docs/research/') || p === 'docs/handoffs/research.md';
const problems = [];
function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 20_000_000 });
  if (r.status !== 0) throw Error('GIT_INSPECTION_FAILED'); return r.stdout;
}
const split = s => s.split('\0').filter(Boolean);
if (git(['branch', '--show-current']).trim() !== 'codex/research') problems.push('Wrong branch');
if (git(['merge-base', 'HEAD', bootstrap]).trim() !== bootstrap) problems.push('Wrong bootstrap base');
for (const p of role) if (!scope(p)) problems.push(`Role allowlist outside scope: ${p}`);
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/, /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /\/Users\/[^/\s]+\/(?:Documents|Downloads|Library)\//];
function check(p, data, where, mode) {
  if (!allowed.has(p)) problems.push(`${where}: unapproved ${p}`);
  if (mode && !['100644', '100755'].includes(mode)) problems.push(`${where}: non-regular file ${p}`);
  if (Buffer.byteLength(data) > 1_000_000 || data.includes('\0')) problems.push(`${where}: binary/oversize ${p}`);
  if (patterns.some(re => re.test(data))) problems.push(`${where}: credential/private-path pattern ${p}`);
  if (/(?:^|\/)(?:auth\.json|\.env|.*\.(?:sqlite|db|log|jsonl|pdf|docx|xlsx))$/.test(p)) problems.push(`${where}: data filename ${p}`);
}
const working = split(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']));
for (const p of new Set([...working, ...role])) {
  const absolute = resolve(root, p), relation = relative(root, absolute);
  if (relation.startsWith('..') || isAbsolute(relation) || lstatSync(absolute).isSymbolicLink()) throw Error('UNSAFE_PUBLIC_PATH');
  check(p, readFileSync(absolute, 'utf8'), 'worktree');
}
const changed = split(git(['diff', '--name-only', '-z', bootstrap]));
for (const p of [...changed, ...working.filter(p => !base.has(p))]) if (!role.has(p) || !scope(p)) problems.push(`Unapproved change ${p}`);
const staged = split(git(['diff', '--cached', '--name-only', '-z']));
for (const p of staged) check(p, git(['show', `:${p}`]), 'staged');
const commits = git(['rev-list', 'HEAD']).trim().split('\n').filter(Boolean);
for (const sha of commits) for (const entry of split(git(['ls-tree', '-r', '-z', sha]))) {
  const [meta, p] = entry.split('\t'); check(p, git(['show', `${sha}:${p}`]), 'history', meta.split(' ')[0]);
}
if (git(['diff', '--check']).trim() || git(['diff', '--cached', '--check']).trim()) problems.push('Whitespace errors');
console.log(JSON.stringify({ roleAllowlist: role.size, inspectedFiles: new Set(working).size,
  stagedFiles: staged.length, historyCommits: commits.length, problems,
  note: 'Pattern scan plus explicit role allowlist; human source/staged diff review is still required.' }, null, 2));
if (problems.length) process.exitCode = 1;
