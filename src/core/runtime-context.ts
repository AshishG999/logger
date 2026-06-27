import type {
  IRuntimeContext,
  IEventBus,
  ILogger,
  ILifecycle,
  HealthReporter,
  HealthStatus,
  PluginConfiguration,
} from "@agstack/plugin-sdk";
import { EventBus } from "./event-bus";
import { LifecycleManager } from "./lifecycle";

const AGSTACK_RUNTIME_VERSION = "2.0.0";
const AGSTACK_SDK_VERSION_VALUE = "0.1.0";

export class RuntimeContextAdapter implements IRuntimeContextAdapter {
  constructor(
    private eventBus: EventBus,
    private lifecycle: LifecycleManager,
    private healthReporter: HealthReporter
  ) {}

  createContext(pluginName: string, config: PluginConfiguration): IRuntimeContext {
    return {
      eventBus: this.eventBus as unknown as IEventBus,
      logger: this.createLogger(pluginName),
      lifecycle: this.lifecycle as unknown as ILifecycle,
      health: this.healthReporter,
      runtimeVersion: AGSTACK_RUNTIME_VERSION,
      sdkVersion: AGSTACK_SDK_VERSION_VALUE,
      nodeVersion: process.version,
      platform: process.platform,
      startedAt: Date.now(),
      getPluginConfiguration: (name: string) => {
        return undefined;
      },
      getCapabilities: () => [],
    };
  }

  private createLogger(pluginName: string): ILogger {
    return {
      debug: (msg: string, ...args: unknown[]) => {
        if (process.env.AGSTACK_DEBUG === "true") {
          console.debug(`[${pluginName}] ${msg}`, ...args);
        }
      },
      info: (msg: string, ...args: unknown[]) => {
        console.info(`[${pluginName}] ${msg}`, ...args);
      },
      warn: (msg: string, ...args: unknown[]) => {
        console.warn(`[${pluginName}] ${msg}`, ...args);
      },
      error: (msg: string, ...args: unknown[]) => {
        console.error(`[${pluginName}] ${msg}`, ...args);
      },
    };
  }
}

export interface IRuntimeContextAdapter {
  createContext(pluginName: string, config: PluginConfiguration): IRuntimeContext;
}
