import { Queue, QueueConsumer } from "./queue";

export interface WorkerPoolOptions {
  concurrency?: number;
  pollIntervalMs?: number;
}

export class WorkerPool {
  private workers: WorkerInstance[] = [];
  private running = false;

  constructor(private options: WorkerPoolOptions = {}) {
    this.options = { concurrency: 4, pollIntervalMs: 100, ...options };
  }

  start<T>(queue: Queue<T>, consumer: QueueConsumer<T>): void {
    if (this.running) return;
    this.running = true;

    for (let i = 0; i < (this.options.concurrency ?? 4); i++) {
      const worker = new WorkerInstance(
        `worker-${i}`,
        queue as unknown as Queue,
        consumer as unknown as QueueConsumer,
        this.options.pollIntervalMs ?? 100
      );
      this.workers.push(worker);
      worker.start();
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    await Promise.all(this.workers.map((w) => w.stop()));
    this.workers = [];
  }
}

class WorkerInstance {
  private running = false;
  private interval?: ReturnType<typeof setInterval>;
  private pending = new Set<Promise<void>>();
  processed = 0;
  failed = 0;

  constructor(
    readonly name: string,
    private queue: Queue,
    private consumer: QueueConsumer,
    private intervalMs: number
  ) {}

  start(): void {
    this.running = true;
    this.process();
    this.interval = setInterval(() => this.process(), this.intervalMs).unref();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.interval) clearInterval(this.interval);
    await Promise.all(Array.from(this.pending));
  }

  private async process(): Promise<void> {
    if (!this.running) return;

    const item = this.queue.dequeue();
    if (!item) return;

    const promise = (async () => {
      try {
        await this.consumer(item);
        this.queue.complete(item.id);
        this.processed++;
      } catch {
        this.queue.fail(item.id);
        this.failed++;
      }
    })();

    this.pending.add(promise);
    promise.finally(() => this.pending.delete(promise));
  }
}
