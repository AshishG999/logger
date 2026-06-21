import type { RuntimeConfig } from "../types";
import { DEFAULTS } from "./defaults";

export class ConfigManager {
  private config: RuntimeConfig;
  private static instance: ConfigManager;

  private constructor(config?: Partial<RuntimeConfig>) {
    this.config = this.merge(DEFAULTS, config || {});
  }

  static initialize(config?: Partial<RuntimeConfig>): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(config);
    }
    return ConfigManager.instance;
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      throw new Error("ConfigManager not initialized. Call initialize() first.");
    }
    return ConfigManager.instance;
  }

  get<K extends keyof RuntimeConfig>(key: K): RuntimeConfig[K] {
    return this.config[key];
  }

  getAll(): RuntimeConfig {
    return { ...this.config };
  }

  update(partial: Partial<RuntimeConfig>): void {
    this.config = this.merge(this.config, partial);
  }

  private merge(base: RuntimeConfig, override: Partial<RuntimeConfig>): RuntimeConfig {
    const result = { ...base };
    for (const key of Object.keys(override) as (keyof RuntimeConfig)[]) {
      const val = override[key];
      if (val !== undefined && typeof val === "object" && !Array.isArray(val) && val !== null) {
        (result as any)[key] = { ...(base[key] as any), ...(val as Record<string, unknown>) };
      } else if (val !== undefined) {
        (result as any)[key] = val;
      }
    }
    return result;
  }
}
