import fs from "node:fs";
import path from "node:path";

export type StickerTriggerKind = "sleep" | "wake";

export type StickerTriggersPrefs = {
  // Uses Telegram sticker.file_unique_id (stable across bots / sessions).
  sleep?: string[];
  wake?: string[];
};

export type AffectionPrefsFile = {
  // existing style prefs live here too (v3b-engine.ts reads this)
  mode?: "auto" | "fixed";
  name?: string;

  stickerTriggers?: StickerTriggersPrefs;
};

function prefsPath(workspace: string) {
  return path.join(workspace, "affection", "prefs.json");
}

export async function loadAffectionPrefs(workspace: string): Promise<AffectionPrefsFile> {
  const p = prefsPath(workspace);
  try {
    const raw = await fs.promises.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as AffectionPrefsFile;
  } catch {
    return {};
  }
}

export async function saveAffectionPrefs(workspace: string, prefs: AffectionPrefsFile) {
  const p = prefsPath(workspace);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  await fs.promises.writeFile(p, JSON.stringify(prefs, null, 2), "utf8");
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

export async function addStickerTrigger(opts: {
  workspace: string;
  kind: StickerTriggerKind;
  stickerUniqueId: string;
}) {
  const prefs = await loadAffectionPrefs(opts.workspace);
  const st = (prefs.stickerTriggers ?? {}) as StickerTriggersPrefs;
  const key = opts.kind;
  const next = uniq([...(st[key] ?? []), opts.stickerUniqueId]);
  prefs.stickerTriggers = { ...st, [key]: next };
  await saveAffectionPrefs(opts.workspace, prefs);
  return prefs.stickerTriggers;
}

export function stickerKindFromPrefs(prefs: AffectionPrefsFile, stickerUniqueId: string): StickerTriggerKind | null {
  const st = prefs.stickerTriggers;
  if (!st || !stickerUniqueId) return null;
  if ((st.sleep ?? []).includes(stickerUniqueId)) return "sleep";
  if ((st.wake ?? []).includes(stickerUniqueId)) return "wake";
  return null;
}
