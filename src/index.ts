import { Kernel } from "./core/kernel";
import type { RuntimeKernelConfig } from "./core/configuration";
import type { IPlugin, PluginConfiguration } from "@agstack/plugin-sdk";

export const version = "2.0.0";

let kernel: Kernel | null = null;

export async function initialize(config?: RuntimeKernelConfig): Promise<void> {
  if (kernel) return;

  kernel = new Kernel(config);

  if (config?.plugins) {
    for (const factory of config.plugins) {
      const plugin = await factory();
      registerPlugin(plugin);
    }
  }

  await kernel.boot();
}

export function registerPlugin(
  plugin: IPlugin,
  pluginConfig?: Partial<PluginConfiguration>
): void {
  if (!kernel) {
    throw new Error("Kernel not initialized. Call initialize() first.");
  }
  kernel.registerPlugin(plugin, pluginConfig);
}

export async function shutdown(): Promise<void> {
  if (!kernel) return;
  await kernel.shutdown();
  kernel = null;
}

export function getKernel(): Kernel {
  if (!kernel) {
    throw new Error("Kernel not initialized. Call initialize() first.");
  }
  return kernel;
}

export function isInitialized(): boolean {
  return kernel !== null;
}

export { Kernel } from "./core/kernel";
export { EventBus } from "./core/event-bus";
export { Queue } from "./core/queue";
export { WorkerPool } from "./core/worker-pool";
export { LifecycleManager } from "./core/lifecycle";
export { PluginManager } from "./core/plugin-manager";
export { HookEngine } from "./core/hook-engine";
export { ConfigurationManager } from "./core/configuration";
export { HealthMonitor } from "./core/health-monitor";
export { MetricsCollector } from "./core/metrics";
export { TransactionEngine } from "./transaction/engine";
export { RequestCollector } from "./collectors/request";
export { ResponseCollector } from "./collectors/response";
export type { Transaction } from "./transaction/engine";
export type { RawRequestInfo, RawResponseInfo, TransactionStatus, TransactionError, TimelineEvent, PayloadMetadata } from "./transaction/engine";
export type { KernelStats } from "./core/kernel";
export type { SystemHealth } from "./core/health-monitor";
export type { RuntimeKernelConfig } from "./core/configuration";
export type { QueueStats, QueueItem, QueueConsumer } from "./core/queue";
export type { WorkerPoolOptions, WorkerStats } from "./core/worker-pool";
export type { PluginRegistration, PluginRegistrationState } from "./core/plugin-manager";
export type { KernelState, ShutdownHandler } from "./core/lifecycle";
export type { HookRegistration } from "./core/hook-engine";
