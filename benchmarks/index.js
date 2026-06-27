const { performance } = require("perf_hooks");
const { initialize, shutdown, getKernel, TransactionEngine } = require("../dist/index.js");

console.log("AGStack Runtime Kernel - Benchmarks");
console.log("=".repeat(60));

async function benchTransactionCreation() {
  const engine = new TransactionEngine();
  const iterations = 100000;

  const req = {
    timestamp: Date.now(),
    method: "GET",
    protocol: "HTTP/1.1",
    httpVersion: "1.1",
    host: "localhost:3000",
    url: "/api/users?page=1",
    path: "/api/users",
    query: { page: "1" },
    params: {},
    headers: { host: "localhost:3000", "user-agent": "test-agent" },
    contentType: "",
    contentLength: 0,
    requestId: "req-1",
    correlationId: "cr-1",
    traceId: "tr-1",
    clientIp: "127.0.0.1",
    userAgent: "test-agent",
  };

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    req.requestId = `req-${i}`;
    engine.create(req);
  }
  const end = performance.now();
  const total = end - start;
  const avg = total / iterations;

  console.log(`\nTransaction Creation (${iterations} iterations):`);
  console.log(`  Total: ${total.toFixed(2)}ms`);
  console.log(`  Avg: ${(avg * 1000).toFixed(2)}µs`);
  console.log(`  Ops/sec: ${Math.floor(iterations / (total / 1000))}`);
}

async function benchQueueEnqueueDequeue() {
  const { Queue } = require("../dist/index.js");
  const queue = new Queue();
  const iterations = 100000;

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    queue.enqueue({ id: i });
  }
  for (let i = 0; i < iterations; i++) {
    queue.dequeue();
  }
  const end = performance.now();
  const total = end - start;
  const avg = total / iterations;

  console.log(`\nQueue Enqueue+Dequeue (${iterations} items):`);
  console.log(`  Total: ${total.toFixed(2)}ms`);
  console.log(`  Avg: ${(avg * 1000).toFixed(2)}µs`);
  console.log(`  Ops/sec: ${Math.floor(iterations / (total / 1000))}`);
}

async function benchEventBus() {
  const { EventBus } = require("../dist/index.js");
  const bus = new EventBus();
  const iterations = 50000;

  bus.subscribe("test.event", () => {}, { sync: true });

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    bus.publish("test.event", {}, { source: "bench" });
  }
  const end = performance.now();
  const total = end - start;
  const avg = total / iterations;

  console.log(`\nEventBus Publish (${iterations} events, sync):`);
  console.log(`  Total: ${total.toFixed(2)}ms`);
  console.log(`  Avg: ${(avg * 1000).toFixed(2)}µs`);
  console.log(`  Ops/sec: ${Math.floor(iterations / (total / 1000))}`);
}

async function main() {
  await benchTransactionCreation();
  await benchQueueEnqueueDequeue();
  await benchEventBus();
  console.log("\nDone.");
}

main().catch(console.error);
