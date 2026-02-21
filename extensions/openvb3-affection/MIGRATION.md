# Migration from OpenVB3 Fork to Plugin

## What Changed

### Before (OpenVB3 Fork Approach)
```
OpenVB3/                      # Full OpenClaw fork
└── src/
    └── affection/            # Affection code mixed with core
        ├── v3b-engine.ts
        ├── triggers.ts
        └── ...
```

**Problems:**
- Required maintaining entire OpenClaw fork
- Manual merging of upstream updates
- Affection features tightly coupled to core
- Hard to share/reuse affection system

### After (Plugin Approach)
```
workspace/
├── extensions/
│   └── openvb3-affection/    # Standalone plugin
│       ├── src/
│       │   ├── index.ts      # Plugin interface
│       │   ├── v3b-engine.ts # Core engine (migrated)
│       │   └── ...           # Other modules (migrated)
│       ├── package.json
│       └── README.md
└── affection/                # Data files (unchanged)
    ├── state.json
    ├── audit.jsonl
    └── prefs.json
```

**Benefits:**
- ✅ Works with mainline OpenClaw (no fork needed)
- ✅ Easy updates: `openclaw update` + plugin rebuild
- ✅ Portable: share plugin without entire codebase
- ✅ Clean separation: disable plugin = vanilla OpenClaw
- ✅ Data preserved: existing affection state intact

## Migration Steps

### 1. Plugin Created ✅
- Extracted affection code from `OpenVB3/src/affection/`
- Packaged as standalone plugin in `extensions/openvb3-affection/`
- Added OpenClaw plugin interface (`index.ts`)

### 2. Data Preserved ✅
- `affection/state.json` → unchanged
- `affection/audit.jsonl` → unchanged
- `affection/prefs.json` → unchanged

Plugin reads from same location—zero data migration needed!

### 3. Next Steps
1. Install plugin dependencies: `pnpm install`
2. Build plugin: `pnpm build`
3. Enable in `openclaw.json`
4. Restart gateway
5. Verify with `affection_status` tool

## OpenVB3 Branch Strategy

**Recommended: Hybrid Approach**

### Keep OpenVB3 Branch For:
- Rapid prototyping of new affection features
- Breaking changes that need isolation
- Experimental mechanics

### Use Plugin For:
- Stable affection features (daily use)
- Production deployments
- Features that need upstream OpenClaw updates

### Workflow:
1. **Prototype** in OpenVB3 fork
2. **Stabilize** → test thoroughly
3. **Migrate** stable features to plugin
4. **Deploy** plugin in production
5. **Repeat** for next feature

## Code Comparison

### OpenVB3 Fork (Before)
```typescript
// Deep in core codebase, hard to extract
import { evaluateTriggers } from "../../affection/triggers";

// Tightly coupled to message handling
async function handleMessage(msg) {
  const state = await loadAffectionState();
  evaluateTriggers(msg.text, state);
  await saveAffectionState(state);
}
```

### Plugin (After)
```typescript
// Clean plugin interface
ctx.on("message:inbound", async (event) => {
  await manager.processMessage(event.text);
});

// Reusable tool
ctx.registerTool({
  name: "affection_status",
  handler: async () => manager.getState(),
});
```

## Benefits in Practice

### Update Scenario

**Before (Fork):**
1. OpenClaw releases v2026.2.20
2. Pull upstream changes
3. Resolve merge conflicts in affection code
4. Fix broken affection integrations
5. Test everything
6. Deploy (risky)

**After (Plugin):**
1. OpenClaw releases v2026.2.20
2. Run `openclaw update`
3. Rebuild plugin: `pnpm build`
4. Test affection features
5. Deploy (safe, isolated)

### Sharing Scenario

**Before (Fork):**
- Share entire OpenVB3 fork (~500MB)
- Recipient must maintain fork
- Hard to integrate with their setup

**After (Plugin):**
- Share plugin directory (~50KB)
- Drop into `extensions/`
- Works with any OpenClaw instance
- Enable/disable with config

## Technical Details

### Plugin Architecture

```
Plugin Entry Point (index.ts)
    ↓
AffectionManager
    ↓
├── loadOrInitState() → affection/state.json
├── processMessage() → triggers.ts
├── processSticker() → sticker-triggers.ts
└── setPresence() → presence.ts
```

### Hook Integration

Plugin registers with OpenClaw's event system:
- `message:inbound` → process text/stickers
- `affection_status` tool → query state
- Future: `agent:reply` → context-aware responses

### Data Flow

```
User Message
    ↓
OpenClaw Message Router
    ↓
Plugin: message:inbound hook
    ↓
AffectionManager.processMessage()
    ↓
evaluateTriggers() → apply deltas
    ↓
saveState() → affection/state.json
    ↓
Audit log → affection/audit.jsonl
```

## Migration Complete

**Status: ✅ Ready for testing**

All affection code migrated to plugin structure. Data files preserved. Ready to build and enable.

Next: Follow [SETUP.md](./SETUP.md) to complete installation.
