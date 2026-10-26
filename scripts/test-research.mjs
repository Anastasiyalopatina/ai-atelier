import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../packages/research/', import.meta.url));
const tests = readdirSync(root, { recursive: true }).filter((name) => /\.test\.(ts|mjs)$/.test(name));
if (!tests.length) console.log('Research ещё не реализован. Тестов пакета: 0; это не приёмка функционала.');
else {
  const result = spawnSync(process.execPath, ['--test', ...tests.map((name) => join(root, name))], { stdio: 'inherit', shell: false });
  process.exitCode = result.status ?? 1;
}
