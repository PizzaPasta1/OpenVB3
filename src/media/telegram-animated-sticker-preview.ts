import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileUtf8 } from "../daemon/exec-file.js";
import type { MsgContext } from "../auto-reply/templating.js";

const FFMPEG_URL =
  "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz";

type PreviewOptions = {
  enabled: boolean;
  frames: number;
  includeThumbnail: boolean;
  includeContactSheet: boolean;
};

function boolEnv(name: string): boolean {
  const raw = process.env[name];
  if (!raw) return false;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function resolveTelegramAnimatedStickerPreviewOptions(): PreviewOptions {
  // Env-first until we wire this into config schema.
  const enabled = boolEnv("OPENCLAW_TELEGRAM_ANIM_STICKER_PREVIEW");
  return {
    enabled,
    frames: intEnv("OPENCLAW_TELEGRAM_ANIM_STICKER_PREVIEW_FRAMES", 6),
    includeThumbnail: true,
    includeContactSheet: true,
  };
}

async function ensureFfmpegBin(workspaceDir: string): Promise<{ ffmpeg: string; ffprobe: string }> {
  const binDir = path.join(workspaceDir, "tmp", "ffmpeg-bin");
  const ffmpeg = path.join(binDir, "ffmpeg");
  const ffprobe = path.join(binDir, "ffprobe");

  const exists = async (p: string) =>
    await fs.promises
      .access(p, fs.constants.X_OK)
      .then(() => true)
      .catch(() => false);

  if ((await exists(ffmpeg)) && (await exists(ffprobe))) {
    return { ffmpeg, ffprobe };
  }

  await fs.promises.mkdir(binDir, { recursive: true });

  const tarPath = path.join(binDir, "ffmpeg.tar.xz");

  // Download with node fetch (no sudo/apt).
  const res = await fetch(FFMPEG_URL);
  if (!res.ok) {
    throw new Error(`Failed to download ffmpeg (${res.status})`);
  }
  const arrayBuf = await res.arrayBuffer();
  await fs.promises.writeFile(tarPath, Buffer.from(arrayBuf));

  // Extract into binDir.
  const tar = await execFileUtf8("tar", ["-xf", tarPath, "--strip-components=1"], {
    cwd: binDir,
  });
  if (tar.code !== 0) {
    throw new Error(`Failed to extract ffmpeg: ${tar.stderr}`);
  }

  // Sanity check
  const ver = await execFileUtf8(ffmpeg, ["-version"], { cwd: binDir });
  if (ver.code !== 0) {
    throw new Error(`ffmpeg sanity check failed: ${ver.stderr}`);
  }

  return { ffmpeg, ffprobe };
}

async function probeDurationSeconds(ffprobe: string, filePath: string): Promise<number | null> {
  const out = await execFileUtf8(
    ffprobe,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      filePath,
    ],
    {},
  );
  if (out.code !== 0) {
    return null;
  }
  const n = Number(out.stdout.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isTelegramAnimatedStickerCtx(ctx: MsgContext): boolean {
  const provider = String(ctx.Provider ?? "").toLowerCase();
  const origin = String(ctx.OriginatingChannel ?? "").toLowerCase();
  const isTelegram = provider === "telegram" || origin === "telegram";
  if (!isTelegram) return false;

  const body = String(ctx.Body ?? "");
  const bodyForAgent = String(ctx.BodyForAgent ?? "");
  if (body.includes("<media:animated_sticker>") || bodyForAgent.includes("<media:animated_sticker>")) {
    return true;
  }

  // Fallback: treat small mp4 videos as candidates.
  const mediaTypes = Array.isArray(ctx.MediaTypes) ? ctx.MediaTypes : [];
  return mediaTypes.some((t) => String(t).toLowerCase() === "video/mp4");
}

function ensureList<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  return [];
}

export async function applyTelegramAnimatedStickerPreviews(params: {
  ctx: MsgContext;
  workspaceDir: string;
}): Promise<void> {
  const opts = resolveTelegramAnimatedStickerPreviewOptions();
  if (!opts.enabled) return;
  if (!isTelegramAnimatedStickerCtx(params.ctx)) return;

  const mediaPaths = ensureList<string>(params.ctx.MediaPaths);
  const mediaTypes = ensureList<string>(params.ctx.MediaTypes);

  // Find first mp4 attachment (Telegram animated sticker currently comes through as mp4 in our setup).
  let mp4Path: string | null = null;
  for (let i = 0; i < Math.max(mediaPaths.length, mediaTypes.length); i += 1) {
    const p = mediaPaths[i];
    const t = mediaTypes[i];
    if (p && String(t).toLowerCase() === "video/mp4") {
      mp4Path = p;
      break;
    }
    if (p && p.toLowerCase().endsWith(".mp4")) {
      mp4Path = p;
      // keep scanning in case we find explicit video/mp4 but this is good enough
      break;
    }
  }
  if (!mp4Path) return;

  // Make sure file exists.
  const stat = await fs.promises.stat(mp4Path).catch(() => null);
  if (!stat || !stat.isFile()) return;

  // Keep a lid on abuse.
  if (stat.size > 8 * 1024 * 1024) {
    return;
  }

  const { ffmpeg, ffprobe } = await ensureFfmpegBin(params.workspaceDir);

  const key = crypto
    .createHash("sha256")
    .update(`${mp4Path}|${stat.mtimeMs}|${stat.size}`)
    .digest("hex")
    .slice(0, 16);

  const outDir = path.join(params.workspaceDir, "tmp", "telegram-anim-sticker", key);
  await fs.promises.mkdir(outDir, { recursive: true });

  const thumbPath = path.join(outDir, "thumb.jpg");
  const contactPath = path.join(outDir, "contact.jpg");
  const framePattern = path.join(outDir, "frame_%03d.jpg");

  const duration = await probeDurationSeconds(ffprobe, mp4Path);
  const fps = duration ? Math.max(0.2, opts.frames / duration) : 0.6;

  // Generate outputs if missing.
  if (opts.includeThumbnail) {
    const exists = await fs.promises
      .access(thumbPath)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      await execFileUtf8(ffmpeg, ["-y", "-i", mp4Path, "-ss", "0", "-frames:v", "1", thumbPath]);
    }
  }

  if (opts.includeContactSheet) {
    const exists = await fs.promises
      .access(contactPath)
      .then(() => true)
      .catch(() => false);
    if (!exists) {
      await execFileUtf8(ffmpeg, [
        "-y",
        "-i",
        mp4Path,
        "-vf",
        "select='not(mod(n,10))',scale=360:-1,tile=3x2",
        "-frames:v",
        "1",
        contactPath,
      ]);
    }
  }

  const frame0 = path.join(outDir, "frame_001.jpg");
  const frame0Exists = await fs.promises
    .access(frame0)
    .then(() => true)
    .catch(() => false);
  if (!frame0Exists) {
    await execFileUtf8(ffmpeg, [
      "-y",
      "-i",
      mp4Path,
      "-vf",
      `fps=${fps.toFixed(4)},scale=512:-1:flags=lanczos`,
      "-t",
      duration ? String(Math.min(duration, 20)) : "12",
      framePattern,
    ]);
  }

  // Collect up to N frames.
  const frames: string[] = [];
  for (let i = 1; i <= opts.frames; i += 1) {
    const p = path.join(outDir, `frame_${String(i).padStart(3, "0")}.jpg`);
    const ok = await fs.promises
      .access(p)
      .then(() => true)
      .catch(() => false);
    if (ok) frames.push(p);
  }

  const additions: string[] = [];
  if (opts.includeThumbnail) {
    const ok = await fs.promises
      .access(thumbPath)
      .then(() => true)
      .catch(() => false);
    if (ok) additions.push(thumbPath);
  }
  if (opts.includeContactSheet) {
    const ok = await fs.promises
      .access(contactPath)
      .then(() => true)
      .catch(() => false);
    if (ok) additions.push(contactPath);
  }
  additions.push(...frames);

  if (additions.length === 0) return;

  // Attach as additional images.
  const nextPaths = [...mediaPaths, ...additions];
  const nextTypes = [...mediaTypes];
  while (nextTypes.length < mediaPaths.length) {
    nextTypes.push("application/octet-stream");
  }
  for (let i = 0; i < additions.length; i += 1) {
    nextTypes.push("image/jpeg");
  }

  params.ctx.MediaPaths = nextPaths;
  params.ctx.MediaTypes = nextTypes;
}
