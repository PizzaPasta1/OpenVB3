#!/usr/bin/env bash
set -euo pipefail

# Zeabur sets PORT (usually 8080)
PORT="${PORT:-8080}"

# Where OpenClaw reads persisted config
CONFIG_DIR="${HOME}/.openclaw"
CONFIG_PATH="${CONFIG_DIR}/openclaw.json"

ALLOWED_ORIGIN="https://openbonk-fresh.zeabur.app"

mkdir -p "${CONFIG_DIR}"

# Ensure a JSON file exists (OpenClaw can merge/patch it)
if [ ! -f "${CONFIG_PATH}" ]; then
  echo '{}' > "${CONFIG_PATH}"
fi

# Make these variables visible to the Node block
export CONFIG_PATH
export PORT
export ALLOWED_ORIGIN

# Patch config deterministically using Node (no jq dependency)
node <<'NODE'
const fs = require("fs");

const configPath = process.env.CONFIG_PATH;
const port = Number(process.env.PORT || "8080");
const allowedOrigin = process.env.ALLOWED_ORIGIN;

let cfg = {};
try {
  cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch {
  cfg = {};
}

// STRIP unsupported keys (OpenVB3 schema is older)
if (cfg.commands && typeof cfg.commands === "object") {
  delete cfg.commands.ownerDisplay;
}
if (cfg.channels?.telegram && typeof cfg.channels.telegram === "object") {
  delete cfg.channels.telegram.streaming;
}
if (cfg.gateway?.auth && typeof cfg.gateway.auth === "object") {
  delete cfg.gateway.auth.rateLimit;
}

cfg.gateway ??= {};
cfg.gateway.bind = "lan";
cfg.gateway.port = port;

cfg.gateway.controlUi ??= {};
cfg.gateway.controlUi.allowedOrigins = [allowedOrigin];
cfg.gateway.controlUi.allowInsecureAuth ??= false;

// Optional: only enable plugin if manifest exists in the image
const manifestPath = "/app/extensions/openvb3-affection/openclaw.plugin.json";
const hasManifest = fs.existsSync(manifestPath);

cfg.plugins ??= {};
cfg.plugins.entries ??= {};

// If you *want* it always enabled, delete this conditional and force enabled:true.
if (hasManifest) {
  cfg.plugins.entries["openvb3-affection"] = { enabled: true };
} else {
  // Don’t leave a stale entry that causes warnings/confusion
  delete cfg.plugins.entries["openvb3-affection"];
}

fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n");
console.log(`[zeabur-entrypoint] patched ${configPath} (port=${port}, origin=${allowedOrigin}, affectionManifest=${hasManifest})`);
NODE

exec node dist/index.js gateway --allow-unconfigured
