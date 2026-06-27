export interface QueueItem<T = unknown> {
  id: string;
  data: T;
  priority: number;
  retries: number;
  maxRetries: number;
  createdAt: number;
  nextRetryAt?: number;
}

export interface QueueStats {
  size: number;
  processing: number;
  failed: number;
  retrying: number;
  backpressure: boolean;
}

export interface QueueConsumer<T = unknown> {
  (item: QueueItem<T>): Promise<void>;
}

export class Queue<T = unknown> {
  private items: QueueItem<T>[] = [];
  private processing = new Map<string, QueueItem<T>>();
  private deadLetter: QueueItem<T>[] = [];
  private maxSize: number;
  private highWaterMark: number;
  private _backpressure = false;
  private drainResolve: (() => void) | null = null;
  private processedCount = 0;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
    this.highWaterMark = Math.floor(maxSize * 0.8);
  }

  enqueue(data: T, options?: { priority?: number; maxRetries?: number }): boolean {
    if (this.items.length >= this.maxSize) {
      this._backpressure = true;
      return false;
    }

    const item: QueueItem<T> = {
      id: crypto.randomUUID(),
      data,
      priority: options?.priority ?? 5,
      retries: 0,
      maxRetries: options?.maxRetries ?? 3,
      createdAt: Date.now(),
    };

    this.insertSorted(item);

    if (this.items.length >= this.highWaterMark) {
      this._backpressure = true;
    } else {
      this._backpressure = false;
    }

    return true;
  }

  dequeue(): QueueItem<T> | null {
    if (this.items.length === 0) return null;

    const now = Date.now();
    const index = this.items.findIndex(
      (item) => !item.nextRetryAt || item.nextRetryAt <= now
    );
    if (index === -1) return null;

    const item = this.items.splice(index, 1)[0];
    this.processing.set(item.id, item);
    return item;
  }

  complete(id: string): void {
    this.processing.delete(id);
    this.processedCount++;
    this.tryDrain();
  }

  fail(id: string): boolean {
    const item = this.processing.get(id);
    this.processing.delete(id);
    if (!item) return false;

    item.retries++;
    if (item.retries < item.maxRetries) {
      item.nextRetryAt = Date.now() + Math.pow(2, item.retries) * 1000;
      this.insertSorted(item);
      this.tryDrain();
      return true;
    }

    this.deadLetter.push(item);
    this.tryDrain();
    return false;
  }

  stats(): QueueStats {
    return {
      size: this.items.length,
      processing: this.processing.size,
      failed: this.deadLetter.length,
      retrying: this.items.filter((i) => i.nextRetryAt).length,
      backpressure: this._backpressure,
    };
  }

  getDeadLetter(): QueueItem<T>[] {
    return [...this.deadLetter];
  }

  clearDeadLetter(): void {
    this.deadLetter = [];
  }

  async drain(): Promise<void> {
    if (this.items.length === 0 && this.processing.size === 0) return;
    return new Promise<void>((resolve) => {
      this.drainResolve = resolve;
    });
  }

  flush(): QueueItem<T>[] {
    const items = [...this.items];
    this.items = [];
    return items;
  }

  get backpressure(): boolean {
    return this._backpressure;
  }

  private tryDrain(): void {
    if (this.drainResolve && this.items.length === 0 && this.processing.size === 0) {
      const resolve = this.drainResolve;
      this.drainResolve = null;
      resolve();
    }
  }

  private insertSorted(item: QueueItem<T>): void {
    const index = this.items.findIndex((i) => i.priority < item.priority);
    if (index === -1) {
      this.items.push(item);
    } else {
      this.items.splice(index, 0, item);
    }
  }
}
