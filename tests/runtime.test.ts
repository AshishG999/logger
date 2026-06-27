import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { initialize, shutdown, getKernel, isInitialized, version } from "../src/index";
import { EventBus } from "../src/core/event-bus";
import { Queue } from "../src/core/queue";
import { WorkerPool } from "../src/core/worker-pool";
import { LifecycleManager } from "../src/core/lifecycle";
import { PluginManager } from "../src/core/plugin-manager";
import { HookEngine } from "../src/core/hook-engine";
import { HealthMonitor } from "../src/core/health-monitor";
import { MetricsCollector } from "../src/core/metrics";
import { TransactionEngine, Transaction } from "../src/transaction/engine";
import { RequestCollector } from "../src/collectors/request";
import { ResponseCollector } from "../src/collectors/response";
import { ConfigurationManager } from "../src/core/configuration";
import type { IPlugin, PluginMetadata } from "@agstack/plugin-sdk";

describe("Public API", () => {
  it("should export version", () => {
    expect(version).toBeDefined();
    expect(typeof version).toBe("string");
  });

  it("should initialize and shutdown", async () => {
    await initialize();
    expect(isInitialized()).toBe(true);
    await shutdown();
    expect(isInitialized()).toBe(false);
  });

  it("should handle double initialize gracefully", async () => {
    await initialize();
    await initialize();
    await shutdown();
  });

  it("should return kernel after init", async () => {
    await initialize();
    const kernel = getKernel();
    expect(kernel.eventBus).toBeDefined();
    expect(kernel.queue).toBeDefined();
    expect(kernel.workers).toBeDefined();
    expect(kernel.lifecycle).toBeDefined();
    expect(kernel.pluginManager).toBeDefined();
    expect(kernel.hookEngine).toBeDefined();
    expect(kernel.metrics).toBeDefined();
    expect(kernel.transactionEngine).toBeDefined();
    expect(kernel.httpInterceptor).toBeDefined();
    expect(kernel.healthMonitor).toBeDefined();
    await shutdown();
  });

  it("should throw when getting kernel before init", () => {
    expect(() => getKernel()).toThrow("Kernel not initialized");
  });
});

describe("EventBus", () => {
  it("should publish and subscribe to events", async () => {
    const bus = new EventBus();
    const received: string[] = [];

    bus.subscribe("runtime.started", (event) => {
      received.push("started");
    });

    bus.publish("runtime.started", {
      version: "2.0.0",
      startedAt: Date.now(),
      nodeVersion: process.version,
      platform: process.platform,
    }, { source: "test" });

    await new Promise((r) => setImmediate(r));
    expect(received).toContain("started");
  });

  it("should support sync handlers", async () => {
    const bus = new EventBus();
    const order: string[] = [];

    bus.subscribe("transaction.created", (event: any) => {
      order.push(event.payload.transactionId);
    }, { sync: true });

    bus.publish("transaction.created", {
      transactionId: "tx-1", correlationId: "cr-1", traceId: "tr-1",
      method: "GET", path: "/test",
    }, { source: "test" });

    expect(order[0]).toBe("tx-1");
  });

  it("should support handler filtering", async () => {
    const bus = new EventBus();
    const received: string[] = [];

    bus.subscribe("runtime.error", (event) => {
      received.push(event.payload.message);
    }, { filter: (e: any) => e.payload.message === "allowed" });

    bus.publish("runtime.error", { message: "allowed" }, { source: "test" });
    bus.publish("runtime.error", { message: "blocked" }, { source: "test" });

    await new Promise((r) => setImmediate(r));
    expect(received).toEqual(["allowed"]);
  });

  it("should move failed handlers to dead letter", async () => {
    const bus = new EventBus();

    bus.subscribe("runtime.started", () => {
      throw new Error("handler failed");
    }, { retries: 1 });

    bus.publish("runtime.started", {
      version: "2.0.0", startedAt: Date.now(),
      nodeVersion: process.version, platform: process.platform,
    }, { source: "test" });

    await new Promise((r) => setImmediate(r));
    expect(bus.getDeadLetterEvents().length).toBe(1);
  });

  it("should unsubscribe handlers", async () => {
    const bus = new EventBus();
    let count = 0;

    const handler = () => { count++; };

    bus.subscribe("transaction.created", handler, { sync: true });
    bus.publish("transaction.created", {
      transactionId: "tx-1", correlationId: "cr-1", traceId: "tr-1",
      method: "GET", path: "/test",
    }, { source: "test" });
    bus.unsubscribe("transaction.created", handler);
    bus.publish("transaction.created", {
      transactionId: "tx-2", correlationId: "cr-2", traceId: "tr-2",
      method: "GET", path: "/test",
    }, { source: "test" });

    expect(count).toBe(1);
  });

  it("should clear all subscribers", () => {
    const bus = new EventBus();
    bus.subscribe("runtime.started", () => {}, { sync: true });
    bus.subscribe("runtime.shutdown", () => {}, { sync: true });
    expect(bus.subscriberCount()).toBe(2);
    bus.clear();
    expect(bus.subscriberCount()).toBe(0);
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

    const retried = queue.fail(item!.id);
    expect(retried).toBe(false);
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

  it("should flush all items", () => {
    const queue = new Queue<string>();
    queue.enqueue("a");
    queue.enqueue("b");
    queue.enqueue("c");

    const items = queue.flush();
    expect(items.length).toBe(3);
    expect(queue.stats().size).toBe(0);
  });

  it("should manage dead letter items", () => {
    const queue = new Queue<string>();
    queue.enqueue("test", { maxRetries: 0 });
    const item = queue.dequeue();
    queue.fail(item!.id);

    expect(queue.getDeadLetter().length).toBe(1);
    queue.clearDeadLetter();
    expect(queue.getDeadLetter().length).toBe(0);
  });
});

describe("WorkerPool", () => {
  it("should start, process items and stop", async () => {
    const queue = new Queue<string>();
    const processed: string[] = [];

    const pool = new WorkerPool({ concurrency: 2, pollIntervalMs: 50 });
    pool.start(queue, async (item) => {
      processed.push(item.data);
    });

    queue.enqueue("a");
    queue.enqueue("b");

    await new Promise((r) => setTimeout(r, 200));

    await pool.stop();
    expect(processed.length).toBe(2);
  });

  it("should report stats", () => {
    const pool = new WorkerPool({ concurrency: 3 });
    const stats = pool.getStats();
    expect(stats.length).toBe(0);
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

  it("should set error state on boot failure", async () => {
    const lifecycle = new LifecycleManager();
    await expect(lifecycle.boot(async () => {
      throw new Error("boot failed");
    })).rejects.toThrow("boot failed");
    expect(lifecycle.state).toBe("error");
  });
});

describe("TransactionEngine", () => {
  it("should create transactions", () => {
    const engine = new TransactionEngine();
    const tx = engine.create({
      timestamp: Date.now(),
      method: "GET",
      protocol: "HTTP/1.1",
      httpVersion: "1.1",
      host: "localhost",
      url: "/api/test",
      path: "/api/test",
      query: {},
      params: {},
      headers: {},
      contentType: "",
      contentLength: 0,
      requestId: "req-1",
      correlationId: "cr-1",
      traceId: "tr-1",
      clientIp: "127.0.0.1",
      userAgent: "",
    });

    expect(tx.id).toBeDefined();
    expect(tx.request.method).toBe("GET");
    expect(tx.status).toBe("in_progress");
  });

  it("should complete transactions", () => {
    const engine = new TransactionEngine();
    const tx = engine.create({
      timestamp: Date.now(),
      method: "GET", protocol: "HTTP/1.1", httpVersion: "1.1",
      host: "localhost", url: "/api/test", path: "/api/test",
      query: {}, params: {}, headers: {},
      contentType: "", contentLength: 0,
      requestId: "req-1", correlationId: "cr-1", traceId: "tr-1",
      clientIp: "127.0.0.1", userAgent: "",
    });
    const completed = engine.complete(tx.id, {
      statusCode: 200,
      statusMessage: "OK",
      headers: { "content-type": "application/json" },
      contentType: "application/json",
      responseSize: 100,
      executionTime: 10,
    });

    expect(completed?.status).toBe("completed");
    expect(completed?.duration).toBeGreaterThanOrEqual(0);
  });

  it("should mark error transactions", () => {
    const engine = new TransactionEngine();
    const tx = engine.create({
      timestamp: Date.now(),
      method: "GET", protocol: "HTTP/1.1", httpVersion: "1.1",
      host: "localhost", url: "/api/test", path: "/api/test",
      query: {}, params: {}, headers: {},
      contentType: "", contentLength: 0,
      requestId: "req-1", correlationId: "cr-1", traceId: "tr-1",
      clientIp: "127.0.0.1", userAgent: "",
    });
    const failed = engine.fail(tx.id, {
      id: "err-1",
      type: "framework",
      message: "Test error",
      severity: "high",
      timestamp: Date.now(),
    });

    expect(failed?.status).toBe("error");
    expect(failed?.errors.length).toBe(1);
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
    expect(info.clientIp).toBe("192.168.1.1");
    expect(info.userAgent).toBe("Mozilla/5.0");
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

describe("HookEngine", () => {
  it("should register and execute hooks", async () => {
    const engine = new HookEngine();
    const results: string[] = [];

    engine.register("plugin-a", "beforeTransaction", async (payload) => {
      results.push("before");
    });

    engine.register("plugin-b", "afterTransaction", async (payload) => {
      results.push("after");
    });

    await engine.execute("beforeTransaction", {
      transactionId: "tx-1",
      method: "GET",
      path: "/test",
      headers: {},
    });

    expect(results).toContain("before");
  });

  it("should handle hook errors gracefully", async () => {
    const engine = new HookEngine();

    engine.register("failing", "beforeTransaction", async () => {
      throw new Error("hook failed");
    });

    const results = await engine.execute("beforeTransaction", {
      transactionId: "tx-1",
      method: "GET",
      path: "/test",
      headers: {},
    });

    expect(results.length).toBe(1);
    expect(results[0].error).toBeDefined();
    expect(results[0].error!.message).toBe("hook failed");
  });

  it("should clear hooks for a plugin", () => {
    const engine = new HookEngine();

    engine.register("plugin-a", "beforeTransaction", async () => {});
    engine.register("plugin-a", "afterTransaction", async () => {});
    engine.register("plugin-b", "beforeTransaction", async () => {});

    engine.clearPluginHooks("plugin-a");

    const hooks = engine.getRegisteredHooks();
    expect(hooks.get("beforeTransaction")).toEqual(["plugin-b"]);
    expect(hooks.get("afterTransaction")).toBeUndefined();
  });

  it("should clear all hooks", () => {
    const engine = new HookEngine();
    engine.register("a", "beforeTransaction", async () => {});
    engine.register("b", "afterTransaction", async () => {});
    engine.clear();
    expect(engine.getRegisteredHooks().size).toBe(0);
  });

  it("should execute hooks in priority order", async () => {
    const engine = new HookEngine();
    const order: number[] = [];

    engine.register("low", "beforeTransaction", async () => {
      order.push(2);
    }, 100);

    engine.register("high", "beforeTransaction", async () => {
      order.push(1);
    }, 0);

    await engine.execute("beforeTransaction", {
      transactionId: "tx-1",
      method: "GET",
      path: "/test",
      headers: {},
    });

    expect(order).toEqual([1, 2]);
  });
});

describe("MetricsCollector", () => {
  it("should record and read counters", () => {
    const metrics = new MetricsCollector();
    metrics.incrementCounter("test.count");
    metrics.incrementCounter("test.count");
    expect(metrics.getCounter("test.count")).toBe(2);
  });

  it("should record and read gauges", () => {
    const metrics = new MetricsCollector();
    metrics.recordGauge("memory.usage", 1024);
    expect(metrics.getGauge("memory.usage")).toBe(1024);
  });

  it("should record and read histograms", () => {
    const metrics = new MetricsCollector();
    metrics.recordHistogram("response.time", 100);
    metrics.recordHistogram("response.time", 200);
    metrics.recordHistogram("response.time", 300);

    const stats = metrics.getHistogramStats("response.time");
    expect(stats?.count).toBe(3);
    expect(stats?.avg).toBe(200);
    expect(stats?.min).toBe(100);
    expect(stats?.max).toBe(300);
  });

  it("should return snapshot", () => {
    const metrics = new MetricsCollector();
    metrics.recordGauge("cpu", 50);
    metrics.incrementCounter("requests");
    const snapshot = metrics.getSnapshot();
    expect(snapshot["gauge.cpu"]).toBe(50);
    expect(snapshot["counter.requests"]).toBe(1);
  });

  it("should reset all metrics", () => {
    const metrics = new MetricsCollector();
    metrics.incrementCounter("test");
    metrics.reset();
    expect(metrics.getCounter("test")).toBe(0);
  });
});

describe("ConfigurationManager", () => {
  beforeEach(() => ConfigurationManager.reset());

  it("should initialize with defaults", () => {
    const cm = ConfigurationManager.initialize({});
    expect(cm.get("runtime")).toBeDefined();
    expect(cm.get("payload")).toBeDefined();
  });

  it("should update configuration", () => {
    const cm = ConfigurationManager.getInstance();
    cm.update({ runtime: { debug: true, queueMaxSize: 5000 } });
    const config = cm.getAll();
    expect(config.runtime?.debug).toBe(true);
  });

  it("should apply env overrides (AGSTACK_DEBUG)", () => {
    process.env.AGSTACK_DEBUG = "true";
    ConfigurationManager.reset();
    const cm = ConfigurationManager.initialize({});
    const rt = cm.get("runtime");
    expect(rt?.debug).toBe(true);
    delete process.env.AGSTACK_DEBUG;
  });
});

describe("HealthMonitor", () => {
  it("should report healthy status", () => {
    const bus = new EventBus();
    const lifecycle = new LifecycleManager();
    const monitor = new HealthMonitor(bus, lifecycle, { intervalMs: 5000 });

    expect(monitor.status).toBe("starting");
    monitor.start();
    expect(monitor.status).toBe("healthy");
    monitor.stop();
  });

  it("should check health", async () => {
    const bus = new EventBus();
    const lifecycle = new LifecycleManager();
    const monitor = new HealthMonitor(bus, lifecycle, { intervalMs: 5000 });

    const result = await monitor.check();
    expect(result.status).toBeDefined();
    expect(result.pluginName).toBe("@agstack/logger");
  });
});

describe("Plugin Lifecycle", () => {
  it("should register plugins with kernel", async () => {
    await initialize();
    const kernel = getKernel();

    let initialized = false;
    const testPlugin: IPlugin = {
      metadata: {
        name: "@agstack/test-plugin",
        version: "1.0.0",
        description: "Test plugin",
        type: "custom",
        capabilities: ["test"],
        supportedRuntimeVersions: {
          pluginSdk: {},
          runtime: {},
        },
        priority: 50,
      },
      state: "created",
      initialize: async () => { initialized = true; },
      validate: async () => true,
      health: async () => ({
        status: "healthy",
        pluginName: "test",
        pluginVersion: "1.0.0",
        timestamp: Date.now(),
        durationMs: 0,
      }),
      start: async () => {},
      pause: async () => {},
      resume: async () => {},
      shutdown: async () => {},
      dispose: async () => {},
    };

    kernel.registerPlugin(testPlugin);
    expect(kernel.pluginManager.getPlugin("@agstack/test-plugin")).toBeDefined();

    await shutdown();
  });

  it("should fail registration for invalid plugin metadata", async () => {
    await initialize();
    const kernel = getKernel();

    const invalidPlugin: IPlugin = {
      metadata: {
        name: "",
        version: "",
        description: "",
        type: "custom",
        capabilities: [],
        supportedRuntimeVersions: { pluginSdk: {}, runtime: {} },
        priority: 50,
      },
      state: "created",
      initialize: async () => {},
      validate: async () => false,
      health: async () => ({
        status: "healthy",
        pluginName: "",
        pluginVersion: "",
        timestamp: Date.now(),
        durationMs: 0,
      }),
      start: async () => {},
      pause: async () => {},
      resume: async () => {},
      shutdown: async () => {},
      dispose: async () => {},
    };

    expect(() => kernel.registerPlugin(invalidPlugin)).toThrow();
    await shutdown();
  });
});

describe("Kernel Integration", () => {
  it("should boot and report stats", async () => {
    await initialize();
    const kernel = getKernel();
    const stats = kernel.getStats();

    expect(stats.state).toBe("running");
    expect(stats.queue).toBeDefined();
    expect(stats.plugins).toBeDefined();
    expect(stats.workers).toBeDefined();
    expect(stats.eventBusSubscribers).toBeGreaterThanOrEqual(0);

    await shutdown();
  });

  it("should report system health", async () => {
    await initialize();
    const kernel = getKernel();
    const health = kernel.getSystemHealth();

    expect(health.status).toBe("healthy");
    expect(health.uptimeMs).toBeGreaterThan(0);
    expect(health.memory).toBeDefined();
    expect(health.pluginCount).toBe(0);

    await shutdown();
  });
});

describe("HTTP Interception", () => {
  it("should intercept http.createServer", async () => {
    await initialize();
    const http = await import("node:http");

    const server = http.createServer((_req, res) => {
      res.end("ok");
    });

    expect(server).toBeDefined();
    server.close();

    await shutdown();
  });

  it("should not break normal server operation", async () => {
    await initialize();
    const http = await import("node:http");

    const server = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        expect(addr).toBeDefined();
        server.close();
        resolve();
      });
    });

    await shutdown();
  });
});

describe("Error Handling", () => {
  it("should handle lifecycle errors", async () => {
    const lifecycle = new LifecycleManager();
    await expect(
      lifecycle.boot(async () => { throw new Error("fail"); })
    ).rejects.toThrow("fail");
  });
});

describe("Concurrency", () => {
  it("should process multiple queue items concurrently", async () => {
    const queue = new Queue<number>();
    const results: number[] = [];
    const pool = new WorkerPool({ concurrency: 4, pollIntervalMs: 10 });

    pool.start(queue, async (item) => {
      results.push(item.data);
    });

    for (let i = 0; i < 20; i++) {
      queue.enqueue(i);
    }

    await new Promise((r) => setTimeout(r, 500));
    await pool.stop();

    expect(results.length).toBe(20);
    expect(results.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});
