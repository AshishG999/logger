import type {
  IPlugin,
  PluginConfiguration,
  PluginMetadata,
  HealthCheckResult,
  RuntimeEventType,
  EventPayloadMap,
} from "@agstack/plugin-sdk";
import {
  validatePluginMetadata,
  validatePluginDependencies,
  checkPluginCompatibility,
  AGSTACK_SDK_VERSION,
} from "@agstack/plugin-sdk";
import { EventBus } from "./event-bus";
import { LifecycleManager } from "./lifecycle";
import type { IRuntimeContextAdapter } from "./runtime-context";

export interface PluginRegistration {
  plugin: IPlugin;
  config: PluginConfiguration;
  state: PluginRegistrationState;
}

export type PluginRegistrationState =
  | "registered"
  | "initializing"
  | "initialized"
  | "running"
  | "failed"
  | "stopped";

export class PluginManager {
  private plugins = new Map<string, PluginRegistration>();
  private order: string[] = [];

  constructor(
    private eventBus: EventBus,
    private lifecycle: LifecycleManager,
    private contextAdapter: IRuntimeContextAdapter
  ) {}

  register(plugin: IPlugin, config?: Partial<PluginConfiguration>): void {
    const name = plugin.metadata.name;
    if (this.plugins.has(name)) {
      throw new Error(`Plugin "${name}" is already registered`);
    }

    const validationErrors = validatePluginMetadata(plugin.metadata);
    if (validationErrors.length > 0) {
      throw new Error(
        `Plugin "${name}" metadata validation failed: ${validationErrors.join("; ")}`
      );
    }

    const compat = checkPluginCompatibility(AGSTACK_SDK_VERSION, plugin.metadata.supportedRuntimeVersions);
    if (!compat.compatible) {
      throw new Error(
        `Plugin "${name}" compatibility check failed: ${compat.reason}`
      );
    }

    const reg: PluginRegistration = {
      plugin,
      config: {
        enabled: true,
        priority: plugin.metadata.priority,
        options: {},
        ...config,
      },
      state: "registered",
    };

    this.plugins.set(name, reg);
    this.order.push(name);
    this.sortByPriority();

    this.eventBus.publish("plugin.loaded", {
      pluginName: name,
      pluginType: plugin.metadata.type,
      pluginVersion: plugin.metadata.version,
    });
  }

  private sortByPriority(): void {
    this.order.sort((a, b) => {
      const pa = this.plugins.get(a)!.config.priority;
      const pb = this.plugins.get(b)!.config.priority;
      return pa - pb;
    });
  }

  async initializeAll(): Promise<void> {
    const depsCheck = this.checkDependencies();
    if (depsCheck.length > 0) {
      throw new Error(`Plugin dependency errors: ${depsCheck.join("; ")}`);
    }

    for (const name of this.order) {
      const reg = this.plugins.get(name)!;
      if (!reg.config.enabled) continue;
      try {
        reg.state = "initializing";

        const runtimeContext = this.contextAdapter.createContext(name, reg.config);

        await reg.plugin.initialize(runtimeContext, reg.config);
        await reg.plugin.start();
        reg.state = "running";

        this.eventBus.publish("plugin.initialized", {
          pluginName: name,
          pluginType: reg.plugin.metadata.type,
          pluginVersion: reg.plugin.metadata.version,
        });
      } catch (error) {
        reg.state = "failed";
        const errMsg = error instanceof Error ? error.message : String(error);
        this.eventBus.publish("plugin.failed", {
          pluginName: name,
          pluginType: reg.plugin.metadata.type,
          pluginVersion: reg.plugin.metadata.version,
          error: errMsg,
        });
      }
    }
  }

  private checkDependencies(): string[] {
    const errors: string[] = [];
    for (const name of this.order) {
      const reg = this.plugins.get(name)!;
      const depErrors = validatePluginDependencies(
        reg.plugin.metadata,
        Array.from(this.plugins.keys())
      );
      errors.push(...depErrors);
    }
    return errors;
  }

  async shutdownAll(): Promise<void> {
    const reversed = [...this.order].reverse();
    for (const name of reversed) {
      const reg = this.plugins.get(name);
      if (!reg || reg.state === "stopped") continue;
      try {
        await reg.plugin.shutdown();
        reg.state = "stopped";
        this.eventBus.publish("plugin.shutdown", {
          pluginName: name,
          pluginType: reg.plugin.metadata.type,
          pluginVersion: reg.plugin.metadata.version,
        });
      } catch {
      }
    }
  }

  async healthCheck(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();
    for (const [name, reg] of this.plugins) {
      try {
        const health = await reg.plugin.health();
        results.set(name, health);
      } catch {
        results.set(name, {
          status: "unavailable",
          pluginName: name,
          pluginVersion: reg.plugin.metadata.version,
          timestamp: Date.now(),
          durationMs: 0,
          message: "Health check failed",
        });
      }
    }
    return results;
  }

  getPlugin(name: string): IPlugin | undefined {
    return this.plugins.get(name)?.plugin;
  }

  getPluginsByType(type: string): IPlugin[] {
    return Array.from(this.plugins.values())
      .filter((r) => r.plugin.metadata.type === type && r.state === "running")
      .map((r) => r.plugin);
  }

  getAllPlugins(): IPlugin[] {
    return Array.from(this.plugins.values()).map((r) => r.plugin);
  }

  getRegistration(name: string): PluginRegistration | undefined {
    return this.plugins.get(name);
  }

  get enabledCount(): number {
    let count = 0;
    for (const reg of this.plugins.values()) {
      if (reg.config.enabled) count++;
    }
    return count;
  }

  get runningCount(): number {
    let count = 0;
    for (const reg of this.plugins.values()) {
      if (reg.state === "running") count++;
    }
    return count;
  }

  get failedCount(): number {
    let count = 0;
    for (const reg of this.plugins.values()) {
      if (reg.state === "failed") count++;
    }
    return count;
  }
}
