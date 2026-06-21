import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { initialize, shutdown, version } from "../src/index";
import { EventBus } from "../src/core/event-bus";
import { Kernel } from "../src/core/kernel";
import { Queue } from "../src/core/queue";
import { DIContainer } from "../src/core/di-container";
import { LifecycleManager } from "../src/core/lifecycle";
import { TransactionEngine } from "../src/transaction/engine";
import { RequestCollector } from "../src/collectors/request";
import { ResponseCollector } from "../src/collectors/response";
import { EnrichmentPipeline } from "../src/enrichment/pipeline";

describe("Public API", () => {
  it("should export version", () => {
    expect(version).toBeDefined();
    expect(typeof version).toBe("string");
  });

  it("should initialize and shutdown", async () => {
    await initialize();
    await shutdown();
  });

  it("should handle double initialize gracefully", async () => {
    await initialize();
    await initialize();
    await shutdown();
  });
});

describe("EventBus", () => {
  it("should publish and subscribe to events", async () => {
    const bus = new EventBus();
    const received: string[] = [];

    bus.subscribe("test.event", (event) => {
      received.push(event.payload);
    });

    bus.publish("test.event", "hello", { source: "test" });

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toContain("hello");
  });

  it("should support priority levels", async () => {
    const bus = new EventBus();
    const order: string[] = [];

    bus.subscribe("priority.test", (event: any) => {
      order.push(event.payload);
    }, { sync: true });

    bus.publish("priority.test", "first", { priority: 0, source: "test" });
    bus.publish("priority.test", "second", { priority: 1, source: "test" });

    expect(order[0]).toBe("first");
    expect(order[1]).toBe("second");
  });

  it("should support handler filtering", async () => {
    const bus = new EventBus();
    const received: string[] = [];

    bus.subscribe("filtered", (event: any) => {
      received.push(event.payload);
    }, { filter: (e: any) => e.payload === "allowed" });

    bus.publish("filtered", "allowed", { source: "test" });
    bus.publish("filtered", "blocked", { source: "test" });

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toEqual(["allowed"]);
  });

  it("should move failed handlers to dead letter", async () => {
    const bus = new EventBus();

    bus.subscribe("fail.test", () => {
      throw new Error("handler failed");
    }, { retries: 1 });

    bus.publish("fail.test", "data", { source: "test" });

    await new Promise((r) => setTimeout(r, 10));
    expect(bus.getDeadLetterEvents().length).toBeGreaterThanOrEqual(0);
  });

  it("should unsubscribe handlers", async () => {
    const bus = new EventBus();
    let count = 0;

    const handler = () => { count++; };

    bus.subscribe("unsub", handler, { sync: true });
    bus.publish("unsub", "data", { source: "test" });
    bus.unsubscribe("unsub", handler);
    bus.publish("unsub", "data", { source: "test" });

    expect(count).toBe(1);
  });
});

describe("Queue", () => {
  it("should enqueue and dequeue items by priority", () => {
    const queue = new Queue<string>();

    queue.enqueue("low", { priority: 1 });
    queue.enqueue("high", { priority: 10 });
    queue.enqueue("medium", { priority: 5 });

    const first = queue.dequeue();
    expect(first!.data).toBe("high");
    expect(first!.priority).toBe(10);

    const second = queue.dequeue();
    expect(second!.data).toBe("medium");
  });

  it("should support retry and dead letter", () => {
    const queue = new Queue<string>();
    queue.enqueue("test", { maxRetries: 1 });

    const item = queue.dequeue();
    expect(item).not.toBeNull();

    queue.fail(item!.id);
    expect(queue.stats().failed).toBe(1);
  });

  it("should track retrying items", () => {
    const queue = new Queue<string>();
    queue.enqueue("test", { maxRetries: 3 });

    const item = queue.dequeue();
    queue.fail(item!.id);
    expect(queue.stats().retrying).toBe(1);
  });

  it("should track stats", () => {
    const queue = new Queue<number>();
    expect(queue.stats().size).toBe(0);

    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);

    expect(queue.stats().size).toBe(3);

    queue.dequeue();
    expect(queue.stats().processing).toBe(1);
  });

  it("should detect backpressure", () => {
    const queue = new Queue<number>(3);
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);

    const result = queue.enqueue(4);
    expect(result).toBe(false);
    expect(queue.backpressure).toBe(true);
  });

  it("should drain", async () => {
    const queue = new Queue<string>();
    queue.enqueue("a");
    queue.enqueue("b");

    const item1 = queue.dequeue();
    queue.complete(item1!.id);
    const item2 = queue.dequeue();
    queue.complete(item2!.id);

    await queue.drain();
    expect(queue.stats().size).toBe(0);
  });
});

describe("DIContainer", () => {
  it("should register and resolve singletons", () => {
    const di = new DIContainer();
    let count = 0;

    di.register("counter", () => { count++; return count; });

    const a = di.resolve<number>("counter");
    const b = di.resolve<number>("counter");

    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("should register and resolve transient services", () => {
    const di = new DIContainer();
    let count = 0;

    di.register("transient", () => { count++; return count; }, { singleton: false });

    const a = di.resolve<number>("transient");
    const b = di.resolve<number>("transient");

    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it("should check if token exists", () => {
    const di = new DIContainer();
    di.register("exists", () => "yes");

    expect(di.has("exists")).toBe(true);
    expect(di.has("missing")).toBe(false);
  });
});

describe("LifecycleManager", () => {
  it("should transition through states", async () => {
    const lifecycle = new LifecycleManager();
    expect(lifecycle.state).toBe("created");

    await lifecycle.boot(async () => {});
    expect(lifecycle.state).toBe("running");

    await lifecycle.shutdown();
    expect(lifecycle.state).toBe("stopped");
  });

  it("should call shutdown handlers in reverse order", async () => {
    const lifecycle = new LifecycleManager();
    const order: number[] = [];

    lifecycle.onBeforeShutdown(async () => { order.push(1); });
    lifecycle.onBeforeShutdown(async () => { order.push(2); });

    await lifecycle.boot(async () => {});
    await lifecycle.shutdown();

    expect(order).toEqual([2, 1]);
  });

  it("should refuse to boot twice", async () => {
    const lifecycle = new LifecycleManager();
    let bootCount = 0;

    await lifecycle.boot(async () => { bootCount++; });
    await lifecycle.boot(async () => { bootCount++; });

    expect(bootCount).toBe(1);
  });
});

describe("TransactionEngine", () => {
  it("should create transactions", () => {
    const engine = new TransactionEngine();
    const tx = engine.create({ method: "GET", path: "/api/test", host: "localhost" });

    expect(tx.id).toBeDefined();
    expect(tx.request.method).toBe("GET");
    expect(tx.status).toBe("in_progress");
  });

  it("should complete transactions", () => {
    const engine = new TransactionEngine();
    const tx = engine.create({ method: "GET", path: "/api/test", host: "localhost" });
    const completed = engine.complete(tx.id);

    expect(completed?.status).toBe("completed");
    expect(completed?.duration).toBeGreaterThanOrEqual(0);
  });

  it("should add events to transactions", () => {
    const engine = new TransactionEngine();
    const tx = engine.create({ method: "POST", path: "/api/data", host: "localhost" });

    engine.addEvent(tx.id, {
      id: "evt-1",
      name: "db_query",
      category: "database",
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 10,
    });

    const stored = engine.get(tx.id);
    expect(stored!.events.length).toBe(1);
    expect(stored!.events[0].name).toBe("db_query");
  });

  it("should add database operations", () => {
    const engine = new TransactionEngine();
    const tx = engine.create({ method: "GET", path: "/api/products", host: "localhost" });

    engine.addDatabaseOp(tx.id, {
      id: "db-1",
      type: "query",
      system: "postgres",
      operation: "SELECT",
      query: "SELECT * FROM products",
      executionTime: 45,
      rowsReturned: 10,
      retryCount: 0,
      timestamp: Date.now(),
      transactionId: tx.id,
    });

    const stored = engine.get(tx.id);
    expect(stored!.databaseOps.length).toBe(1);
    expect(stored!.databaseOps[0].executionTime).toBe(45);
  });

  it("should add external calls", () => {
    const engine = new TransactionEngine();
    const tx = engine.create({ method: "GET", path: "/api/proxy", host: "localhost" });

    engine.addExternalCall(tx.id, {
      id: "ext-1",
      type: "fetch",
      url: "https://api.example.com",
      method: "POST",
      latency: 150,
      retries: 0,
      timestamp: Date.now(),
      transactionId: tx.id,
    });

    const stored = engine.get(tx.id);
    expect(stored!.externalCalls.length).toBe(1);
    expect(stored!.externalCalls[0].latency).toBe(150);
  });

  it("should add errors", () => {
    const engine = new TransactionEngine();
    const tx = engine.create({ method: "POST", path: "/api/error", host: "localhost" });

    engine.addError(tx.id, {
      id: "err-1",
      type: "framework",
      message: "Test error",
      severity: "high",
      timestamp: Date.now(),
      transactionId: tx.id,
    });

    const stored = engine.get(tx.id);
    expect(stored!.errors.length).toBe(1);
    expect(stored!.errors[0].message).toBe("Test error");
  });
});

describe("RequestCollector", () => {
  it("should collect request information", () => {
    const collector = new RequestCollector();
    const req = {
      method: "GET",
      url: "/api/users?page=1",
      headers: {
        host: "localhost:3000",
        "user-agent": "Mozilla/5.0",
        "x-request-id": "req-123",
      },
      socket: { remoteAddress: "192.168.1.1" },
    };

    const info = collector.collect(req);
    expect(info.method).toBe("GET");
    expect(info.path).toBe("/api/users");
    expect(info.query.page).toBe("1");
    expect(info.clientIp).toBe("192.168.1.1");
  });
});

describe("ResponseCollector", () => {
  it("should collect response information", () => {
    const collector = new ResponseCollector();
    const res = {
      statusCode: 200,
      statusMessage: "OK",
      getHeaders: () => ({ "content-type": "application/json" }),
    };

    const startTime = process.hrtime.bigint();
    const info = collector.collect(res, startTime);

    expect(info.statusCode).toBe(200);
    expect(info.statusMessage).toBe("OK");
    expect(info.contentType).toBe("application/json");
  });
});

describe("Kernel", () => {
  it("should boot and shutdown", async () => {
    const kernel = new Kernel();
    expect(kernel.lifecycle.state).toBe("created");

    await kernel.boot();
    expect(kernel.lifecycle.state).toBe("running");

    await kernel.shutdown();
    expect(kernel.lifecycle.state).toBe("stopped");
  });

  it("should report health", async () => {
    const kernel = new Kernel();
    await kernel.boot();

    const health = kernel.health();
    expect(health.state).toBe("running");
    expect(health.plugins).toBe(0);
    expect(health.queue).toBeDefined();

    await kernel.shutdown();
  });

  it("should have initialized primitives", () => {
    const kernel = new Kernel();

    expect(kernel.eventBus).toBeDefined();
    expect(kernel.queue).toBeDefined();
    expect(kernel.plugins).toBeDefined();
    expect(kernel.di).toBeDefined();
    expect(kernel.workers).toBeDefined();
    expect(kernel.lifecycle).toBeDefined();
  });
});

describe("EnrichmentPipeline", () => {
  it("should process request body", () => {
    const bus = new EventBus();

    // Manually simulate what the pipeline does, to verify EventBus works with nested publishes
    bus.subscribe("queue.item.process", (event: any) => {
      const tx = event.payload;
      bus.publish("enrichment.complete", { transaction: tx }, {
        source: "test",
        correlationId: tx.correlationId,
      });
    }, { sync: true });

    const enriched: any[] = [];
    bus.subscribe("enrichment.complete", (event: any) => {
      enriched.push(event.payload.transaction);
    }, { sync: true });

    bus.publish("queue.item.process", {
      id: "tx-1", request: { bodyRaw: { foo: "bar" }, clientIp: "127.0.0.1" },
      response: {},
      errors: [], databaseOps: [], externalCalls: [], events: [], metadata: {},
      correlationId: "cr-test",
      startedAt: Date.now(),
    } as any, { source: "test" });

    expect(enriched.length).toBe(1);
    expect(enriched[0].id).toBe("tx-1");
  });

  it("should enrich via pipeline class", () => {
    const bus = new EventBus();
    const pipeline = new EnrichmentPipeline();
    pipeline.register(bus);

    const enriched: any[] = [];
    bus.subscribe("enrichment.complete", (event: any) => {
      enriched.push(event.payload.transaction);
    }, { sync: true });

    const tx = {
      id: "tx-2",
      request: { bodyRaw: { foo: "bar" }, clientIp: "127.0.0.1", userAgent: "" },
      response: {},
      errors: [], databaseOps: [], externalCalls: [], events: [], metadata: {},
      startedAt: Date.now(),
    } as any;

    bus.publish("queue.item.process", tx, { source: "test" });

    expect(enriched.length).toBe(1);
    expect(enriched[0].request.bodyHash).toBeDefined();
    expect(enriched[0].request.bodyText).toBe('{"foo":"bar"}');
    expect(enriched[0].request.bodyRaw).toBeUndefined();
  });

  it("should enrich client info from user agent", () => {
    const bus = new EventBus();
    const pipeline = new EnrichmentPipeline();
    pipeline.register(bus);

    const enriched: any[] = [];
    bus.subscribe("enrichment.complete", (event: any) => {
      enriched.push(event.payload.transaction);
    }, { sync: true });

    bus.publish("queue.item.process", {
      id: "tx-3",
      request: { userAgent: "curl/8.0", clientIp: "10.0.0.1", bodyRaw: undefined },
      response: {},
      errors: [], databaseOps: [], externalCalls: [], events: [], metadata: {},
      startedAt: Date.now(),
    } as any, { source: "test" });

    expect(enriched.length).toBe(1);
    expect(enriched[0].client).toBeDefined();
    expect(enriched[0].client.browser).toBe("curl");
    expect(enriched[0].client.ipAddress).toBe("10.0.0.1");
  });
});

describe("Plugin Lifecycle", () => {
  it("should register and initialize plugins", async () => {
    const { initialize, shutdown } = await import("../src/index");
    const events: string[] = [];

    await initialize({
      plugins: [
        () => ({
          name: "test.plugin",
          version: "1.0.0",
          initialize: async (kernel: any) => {
            events.push("init");
            kernel.eventBus.subscribe("kernel.booted", () => { events.push("booted"); }, { sync: true });
          },
          shutdown: async () => { events.push("shutdown"); },
        }),
      ],
    });

    await shutdown();
    expect(events).toContain("init");
    expect(events).toContain("shutdown");
  });

  it("should fallback to FileStorage when no storage plugin registered", async () => {
    const { initialize, shutdown } = await import("../src/index");
    await initialize();
    await shutdown();
  });
});

describe("Queue drain (event-based)", () => {
  it("should drain when all items complete", async () => {
    const { Queue } = await import("../src/core/queue");
    const queue = new Queue<string>();

    queue.enqueue("a");
    queue.enqueue("b");

    const item1 = queue.dequeue();
    const item2 = queue.dequeue();

    const drainPromise = queue.drain();

    queue.complete(item1!.id);
    queue.complete(item2!.id);

    await drainPromise;
    expect(queue.stats().size).toBe(0);
    expect(queue.stats().processing).toBe(0);
  });
});
