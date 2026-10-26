import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from '../apps/server/src/index.ts';

const root = new URL('../', import.meta.url);
if (!existsSync(new URL('../apps/web/dist/index.html', import.meta.url))) {
  console.log('Подготовка ai-atelier…');
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: false });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
let watcher;
if (process.argv.includes('--dev')) {
  watcher = spawn('npm', ['exec', '--', 'vite', 'build', '--watch', '--config', 'apps/web/vite.config.ts'],
    { cwd: root, stdio: 'inherit', shell: false });
}
const app = await startServer();
const sessionFile = join(app.store.directory, 'current-session.json');
writeFileSync(sessionFile, JSON.stringify({ url: app.url, origin: app.origin, pid: process.pid }), { mode: 0o600 });
console.log(`ai-atelier: ${app.origin} · Сеанс подготовлен; данные вне Git.`);
console.log('Для остановки нажмите Ctrl+C. При перезапуске задачи сами не повторяются.');
if (!process.argv.includes('--no-open') && process.platform === 'darwin') {
  spawn('/usr/bin/open', [app.url], { stdio: 'ignore', shell: false }).on('error', () => {
    console.log('Не удалось открыть браузер. Повторите запуск через launcher.');
  });
}
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (stopping) return; stopping = true;
  watcher?.kill('SIGTERM'); await app.close(); rmSync(sessionFile, { force: true }); process.exit();
});
