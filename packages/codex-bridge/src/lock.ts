import { openSync, closeSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function acquireLock(directory: string, name = 'model.lock'): () => void {
  const path = join(directory, name);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx', 0o600); const nonce = randomUUID();
      writeFileSync(fd, JSON.stringify({ pid: process.pid, nonce })); closeSync(fd);
      return () => {
        try { if (JSON.parse(readFileSync(path, 'utf8')).nonce === nonce) unlinkSync(path); } catch { /* lock already removed */ }
      };
    } catch (error: any) {
      if (error.code !== 'EEXIST') throw error;
      const recoveryPath = `${path}.recovery`;
      let recovery: number;
      try { recovery = openSync(recoveryPath, 'wx', 0o600); } catch { throw new Error('RUNTIME_ALREADY_RUNNING'); }
      try {
        let pid: number;
        try { pid = JSON.parse(readFileSync(path, 'utf8')).pid; } catch { throw new Error('RUNTIME_LOCK_INVALID'); }
        if (!Number.isInteger(pid) || pid <= 0) throw new Error('RUNTIME_LOCK_INVALID');
        try { process.kill(pid, 0); throw new Error('RUNTIME_ALREADY_RUNNING'); }
        catch (probe: any) {
          if (probe.code !== 'ESRCH') throw new Error('RUNTIME_ALREADY_RUNNING');
          unlinkSync(path);
        }
      } finally { closeSync(recovery); unlinkSync(recoveryPath); }
    }
  }
  throw new Error('RUNTIME_ALREADY_RUNNING');
}
