import type { RuntimeConfiguration, PayloadConfiguration, SecurityConfiguration } from "@agstack/plugin-sdk";
import { DEFAULT_RUNTIME_CONFIG, DEFAULT_PAYLOAD_CONFIG } from "@agstack/plugin-sdk";

import type { IPlugin } from "@agstack/plugin-sdk";

export interface RuntimeKernelConfig {
  runtime?: RuntimeConfiguration;
  payload?: PayloadConfiguration;
  security?: SecurityConfiguration;
  plugins?: Array<() => IPlugin | Promise<IPlugin>>;
}

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private config: RuntimeKernelConfig & Record<string, unknown>;

  private constructor(config?: RuntimeKernelConfig) {
    const runtimeConfig = DEFAULT_RUNTIME_CONFIG;
    this.config = {
      ...config,
      runtime: { ...runtimeConfig, ...config?.runtime },
      payload: { ...DEFAULT_PAYLOAD_CONFIG, ...config?.payload },
      security: {
        maskFields: config?.security?.maskFields ?? DEFAULT_PAYLOAD_CONFIG.maskFields ?? [],
        maskPatterns: config?.security?.maskPatterns ?? [],
        enableThreatDetection: config?.security?.enableThreatDetection ?? false,
        blockedHeaders: config?.security?.blockedHeaders ?? [],
      },
    } as RuntimeKernelConfig & Record<string, unknown>;
    this.applyEnvOverrides();
  }

  static initialize(config?: RuntimeKernelConfig): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager(config);
    }
    return ConfigurationManager.instance;
  }

  static reset(): void {
    ConfigurationManager.instance = undefined as unknown as ConfigurationManager;
  }

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  private applyEnvOverrides(): void {
    const rt = this.config.runtime as Record<string, unknown>;
    if (process.env.AGSTACK_DEBUG === "true") {
      rt.debug = true;
    }
    if (process.env.AGSTACK_QUEUE_MAX_SIZE) {
      rt.queueMaxSize = parseInt(process.env.AGSTACK_QUEUE_MAX_SIZE, 10);
    }
    if (process.env.AGSTACK_WORKER_CONCURRENCY) {
      rt.workerConcurrency = parseInt(process.env.AGSTACK_WORKER_CONCURRENCY, 10);
    }
    if (process.env.AGSTACK_SHUTDOWN_TIMEOUT) {
      rt.shutdownTimeoutMs = parseInt(process.env.AGSTACK_SHUTDOWN_TIMEOUT, 10);
    }
  }

  get<K extends keyof RuntimeKernelConfig>(key: K): RuntimeKernelConfig[K] {
    return this.config[key] as RuntimeKernelConfig[K];
  }

  getAll(): RuntimeKernelConfig {
    return { ...this.config } as RuntimeKernelConfig;
  }

  update(partial: Partial<RuntimeKernelConfig>): void {
    if (partial.runtime) {
      Object.assign(this.config.runtime ?? {}, partial.runtime);
    }
    if (partial.payload) {
      Object.assign(this.config.payload ?? {}, partial.payload);
    }
    if (partial.security) {
      Object.assign(this.config.security ?? {}, partial.security);
    }
  }
}
