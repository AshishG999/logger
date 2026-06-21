import { Kernel } from "./core/kernel";
import { RuntimeEngine } from "./engine/runtime-engine";
import { TransactionService } from "./transaction/service";
import { ConfigManager } from "./config/manager";
import { EnrichmentPipeline } from "./enrichment/pipeline";
import { FileStorage } from "./storage/file-storage";
import type { RuntimeConfig, RuntimePlugin } from "./types";

export const version = "0.2.0";

let kernel: Kernel | null = null;
let plugins: RuntimePlugin[] = [];

export async function initialize(config?: Partial<RuntimeConfig>): Promise<void> {
  if (kernel) return;

  ConfigManager.initialize(config);
  kernel = new Kernel();

  const transactionService = new TransactionService();
  transactionService.register(kernel.eventBus);

  const runtimeEngine = new RuntimeEngine();
  await runtimeEngine.initialize(kernel);

  // Register user-provided plugins
  if (config?.plugins) {
    for (const factory of config.plugins) {
      const plugin = await factory();
      await plugin.initialize(kernel.facade());
      plugins.push(plugin);
    }
  }

  // Default built-in storage if no storage plugin was registered
  if (!plugins.some((p) => p.name.startsWith("storage"))) {
    const storage = new FileStorage();
    await storage.initialize(kernel.facade());
    plugins.push(storage);
  }

  registerCollectors(kernel, transactionService);
  // Register enrichment pipeline (Stage 2) between worker and storage
  const enrichment = new EnrichmentPipeline();
  enrichment.register(kernel.eventBus);

  await kernel.boot();
}

export async function shutdown(): Promise<void> {
  if (!kernel) return;
  await kernel.shutdown();
  for (const plugin of plugins) {
    await plugin.shutdown();
  }
  plugins = [];
  kernel = null;
}

function registerCollectors(kernel: Kernel, ts: TransactionService): void {
  const bus = kernel.eventBus;

  bus.subscribe("transaction.completed", (event: any) => {
    const { transaction } = event.payload;
    const priority = transaction.response?.statusCode && transaction.response.statusCode >= 500 ? 0 : 1;
    const accepted = kernel.queue.enqueue(transaction, { priority });
    if (!accepted) {
      bus.publish("queue.backpressure", { transaction }, {
        source: "kernel",
        correlationId: transaction.correlationId,
        priority: 0,
      });
    }
  }, { sync: true });

  bus.subscribe("error.uncaught", (event: any) => {
    kernel.eventBus.publish("error.queued", event.payload, { priority: 0, source: "kernel" });
  }, { sync: true });
}
