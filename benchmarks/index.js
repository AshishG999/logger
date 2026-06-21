const { performance } = require("perf_hooks");

console.log("AGStack Logger - Benchmarks");
console.log("=".repeat(50));

async function benchTransactionCreation() {
  const { initialize, getEngine } = require("../dist/index.js");
  await initialize({ storage: { type: "file" } });
  const engine = getEngine();

  const iterations = 10000;
  const req = {
    method: "GET",
    url: "/api/users?page=1",
    headers: { host: "localhost:3000", "user-agent": "test-agent" },
    socket: { remoteAddress: "127.0.0.1" },
  };

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    engine.createTransaction(req);
  }
  const end = performance.now();
  const total = end - start;
  const avg = total / iterations;

  console.log(`\nTransaction Creation (${iterations} iterations):`);
  console.log(`  Total: ${total.toFixed(2)}ms`);
  console.log(`  Avg: ${(avg * 1000).toFixed(2)}µs`);
  console.log(`  Ops/sec: ${Math.floor(1000 / (avg / 1000))}`);

  await engine.shutdown();
}

async function benchFullPipeline() {
  const { initialize, getEngine } = require("../dist/index.js");
  await initialize({ storage: { type: "file" } });
  const engine = getEngine();

  const iterations = 1000;
  const req = {
    method: "POST",
    url: "/api/data",
    headers: { host: "localhost:3000", "content-type": "application/json" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = {
    statusCode: 200,
    statusMessage: "OK",
    getHeaders: () => ({ "content-type": "application/json" }),
    end: () => {},
  };

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const t = engine.createTransaction(req);
    engine.finalizeTransaction(t, res, process.hrtime.bigint());
  }
  const end = performance.now();
  const total = end - start;
  const avg = total / iterations;

  console.log(`\nFull Pipeline (${iterations} iterations):`);
  console.log(`  Total: ${total.toFixed(2)}ms`);
  console.log(`  Avg: ${(avg * 1000).toFixed(2)}µs`);

  await engine.shutdown();
}

async function main() {
  await benchTransactionCreation();
  await benchFullPipeline();
  console.log("\nDone.");
}

main().catch(console.error);
