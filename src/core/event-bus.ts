export type EventPriority = 0 | 1 | 2;

export interface BusEvent<T = unknown> {
  readonly type: string;
  readonly payload: T;
  readonly metadata: {
    readonly id: string;
    readonly timestamp: bigint;
    readonly source: string;
    readonly priority: EventPriority;
    readonly correlationId?: string;
  };
}

export interface EventHandler<T = unknown> {
  (event: BusEvent<T>): void | Promise<void>;
}

export interface SubscribeOptions {
  priority?: number;
  sync?: boolean;
  retries?: number;
  timeout?: number;
  filter?: (event: BusEvent) => boolean;
}

interface HandlerEntry {
  handler: EventHandler;
  options: SubscribeOptions;
}

export class EventBus {
  private subscribers = new Map<string, HandlerEntry[]>();
  private deadLetter: BusEvent[] = [];
  private readonly maxDeadLetter = 1000;

  publish<T>(type: string, payload: T, options?: {
    priority?: EventPriority;
    source?: string;
    correlationId?: string;
  }): void {
    const event: BusEvent<T> = {
      type,
      payload,
      metadata: {
        id: crypto.randomUUID(),
        timestamp: process.hrtime.bigint(),
        source: options?.source || "unknown",
        priority: options?.priority ?? 1,
        correlationId: options?.correlationId,
      },
    };

    const handlers = this.subscribers.get(type);
    if (!handlers) return;

    for (const entry of handlers) {
      if (entry.options.filter && !entry.options.filter(event as any)) continue;

      const deliver = () => this.deliver(event as any, entry);

      if (entry.options.sync || event.metadata.priority === 0) {
        deliver();
      } else if (event.metadata.priority === 1) {
        queueMicrotask(deliver);
      } else {
        setImmediate(deliver);
      }
    }
  }

  subscribe<T>(type: string, handler: EventHandler<T>, options?: SubscribeOptions): void {
    const entry: HandlerEntry = { handler: handler as EventHandler, options: options || {} };
    const existing = this.subscribers.get(type) || [];
    existing.push(entry);
    this.subscribers.set(type, existing);
  }

  unsubscribe<T>(type: string, handler: EventHandler<T>): void {
    const existing = this.subscribers.get(type);
    if (!existing) return;
    this.subscribers.set(
      type,
      existing.filter((e) => e.handler !== (handler as EventHandler))
    );
  }

  getDeadLetterEvents(): BusEvent[] {
    return [...this.deadLetter];
  }

  clearDeadLetter(): void {
    this.deadLetter = [];
  }

  private async deliver(event: BusEvent, entry: HandlerEntry): Promise<void> {
    const maxRetries = entry.options.retries ?? 0;
    const timeout = entry.options.timeout ?? 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = entry.handler(event);
        if (result instanceof Promise) {
          if (timeout > 0) {
            await Promise.race([
              result,
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Handler timeout")), timeout)
              ),
            ]);
          } else {
            await result;
          }
        }
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          this.deadLetter.push(event);
          if (this.deadLetter.length > this.maxDeadLetter) {
            this.deadLetter.shift();
          }
        }
      }
    }
  }
}
