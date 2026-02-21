/**
 * OpenVB3 Affection System Plugin
 * 
 * Provides relationship tracking and emotional state management for OpenClaw.
 * Tracks closeness, trust, reliability, and irritation metrics to create
 * dynamic, emotionally-aware agent interactions.
 */

import type { PluginModule } from "openclaw/plugin-sdk";
import { loadOrInitState, saveState, type AffectionStateV3b } from "./v3b-engine.js";
import { evaluateTriggers } from "./triggers.js";
import { evaluateStickerTriggers } from "./sticker-triggers.js";
import { handlePresenceChange } from "./presence.js";

export { type AffectionStateV3b } from "./v3b-engine.js";

/**
 * Affection plugin configuration
 */
export interface AffectionPluginConfig {
  /** Enable/disable the plugin */
  enabled?: boolean;
  /** Workspace directory for state storage */
  workspace?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Plugin state manager
 */
class AffectionManager {
  private state: AffectionStateV3b | null = null;
  private workspace: string;
  private debug: boolean;

  constructor(workspace: string, debug = false) {
    this.workspace = workspace;
    this.debug = debug;
  }

  async load(): Promise<AffectionStateV3b> {
    if (!this.state) {
      this.state = await loadOrInitState(this.workspace);
      if (this.debug) {
        console.log("[affection] Loaded state:", this.state.label, `aff:${this.state.aff}`);
      }
    }
    return this.state;
  }

  async save(): Promise<void> {
    if (this.state) {
      await saveState(this.workspace, this.state);
      if (this.debug) {
        console.log("[affection] Saved state:", this.state.label, `aff:${this.state.aff}`);
      }
    }
  }

  getState(): AffectionStateV3b | null {
    return this.state;
  }

  async processMessage(text: string, messageId?: string): Promise<void> {
    const state = await this.load();
    
    // Evaluate text triggers (gratitude, praise, etc.)
    const textResult = evaluateTriggers(text, state, messageId);
    if (textResult.changed) {
      await this.save();
    }

    // Update last message timestamp
    state.lastMessageAt = new Date().toISOString();
    await this.save();
  }

  async processSticker(stickerId: string, messageId?: string): Promise<void> {
    const state = await this.load();
    
    // Evaluate sticker triggers
    const stickerResult = evaluateStickerTriggers(stickerId, state, messageId);
    if (stickerResult.changed) {
      await this.save();
    }
  }

  async setPresence(newState: "ACTIVE" | "BRB" | "AWAY", expectedReturnAt?: string): Promise<void> {
    const state = await this.load();
    handlePresenceChange(state, newState, expectedReturnAt);
    await this.save();
  }
}

/**
 * OpenClaw plugin export
 */
export const plugin: PluginModule<AffectionPluginConfig> = {
  name: "openvb3-affection",
  version: "1.0.0",
  
  async load(ctx) {
    const config = ctx.config ?? {};
    const workspace = config.workspace ?? ctx.workspace ?? process.cwd();
    const manager = new AffectionManager(workspace, config.debug);

    // Register hooks for message processing
    ctx.on("message:inbound", async (event) => {
      if (event.text) {
        await manager.processMessage(event.text, event.messageId);
      }
      if (event.sticker) {
        await manager.processSticker(event.sticker, event.messageId);
      }
    });

    // Register tool for manual affection queries
    ctx.registerTool({
      name: "affection_status",
      description: "Get current affection state and metrics",
      schema: {
        type: "object",
        properties: {},
      },
      handler: async () => {
        const state = await manager.load();
        return {
          label: state.label,
          aff: state.aff,
          closeness: state.closeness,
          trust: state.trust,
          reliabilityTrust: state.reliabilityTrust,
          irritation: state.irritation,
          presence: state.presence,
          today: state.today,
        };
      },
    });

    // Expose manager for other plugins/hooks
    return { manager };
  },
};

export default plugin;
