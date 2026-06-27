import { Queue, QueueConsumer } from "./queue";

export interface WorkerPoolOptions {
  concurrency?: number;
  pollIntervalMs?: number;
}

export interface WorkerStats {
  name: string;
  processed: number;
  failed: number;
  running: boolean;
}

export class WorkerPool {
  private workers: WorkerInstance[] = [];
  private _running = false;

  constructor(private options: WorkerPoolOptions = {}) {
    this.options = { concurrency: 4, pollIntervalMs: 100, ...options };
  }

  get running(): boolean {
    return this._running;
  }

  start<T>(queue: Queue<T>, consumer: QueueConsumer<T>): void {
    if (this._running) return;
    this._running = true;

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
    this._running = false;
    await Promise.all(this.workers.map((w) => w.stop()));
    this.workers = [];
  }

  scaleTo(concurrency: number): void {
    if (concurrency < 1) concurrency = 1;
    while (this.workers.length < concurrency) {
      const worker = new WorkerInstance(
        `worker-${this.workers.length}`,
        this.workers[0]?.["queue"] || null as any,
        this.workers[0]?.["consumer"] || null as any,
        this.options.pollIntervalMs ?? 100
      );
      this.workers.push(worker);
      worker.start();
    }
    while (this.workers.length > concurrency) {
      const worker = this.workers.pop();
      if (worker) worker.stop();
    }
  }

  getStats(): WorkerStats[] {
    return this.workers.map((w) => ({
      name: w.name,
      processed: w.processed,
      failed: w.failed,
      running: w["running"],
    }));
  }

  get totalProcessed(): number {
    return this.workers.reduce((sum, w) => sum + w.processed, 0);
  }

  get totalFailed(): number {
    return this.workers.reduce((sum, w) => sum + w.failed, 0);
  }
}

class WorkerInstance {
  private _running = false;
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

  get running(): boolean {
    return this._running;
  }

  start(): void {
    this._running = true;
    this.process();
    this.interval = setInterval(() => this.process(), this.intervalMs).unref();
  }

  async stop(): Promise<void> {
    this._running = false;
    if (this.interval) clearInterval(this.interval);
    await Promise.all(Array.from(this.pending));
  }

  private async process(): Promise<void> {
    if (!this._running) return;

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
