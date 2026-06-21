import { EventBus } from "./event-bus";
import { PluginRegistry } from "./plugin-registry";
import { DIContainer } from "./di-container";
import { Queue } from "./queue";
import { WorkerPool } from "./worker-pool";
import { LifecycleManager } from "./lifecycle";
import type { Transaction, KernelFacade } from "../types/index";

export interface KernelConfig {
  queueMaxSize?: number;
  workerConcurrency?: number;
  workerPollInterval?: number;
}

export class Kernel {
  readonly eventBus: EventBus;
  readonly plugins: PluginRegistry;
  readonly di: DIContainer;
  readonly queue: Queue<Transaction>;
  readonly workers: WorkerPool;
  readonly lifecycle: LifecycleManager;

  constructor(config?: KernelConfig) {
    this.eventBus = new EventBus();
    this.plugins = new PluginRegistry();
    this.di = new DIContainer();
    this.queue = new Queue<Transaction>(config?.queueMaxSize);
    this.workers = new WorkerPool({
      concurrency: config?.workerConcurrency,
      pollIntervalMs: config?.workerPollInterval,
    });
    this.lifecycle = new LifecycleManager();
  }

  async boot(): Promise<void> {
    await this.lifecycle.boot(async () => {
      await this.plugins.discover();
      await this.plugins.activateAll(this.eventBus);
      this.workers.start(this.queue, async (item) => {
        this.eventBus.publish("queue.item.process", item.data, {
          source: "kernel",
          correlationId: item.data.correlationId,
        });
      });
      this.eventBus.publish("kernel.booted", {}, { priority: 0, source: "kernel" });
    });
  }

  async shutdown(): Promise<void> {
    this.eventBus.publish("kernel.shuttingdown", {}, { priority: 0, source: "kernel" });
    await this.workers.stop();
    await this.queue.drain();
    await this.lifecycle.shutdown();
    this.eventBus.publish("kernel.stopped", {}, { priority: 0, source: "kernel" });
  }

  health(): KernelHealth {
    return {
      state: this.lifecycle.state,
      queue: this.queue.stats(),
      plugins: this.plugins.getAll().length,
    };
  }

  facade(): KernelFacade {
    return {
      eventBus: this.eventBus,
      di: this.di,
      lifecycle: this.lifecycle,
    };
  }
}

export interface KernelHealth {
  state: string;
  queue: QueueStats;
  plugins: number;
}

interface QueueStats {
  size: number;
  processing: number;
  failed: number;
  retrying: number;
  backpressure: boolean;
}
