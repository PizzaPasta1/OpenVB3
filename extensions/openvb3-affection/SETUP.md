# Setup Guide

## Quick Start

1. **Install dependencies:**
   ```bash
   cd /home/node/.openclaw/workspace/extensions/openvb3-affection
   pnpm install
   ```

2. **Build the plugin:**
   ```bash
   pnpm build
   ```

3. **Enable in OpenClaw config:**
   
   Edit `~/.openclaw/openclaw.json` and add:
   ```json
   {
     "plugins": {
       "entries": {
         "openvb3-affection": {
           "enabled": true,
           "workspace": "/home/node/.openclaw/workspace"
         }
       }
     }
   }
   ```

4. **Restart OpenClaw:**
   ```bash
   openclaw gateway restart
   ```

## Verify Installation

Check plugin loaded successfully:
```bash
openclaw doctor
```

Should show `openvb3-affection` in the loaded plugins list.

## Test Affection Tool

In chat, trigger the affection tool:
```
Show me my current affection status
```

The agent will call `affection_status` and return metrics.

## Data Migration

Your existing affection data at `/home/node/.openclaw/workspace/affection/` will be used automatically. No migration needed!

## Troubleshooting

**Plugin not loading:**
- Check `openclaw doctor` output
- Verify `pnpm build` completed without errors
- Check gateway logs: `openclaw logs --follow`

**State not persisting:**
- Verify workspace path in config matches your affection data location
- Check file permissions on `affection/` directory

**TypeScript errors:**
- Run `pnpm install` in the plugin directory
- Ensure TypeScript version matches root workspace
