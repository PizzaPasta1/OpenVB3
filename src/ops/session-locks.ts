import fs from "node:fs";
import path from "node:path";

export type StaleLock = {
  path: string;
  ageMs: number;
  mtimeMs: number;
};

async function walk(dir: string, out: string[]): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (ent) => {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(p, out);
      } else {
        out.push(p);
      }
    }),
  );
}

export async function findStaleSessionLocks(opts?: {
  rootDir?: string;
  olderThanMs?: number;
  nowMs?: number;
}): Promise<StaleLock[]> {
  const home = process.env.HOME ?? "/home/node";
  const rootDir = opts?.rootDir ?? path.join(home, ".openclaw", "agents");
  const olderThanMs = opts?.olderThanMs ?? 2 * 60_000;
  const nowMs = opts?.nowMs ?? Date.now();

  const files: string[] = [];
  await walk(rootDir, files);

  const locks = files.filter((p) => p.endsWith(".jsonl.lock"));

  const stale: StaleLock[] = [];
  for (const lockPath of locks) {
    try {
      const st = await fs.promises.stat(lockPath);
      const ageMs = nowMs - st.mtimeMs;
      if (ageMs >= olderThanMs) {
        stale.push({ path: lockPath, ageMs, mtimeMs: st.mtimeMs });
      }
    } catch {
      // ignore
    }
  }

  stale.sort((a, b) => b.ageMs - a.ageMs);
  return stale;
}

export function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rS = s % 60;
  if (m <= 0) return `${s}s`;
  const h = Math.floor(m / 60);
  const rM = m % 60;
  if (h <= 0) return `${m}m${rS}s`;
  return `${h}h${rM}m`;
}
