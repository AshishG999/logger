import { EventBus } from "./event-bus";
import { Queue } from "./queue";
import { WorkerPool } from "./worker-pool";
import { LifecycleManager } from "./lifecycle";
import { PluginManager } from "./plugin-manager";
import { HookEngine } from "./hook-engine";
import { ConfigurationManager, RuntimeKernelConfig } from "./configuration";
import { HealthMonitor, SystemHealth } from "./health-monitor";
import { MetricsCollector } from "./metrics";
import { RuntimeContextAdapter } from "./runtime-context";
import { HttpInterceptor } from "../interceptor/http";
import { TransactionEngine, Transaction } from "../transaction/engine";
import type { IPlugin, PluginConfiguration, HealthCheckResult } from "@agstack/plugin-sdk";
import type { QueueStats } from "./queue";

export interface KernelStats {
  state: string;
  uptimeMs: number;
  queue: QueueStats;
  plugins: { total: number; enabled: number; running: number; failed: number };
  workers: { total: number; processed: number; failed: number };
  eventBusSubscribers: number;
  transactions: { active: number; total: number };
}

export class Kernel {
  readonly eventBus: EventBus;
  readonly queue: Queue<Transaction>;
  readonly workers: WorkerPool;
  readonly lifecycle: LifecycleManager;
  readonly pluginManager: PluginManager;
  readonly hookEngine: HookEngine;
  readonly config: ConfigurationManager;
  readonly healthMonitor: HealthMonitor;
  readonly metrics: MetricsCollector;
  readonly httpInterceptor: HttpInterceptor;
  readonly transactionEngine: TransactionEngine;

  private startedAt = 0;
  private transactionCount = 0;

  constructor(config?: RuntimeKernelConfig) {
    this.eventBus = new EventBus();
    this.queue = new Queue<Transaction>(config?.runtime?.queueMaxSize);
    this.workers = new WorkerPool({
      concurrency: config?.runtime?.workerConcurrency,
      pollIntervalMs: config?.runtime?.workerPollIntervalMs,
    });
    this.lifecycle = new LifecycleManager();
    this.config = ConfigurationManager.initialize(config);
    this.metrics = new MetricsCollector();
    this.hookEngine = new HookEngine();
    this.transactionEngine = new TransactionEngine();
    this.httpInterceptor = new HttpInterceptor(
      this.eventBus,
      this.transactionEngine,
      this.metrics
    );
    this.healthMonitor = new HealthMonitor(
      this.eventBus,
      this.lifecycle,
      { intervalMs: config?.runtime?.workerPollIntervalMs ? config.runtime.workerPollIntervalMs * 10 : 30000 }
    );

    const contextAdapter = new RuntimeContextAdapter(
      this.eventBus,
      this.lifecycle,
      this.healthMonitor
    );

    this.pluginManager = new PluginManager(
      this.eventBus,
      this.lifecycle,
      contextAdapter
    );
  }

  async boot(): Promise<void> {
    await this.lifecycle.boot(async () => {
      this.startedAt = Date.now();

      this.httpInterceptor.initialize();

      this.healthMonitor.start();

      this.eventBus.publish("runtime.started", {
        version: "2.0.0",
        startedAt: this.startedAt,
        nodeVersion: process.version,
        platform: process.platform,
      });

      await this.pluginManager.initializeAll();

      this.workers.start(this.queue, async (item) => {
        const tx = item.data;
        this.transactionCount++;

        this.metrics.incrementCounter("queue.processed");

        const pluginResults = await this.pluginManager.getPluginsByType("storage");
        for (const plugin of pluginResults) {
          try {
            await (plugin as any).save(tx);
            this.metrics.incrementCounter("plugin.executions", {
              plugin: plugin.metadata.name,
              type: "storage",
              status: "success",
            });
          } catch (err) {
            this.metrics.incrementCounter("plugin.executions", {
              plugin: plugin.metadata.name,
              type: "storage",
              status: "failed",
            });
            this.eventBus.publish("plugin.error", {
              pluginName: plugin.metadata.name,
              pluginType: plugin.metadata.type,
              pluginVersion: plugin.metadata.version,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const aiPlugins = this.pluginManager.getPluginsByType("ai");
        for (const plugin of aiPlugins) {
          try {
            await (plugin as any).analyze(tx);
          } catch {
          }
        }

        const notifyPlugins = this.pluginManager.getPluginsByType("notification");
        for (const plugin of notifyPlugins) {
          try {
            await (plugin as any).send({
              channel: plugin.metadata.name,
              title: "Transaction Processed",
              message: `Transaction ${tx.correlationId} completed`,
              severity: "info",
              transactionId: tx.correlationId,
            });
          } catch {
          }
        }

        const metricsPlugins = this.pluginManager.getPluginsByType("metrics");
        for (const plugin of metricsPlugins) {
          try {
            await (plugin as any).recordCounter("transaction.processed", 1);
          } catch {
          }
        }
      });
    });
  }

  registerPlugin(
    plugin: IPlugin,
    config?: Partial<PluginConfiguration>
  ): void {
    this.pluginManager.register(plugin, config);
  }

  async shutdown(): Promise<void> {
    this.eventBus.publish("runtime.stopping", {});

    const uptimeMs = Date.now() - this.startedAt;
    await this.healthMonitor.stop();
    await this.workers.stop();
    await this.queue.drain();
    await this.pluginManager.shutdownAll();
    await this.lifecycle.shutdown();
    this.httpInterceptor.shutdown();

    this.eventBus.publish("runtime.stopped", { uptimeMs });
  }

  getStats(): KernelStats {
    return {
      state: this.lifecycle.state,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
      queue: this.queue.stats(),
      plugins: {
        total: this.pluginManager.enabledCount,
        enabled: this.pluginManager.enabledCount,
        running: this.pluginManager.runningCount,
        failed: this.pluginManager.failedCount,
      },
      workers: {
        total: this.workers.getStats().length,
        processed: this.workers.totalProcessed,
        failed: this.workers.totalFailed,
      },
      eventBusSubscribers: this.eventBus.subscriberCount(),
      transactions: {
        active: this.transactionEngine.getActiveCount(),
        total: this.transactionCount,
      },
    };
  }

  getSystemHealth(): SystemHealth {
    return this.healthMonitor.getSystemHealth(
      this.pluginManager.runningCount,
      this.queue.stats().size,
      this.workers.getStats().length
    );
  }

  async getPluginHealth(): Promise<Map<string, HealthCheckResult>> {
    return this.pluginManager.healthCheck();
  }
}
