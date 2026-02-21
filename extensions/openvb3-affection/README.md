# OpenVB3 Affection System Plugin

Relationship tracking and emotional state management for OpenClaw.

## Features

- **Emotional Metrics**: Tracks closeness, trust, reliability, and irritation
- **Affection Points**: Computed from relationship metrics (0-1000 scale)
- **Presence States**: ACTIVE, BRB, AWAY with smart tracking
- **Trigger System**: Responds to gratitude, praise, and emotional cues
- **Cooldown Management**: Prevents spam and gaming the system
- **Daily Budgets**: Limits negative impact per day
- **Audit Trail**: Complete history of affection changes

## Installation

1. Add plugin to your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "openvb3-affection": {
        "enabled": true,
        "workspace": "/home/node/.openclaw/workspace",
        "debug": false
      }
    }
  }
}
```

2. Install dependencies:

```bash
cd /home/node/.openclaw/workspace/extensions/openvb3-affection
pnpm install
pnpm build
```

3. Restart OpenClaw gateway

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the plugin |
| `workspace` | string | `cwd()` | Workspace directory for state storage |
| `debug` | boolean | `false` | Enable debug logging |

## State Files

The plugin stores state in `{workspace}/affection/`:

- `state.json` - Current affection state
- `audit.jsonl` - Change history (JSONL format)
- `prefs.json` - User preferences

## Affection Labels

| AFF Range | Label |
|-----------|-------|
| 0-50 | HOSTILE |
| 51-100 | COLD |
| 101-200 | NEUTRAL |
| 201-300 | WARM |
| 301-500 | FRIENDLY |
| 501-700 | FOND |
| 701-900 | LOVING |
| 901-1000 | DEVOTED |

## Triggers

### Text Triggers
- **Gratitude**: "thanks", "thank you", "appreciate" → +closeness, +trust
- **Praise**: "good job", "well done", "awesome" → +closeness, +trust
- **Apology**: Detected automatically → repairs irritation

### Sticker Triggers
Certain stickers can trigger affection changes (configured in `sticker-triggers.ts`)

## Tools

### `affection_status`

Query current affection state:

```typescript
// Returns:
{
  label: "FRIENDLY",
  aff: 450,
  closeness: 0.45,
  trust: 0.60,
  reliabilityTrust: 0.20,
  irritation: 0.05,
  presence: { state: "ACTIVE", setAt: "2026-02-21T..." },
  today: { date: "2026-02-21", affGain: 12, negBudgetUsed: 2 }
}
```

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Test
pnpm test
```

## Architecture

```
extensions/openvb3-affection/
├── src/
│   ├── index.ts              # Plugin entry point
│   ├── v3b-engine.ts         # Core affection engine
│   ├── triggers.ts           # Text trigger evaluation
│   ├── sticker-triggers.ts   # Sticker trigger evaluation
│   ├── presence.ts           # Presence state management
│   ├── rules.ts              # Affection calculation rules
│   └── replies.ts            # Context-aware reply generation
├── package.json
├── tsconfig.json
└── README.md
```

## Migration from OpenVB3 Fork

This plugin extracts the affection system from the OpenVB3 fork into a standalone,
reusable plugin that works with mainline OpenClaw. Your existing `affection/` data
directory is preserved and used directly.

**Before (fork):**
- Affection code lived in `OpenVB3/src/affection/`
- Required maintaining a fork of OpenClaw
- Updates required manual merging

**After (plugin):**
- Affection code in `extensions/openvb3-affection/`
- Works with mainline OpenClaw
- Updates via `openclaw update` + plugin rebuild

## License

MIT

## Author

PizzaPasta1
