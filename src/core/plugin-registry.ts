import * as fs from "node:fs";
import { EventBus } from "./event-bus";

export type PluginType =
  | "core"
  | "storage"
  | "ai-provider"
  | "notify"
  | "collector"
  | "observer"
  | "custom";

export interface PluginMetadata {
  name: string;
  version: string;
  type: PluginType;
  description?: string;
}

export interface PluginHealth {
  healthy: boolean;
  message?: string;
  lastCheck: number;
}

export interface IPlugin {
  readonly metadata: PluginMetadata;
  activate(eventBus: EventBus): Promise<void>;
  deactivate(): Promise<void>;
  health(): Promise<PluginHealth>;
}

export interface PluginPackage {
  plugin: {
    type: PluginType;
    entry: string;
  };
}

export class PluginRegistry {
  private plugins = new Map<string, IPlugin>();

  register(plugin: IPlugin): void {
    if (this.plugins.has(plugin.metadata.name)) {
      throw new Error(`Plugin "${plugin.metadata.name}" already registered`);
    }
    this.plugins.set(plugin.metadata.name, plugin);
  }

  async activateAll(eventBus: EventBus): Promise<void> {
    for (const [, plugin] of this.plugins) {
      try {
        await plugin.activate(eventBus);
      } catch (error) {
        eventBus.publish("plugin.activate.failed", {
          plugin: plugin.metadata.name,
          error: String(error),
        }, { priority: 0 });
      }
    }
  }

  async deactivateAll(): Promise<void> {
    const reversed = Array.from(this.plugins.entries()).reverse();
    for (const [, plugin] of reversed) {
      try {
        await plugin.deactivate();
      } catch {
      }
    }
  }

  get(type: PluginType): IPlugin[] {
    return Array.from(this.plugins.values()).filter(
      (p) => p.metadata.type === type
    );
  }

  getByName(name: string): IPlugin | undefined {
    return this.plugins.get(name);
  }

  getAll(): IPlugin[] {
    return Array.from(this.plugins.values());
  }

  async discover(): Promise<void> {
    const scopeDir = this.resolveScopeDir();
    if (!scopeDir) return;

    try {
      const entries = await fs.promises.readdir(scopeDir);
      for (const entry of entries) {
        await this.tryLoadPlugin(scopeDir, entry);
      }
    } catch {
    }
  }

  private async tryLoadPlugin(scopeDir: string, name: string): Promise<void> {
    try {
      const pkgPath = `${scopeDir}/${name}/package.json`;
      const pkg: PluginPackage = JSON.parse(
        await fs.promises.readFile(pkgPath, "utf-8")
      );
      if (!pkg.plugin?.entry) return;

      const pluginModule = await import(`${scopeDir}/${name}/${pkg.plugin.entry}`);
      const factory = pluginModule.default || pluginModule;
      if (typeof factory !== "function") return;

      const plugin: IPlugin = await factory();
      this.register(plugin);
    } catch {
    }
  }

  private resolveScopeDir(): string | null {
    try {
      return `${process.cwd()}/node_modules/@agstack`;
    } catch {
      return null;
    }
  }
}
