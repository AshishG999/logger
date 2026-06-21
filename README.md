# @agstack/logger

**Autonomous Runtime Observability SDK for Node.js**

Event-driven, plugin-based, zero-dependency runtime kernel with automatic HTTP transaction tracking.

```ts
import { initialize, shutdown } from "@agstack/logger";

await initialize();
// Your application runs here — every HTTP request is tracked automatically
await shutdown();
```

---

## Why AGStack Logger?

Most observability SDKs add 5–15 ms of latency per request because they process payloads, parse user agents, and run security checks **during the HTTP request**. AGStack Logger defers all expensive processing to a **background enrichment pipeline**, keeping request-path overhead under 1 ms.

**Three architectural principles**:

1. **Stage 1 is free** — capture IDs, timestamps, headers (raw refs only). No body hashing, no UA parsing, no GeoIP, no security analysis during the request.
2. **Plugin-first kernel** — the runtime kernel has zero dependencies. Storage, AI, notifications are all optional plugins loaded only when registered.
3. **Zero overhead for unused features** — if you don't register a plugin, it never initializes, allocates memory, starts timers, or registers listeners.

---

## Features

| Capability | Status |
|---|---|
| Automatic HTTP request/response tracking | ✅ Built-in |
| Zero middleware changes (auto-patches `http.createServer`) | ✅ Built-in |
| Priority queue with backpressure | ✅ Built-in |
| Worker pool with configurable concurrency | ✅ Built-in |
| Event bus with priorities, sync delivery, dead letter | ✅ Built-in |
| Body capture (deferred to enrichment pipeline) | ✅ Built-in |
| User-agent parsing (deferred to enrichment pipeline) | ✅ Built-in |
| Header/JSON field security masking | ✅ Built-in |
| Plugin system via `RuntimePlugin` interface | ✅ Built-in |
| File storage (default, configurable) | ✅ Built-in |
| TypeScript first | ✅ Types included |
| ESM + CommonJS | ✅ Dual publish |
| Zero runtime dependencies | ✅ 0 deps, 42 KB packed |
| PostgreSQL storage | 📦 Planned — `@agstack/storage-postgres` |
| MongoDB storage | 📦 Planned — `@agstack/storage-mongodb` |
| Elasticsearch storage | 📦 Planned — `@agstack/storage-elasticsearch` |
| Redis storage | 📦 Planned — `@agstack/storage-redis` |
| OpenAI integration | 📦 Planned — `@agstack/ai-openai` |
| Gemini integration | 📦 Planned — `@agstack/ai-gemini` |
| Slack notifications | 📦 Planned — `@agstack/notification-slack` |
| Discord notifications | 📦 Planned — `@agstack/notification-discord` |
| Email notifications | 📦 Planned — `@agstack/notification-email` |
| OpenTelemetry bridge | 📦 Planned — `@agstack/opentelemetry` |
| Prometheus metrics | 📦 Planned — `@agstack/prometheus` |

---

## Installation

```sh
npm install @agstack/logger
```

```sh
pnpm add @agstack/logger
```

```sh
yarn add @agstack/logger
```

```sh
bun add @agstack/logger
```

**Node.js**: >= 18.0.0 (uses `crypto.randomUUID`, `process.hrtime.bigint`, global `fetch`).

---

## Quick Start

### Express

```ts
import express from "express";
import { initialize, shutdown } from "@agstack/logger";

const app = express();

await initialize();

app.get("/api/users", (req, res) => {
  res.json({ users: [] });
});

const server = app.listen(3000);

process.on("SIGTERM", async () => {
  server.close();
  await shutdown();
});
```

### Raw Node HTTP

```ts
import http from "node:http";
import { initialize, shutdown } from "@agstack/logger";

await initialize();

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok" }));
});

server.listen(3000);

process.on("SIGTERM", async () => {
  server.close();
  await shutdown();
});
```

### Fastify

```ts
import Fastify from "fastify";
import { initialize, shutdown } from "@agstack/logger";

const app = Fastify();

await initialize();

app.get("/api/users", async () => ({ users: [] }));

await app.listen({ port: 3000 });

process.on("SIGTERM", async () => {
  await app.close();
  await shutdown();
});
```

### Next.js API Route

```ts
// lib/agstack.ts
import { initialize, shutdown } from "@agstack/logger";

let initialized = false;

export async function ensureLogger() {
  if (!initialized) {
    await initialize();
    initialized = true;
  }
  return shutdown;
}
```

```ts
// pages/api/users.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { ensureLogger } from "../../lib/agstack";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const shutdown = await ensureLogger();
  res.status(200).json({ users: [] });
  // Note: Call shutdown() during app lifecycle, not per-request
}
```

> **Important**: `initialize()` patches `http.createServer` globally. In Next.js, ensure it's called once during app startup (e.g., in a module init or custom server).

---

## Architecture

```
HTTP Request
     │
     ▼
┌─────────────────────────────────────────────────┐
│ Stage 1 — Raw Transaction Collection            │
│ • Capture: IDs, timestamps, method, URL,        │
│   headers (raw references)                      │
│ • Cost: ~0.05 ms — no processing                │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼  (immediate response)
┌─────────────────────────────────────────────────┐
│ Internal Queue (priority-sorted)                │
│ • Backpressure at capacity                      │
│ • Retry with exponential backoff                │
│ • Dead letter after max retries                 │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│ Worker Pool (configurable concurrency)           │
│ • Polls queue, processes items asynchronously   │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│ Stage 2 — Enrichment Pipeline                   │
│ • Body capture: hash, truncate, classify        │
│ • User-agent parsing (browser, OS, device)      │
│ • Geo detection (Cloudflare / proxy headers)    │
│ • Security masking (19 JSON field patterns)     │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│ Plugins (storage, AI, notifications, ...)       │
│ • FileStorage (built-in default)                │
│ • Custom plugins via RuntimePlugin interface    │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
              Persisted Transaction
```

**Why this minimizes latency:**

The HTTP response is sent **before the transaction enters the queue**. The entire enrichment and persistence pipeline runs in background workers, never blocking the application. Even with body capture, SHA-256 hashing, and UA parsing, the request path sees only:

1. `Date.now()` — 1 syscall
2. Header normalization — O(n) on header count (~0.01 ms)
3. URL parsing — O(1) string operation
4. Emit two events — synchronous bus dispatch

---

## Folder Structure

```
@agstack/logger/
├── src/
│   ├── index.ts              # Public API: initialize(), shutdown(), version
│   ├── init.ts               # Re-export for manual init (no side effects)
│   │
│   ├── core/
│   │   ├── kernel.ts         # Lifecycle coordinator, facade for plugins
│   │   ├── event-bus.ts      # Priority pub/sub with sync delivery, dead letter
│   │   ├── queue.ts          # Priority-sorted queue with retry, backpressure
│   │   ├── worker-pool.ts    # Configurable concurrent queue consumers
│   │   ├── lifecycle.ts      # State machine: created→booting→running→stopping→stopped
│   │   ├── di-container.ts   # Lightweight IoC (singleton/transient)
│   │   └── plugin-registry.ts# Legacy auto-discovery (coexists with RuntimePlugin)
│   │
│   ├── engine/
│   │   └── runtime-engine.ts # HTTP monkey-patch (createServer interception)
│   │
│   ├── transaction/
│   │   ├── service.ts        # Request→response correlation, event wiring
│   │   └── engine.ts         # Transaction CRUD, event/DbOp/Error aggregation
│   │
│   ├── collectors/
│   │   ├── request.ts        # Stage 1: raw request data (no processing)
│   │   └── response.ts       # Stage 1: raw response data
│   │
│   ├── enrichment/
│   │   └── pipeline.ts       # Stage 2: body, UA, geo enrichment
│   │
│   ├── storage/
│   │   └── file-storage.ts   # Built-in RuntimePlugin (JSONL files)
│   │
│   ├── config/
│   │   ├── manager.ts        # RuntimeConfig singleton
│   │   └── defaults.ts       # Default configuration
│   │
│   ├── utils/
│   │   ├── body-capture.ts   # SHA-256 hashing, truncation, preview
│   │   ├── ua-parser.ts      # Browser/OS/device detection (regex)
│   │   ├── time.ts           # hrtime helpers
│   │   └── id.ts             # UUID generators with prefixes
│   │
│   └── types/
│       └── index.ts          # All public interfaces and types
│
├── tests/
│   └── runtime.test.ts       # 37 unit tests
│
├── dist/                     # Build output (CJS + ESM + DTS)
├── package.json
└── tsconfig.json
```

---

## Configuration

### `RuntimeConfig`

```ts
interface RuntimeConfig {
  /** Plugin factories. Each factory returns a RuntimePlugin instance. */
  plugins?: Array<() => RuntimePlugin | Promise<RuntimePlugin>>;

  /** Enable debug logging (console.log) */
  debug?: boolean;
}
```

### Defaults

```ts
const DEFAULTS: RuntimeConfig = {
  debug: false,
  plugins: [],
};
```

When no storage plugin is registered (one whose `name` starts with `"storage"`), the built-in `FileStorage` is automatically activated as a fallback.

### Example

```ts
import { initialize } from "@agstack/logger";

await initialize({
  debug: true,
  plugins: [
    () => ({
      name: "my-custom-storage",
      version: "1.0.0",
      initialize: async (kernel) => {
        kernel.eventBus.subscribe("enrichment.complete", async (event) => {
          // send transaction to your storage
        });
      },
      shutdown: async () => {
        // cleanup
      },
    }),
  ],
});
```

---

## Plugin System

### Interface

```ts
interface RuntimePlugin {
  /** Unique plugin name (e.g. "storage.file", "ai.openai") */
  name: string;

  /** Semantic version */
  version: string;

  /** Called during initialize(), receives restricted kernel access */
  initialize(kernel: KernelFacade): Promise<void>;

  /** Called during shutdown() — flush buffers, close connections */
  shutdown(): Promise<void>;

  /** Optional health check */
  health?(): Promise<{ healthy: boolean; message?: string }>;
}
```

### `KernelFacade`

Plugins receive a restricted view of the kernel:

```ts
interface KernelFacade {
  readonly eventBus: EventBus;   // Subscribe to events, publish events
  readonly di: DIContainer;      // Register/resolve dependencies
  readonly lifecycle: LifecycleManager; // Register shutdown handlers
}
```

Plugins **cannot** access the queue, worker pool, or plugin registry directly. This ensures isolation and prevents plugins from interfering with kernel internals.

### Lifecycle

1. User calls `initialize({ plugins: [...] })`
2. Each plugin factory is called
3. `plugin.initialize(kernel.facade())` — plugin subscribes to events, starts timers
4. Kernel boots — workers start, `kernel.booted` event fires
5. Application runs
6. User calls `shutdown()`
7. Workers stop → queue drains → lifecycle shutdown handlers run
8. `plugin.shutdown()` for each plugin (reverse order)
9. Kernel stops

### Writing a Plugin

```ts
// my-storage-plugin.ts
import type { RuntimePlugin, KernelFacade, Transaction } from "@agstack/logger";

export function createMyStoragePlugin(): RuntimePlugin {
  return {
    name: "storage.my-custom",
    version: "1.0.0",

    async initialize(kernel: KernelFacade): Promise<void> {
      kernel.eventBus.subscribe(
        "enrichment.complete",
        async (event) => {
          const { transaction } = event.payload as { transaction: Transaction };
          await this.save(transaction);
        },
        { sync: true }
      );
    },

    async shutdown(): Promise<void> {
      await this.flush();
    },

    async health(): Promise<{ healthy: boolean; message?: string }> {
      return { healthy: true };
    },

    // Private methods
    async save(tx: Transaction): Promise<void> {
      // Implement your storage logic
    },

    async flush(): Promise<void> {
      // Flush any buffers
    },
  };
}
```

### Loading

```ts
import { initialize } from "@agstack/logger";
import { createMyStoragePlugin } from "./my-storage-plugin";

await initialize({
  plugins: [createMyStoragePlugin],
});
```

---

## Events

All events are dispatched through the `EventBus`. Handlers can subscribe with `sync: true` for synchronous delivery, or rely on `queueMicrotask` (priority 1) / `setImmediate` (priority 2).

### Event Reference

| Event | Payload | Emitter | When |
|---|---|---|---|
| `http.request` | `{ req, res }` | RuntimeEngine | HTTP request received |
| `http.response` | `{ req, res }` | RuntimeEngine | HTTP response sent |
| `transaction.created` | `{ transaction, req, res }` | TransactionService | Transaction initialized |
| `transaction.completed` | `{ transaction }` | TransactionService | Request+response correlated |
| `queue.item.process` | `Transaction` | Kernel (worker) | Worker dequeues item for processing |
| `enrichment.complete` | `{ transaction }` | EnrichmentPipeline | Stage 2 enrichment finished |
| `queue.backpressure` | `{ transaction }` | Kernel | Queue full, transaction dropped |
| `error.uncaught` | `{ message, stack, type }` | RuntimeEngine | `process.on("uncaughtException")` |
| `error.unhandled` | `{ message, stack, type }` | RuntimeEngine | `process.on("unhandledRejection")` |
| `error.queued` | `{ message, stack, type }` | Kernel | Error forwarded to queue |
| `runtime.initialized` | `{}` | RuntimeEngine | HTTP patching complete |
| `runtime.shutdown` | `{}` | RuntimeEngine | Engine stopping |
| `kernel.booted` | `{}` | Kernel | All subsystems started |
| `kernel.shuttingdown` | `{}` | Kernel | Shutdown initiated |
| `kernel.stopped` | `{}` | Kernel | Shutdown complete |

### Subscribing to Events

```ts
kernel.eventBus.subscribe("transaction.completed", async (event) => {
  const { transaction } = event.payload;

  // Access transaction data
  console.log(transaction.request.method, transaction.request.path);
  console.log("Status:", transaction.response?.statusCode);
  console.log("Duration:", transaction.duration, "ms");

  // Enriched data (populated by enrichment pipeline)
  console.log("Browser:", transaction.client?.browser);
  console.log("Country:", transaction.geo?.country);
  console.log("Body hash:", transaction.request.bodyHash);
}, { sync: true }); // `sync: true` ensures delivery during publish()
```

---

## Storage

### Built-in: FileStorage

The built-in `FileStorage` is activated automatically when no storage plugin is registered. It writes JSONL files to `./agstack-logs/`.

**Configuration** is done via the constructor when used as a direct dependency:

```ts
import { FileStorage } from "@agstack/logger/init";

// Direct usage (not through plugin system)
const storage = new FileStorage("./custom-logs", {
  maxBufferSize: 200,       // Flush after 200 items (default: 100)
  flushIntervalMs: 10000,   // Flush every 10s (default: 5000)
});
```

**Output format** (JSONL — one JSON object per line):

```jsonl
{"id":"...","method":"GET","url":"/api/users","path":"/api/users","statusCode":200,"duration":42,"headers":{"content-type":"application/json"},"bodyHash":"abc123...","clientIp":"192.168.1.1","browser":"Chrome","browserVersion":"120.0","os":"Windows","country":"US","errors":0}
```

**Files are rotated daily**: `transactions-2026-06-21.jsonl`.

### Custom Storage Plugins

> Full-featured database plugins (`@agstack/storage-postgres`, `@agstack/storage-mongodb`, `@agstack/storage-elasticsearch`, `@agstack/storage-redis`) are on the roadmap. Until then, use the plugin interface to implement your own:

```ts
// postgres-storage.ts
import { RuntimePlugin, KernelFacade, Transaction } from "@agstack/logger";
import { Pool } from "pg";

export function createPostgresStorage(connectionString: string): RuntimePlugin {
  let pool: Pool;

  return {
    name: "storage.postgres",
    version: "1.0.0",

    async initialize(kernel: KernelFacade): Promise<void> {
      pool = new Pool({ connectionString });

      // Create table if not exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id UUID PRIMARY KEY,
          method TEXT, path TEXT, status_code INT,
          duration INT, body_hash TEXT, client_ip TEXT,
          country TEXT, browser TEXT, os TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          raw JSONB
        )
      `);

      kernel.eventBus.subscribe("enrichment.complete", async (event) => {
        const { transaction } = event.payload as { transaction: Transaction };
        await this.save(transaction);
      }, { sync: true });

      kernel.lifecycle.onBeforeShutdown(async () => {
        await pool.end();
      });
    },

    async shutdown(): Promise<void> {
      if (pool) await pool.end();
    },

    async save(tx: Transaction): Promise<void> {
      await pool.query(
        `INSERT INTO transactions (id, method, path, status_code, duration, body_hash, client_ip, country, browser, os, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          tx.id, tx.request.method, tx.request.path,
          tx.response?.statusCode, tx.duration,
          tx.request.bodyHash, tx.request.clientIp,
          tx.geo?.country, tx.client?.browser, tx.client?.os,
          JSON.stringify(tx),
        ]
      );
    },
  };
}
```

```ts
import { initialize } from "@agstack/logger";
import { createPostgresStorage } from "./postgres-storage";

await initialize({
  plugins: [() => createPostgresStorage("postgres://user:pass@localhost:5432/logs")],
});
```

---

## Payload Management

Payload processing is entirely deferred to the enrichment pipeline (Stage 2). During Stage 1, only a raw reference to `req.body` is captured — no hashing, no truncation, no classification.

### Body Capture

```ts
// body-capture.ts — called from the enrichment pipeline
captureBody(rawBody, { limit: 102400 });
```

**Behavior:**

| Body Size | Result |
|---|---|
| ≤ 64 KB (default limit) | Full text + SHA-256 hash |
| > 64 KB | 1 KB preview + SHA-256 of preview + `truncated: true` |
| JSON object | `JSON.stringify()` then same rules |
| Buffer | `toString("utf-8")` then same rules |
| `undefined` / `null` | Returns `undefined` (skipped) |

### Content-Type Detection

Body capture triggers on any `content-type` that includes `json`, `xml`, `text`, `form-urlencoded`, `graphql`, `javascript`, or `html`. Binary types (images, videos, PDFs, ZIP) are skipped automatically.

### Security Masking

During enrichment, 19 JSON field patterns are matched and replaced with `"[MASKED]"`:

```
password, passwd, secret, api_key, api-secret, apikey,
token, jwt, access_token, refresh_token, auth_token,
cvv, cvc, pin, otp, two_factor_code, ssn,
credit_card, card_number, card
```

Masking is applied **at persistence time** in `FileStorage.sanitize()`, meaning masked values never reach disk.

---

## Security

### Automatic Header Masking

The following headers are always masked (`[MASKED]`) in stored logs:

```
authorization, cookie, set-cookie, x-api-key, x-api-secret,
api-key, api-secret, x-auth-token, x-session-id,
x-csrf-token, x-xsrf-token
```

### Threat Detection Types (data model)

While automatic threat analysis is on the roadmap (`@agstack/security` plugin), the `Transaction` model includes a `security` field ready for plugin integration:

```ts
interface SecurityInfo {
  maskedFields: string[];
  threats: SecurityThreat[];
}

interface SecurityThreat {
  type: "sql_injection" | "brute_force" | "auth_abuse" | "xss"
      | "csrf" | "path_traversal" | "suspicious_input";
  confidence: number;
  details: string;
  timestamp: number;
}
```

### Privacy Recommendations

1. **Set up a storage plugin** that connects to your centralized logging infrastructure — avoid writing logs to local disk in production
2. **Review the masking patterns** in `FileStorage` — add application-specific patterns as needed via a custom storage plugin
3. **Audit enrichment output** — the enrichment pipeline adds UA and Geo data; ensure this complies with your data retention policies
4. **Set queue limits** — the default max queue size is 10,000 items; configure via `new Kernel({ queueMaxSize: ... })` if embedding the kernel directly

---

## Performance

### Request-Path Cost

| Operation | Cost |
|---|---|
| Header normalization | ~0.01 ms |
| URL parsing | ~0.01 ms |
| Client IP extraction | ~0.001 ms |
| Event dispatch (sync) | ~0.001 ms |
| **Total (Stage 1)** | **~0.05 ms** |

Everything else — body hashing, UA parsing, Geo detection, serialization — runs after the response is sent.

### Queue & Workers

- **Queue**: Max 10,000 items (configurable). Sorted by priority. Items with `statusCode >= 500` get priority 0 (highest).
- **Workers**: Default concurrency of 4. Poll interval of 100 ms. Configure via `WorkerPoolOptions`.
- **Retries**: Exponential backoff (2^n seconds). Default 3 retries. Items exceeding max retries move to dead letter.
- **Backpressure**: When the queue reaches capacity, `enqueue()` returns `false` and a `queue.backpressure` event is published.

### Bundle Size

```
@agstack/logger@1.0.0
  Packed: 42.9 kB
  Unpacked: 183.8 kB
  Runtime dependencies: 0
```

---

## API Reference

### `initialize(config?)`

Boots the AGStack kernel.

```ts
async function initialize(config?: Partial<RuntimeConfig>): Promise<void>
```

**Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `config.plugins` | `Array<() => RuntimePlugin>` | `[]` | Plugin factory functions |
| `config.debug` | `boolean` | `false` | Enable internal logging |

**Throws:** If kernel boot fails (e.g., lifecycle error during plugin initialization).

**Idempotent:** Calling `initialize()` multiple times is safe — subsequent calls are no-ops.

### `shutdown()`

Gracefully stops all subsystems.

```ts
async function shutdown(): Promise<void>
```

**Shutdown order:**
1. Publish `kernel.shuttingdown`
2. Stop workers (no new items dequeued)
3. Drain queue (wait for in-flight items)
4. Run lifecycle shutdown handlers (e.g., storage flush)
5. Call `plugin.shutdown()` for each registered plugin
6. Publish `kernel.stopped`

### `version`

```ts
const version: string
```

Current package version (semver). At runtime: `"0.2.0"`.

### `RuntimeConfig`

```ts
interface RuntimeConfig {
  plugins?: Array<() => RuntimePlugin | Promise<RuntimePlugin>>;
  debug?: boolean;
}
```

### `RuntimePlugin`

```ts
interface RuntimePlugin {
  name: string;
  version: string;
  initialize(kernel: KernelFacade): Promise<void>;
  shutdown(): Promise<void>;
  health?(): Promise<{ healthy: boolean; message?: string }>;
}
```

### `KernelFacade`

```ts
interface KernelFacade {
  readonly eventBus: EventBus;
  readonly di: DIContainer;
  readonly lifecycle: LifecycleManager;
}
```

### `Transaction`

```ts
interface Transaction {
  id: string;
  correlationId: string;
  traceId: string;
  status: "pending" | "in_progress" | "completed" | "error" | "timeout";
  request: RequestInfo;
  response?: ResponseInfo;
  performance?: PerformanceInfo;
  databaseOps: DatabaseOperation[];
  externalCalls: ExternalCall[];
  errors: ErrorEvent[];
  client?: ClientInfo;
  geo?: GeoInfo;
  security?: SecurityInfo;
  events: TimelineEvent[];
  metadata: Record<string, unknown>;
  startedAt: number;
  completedAt?: number;
  duration?: number;
}
```

### `RequestInfo`

```ts
interface RequestInfo {
  timestamp: number;
  method: string;
  protocol: string;
  httpVersion: string;
  host: string;
  url: string;
  originalUrl: string;
  path: string;
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  authorization?: string;
  contentType?: string;
  contentLength?: number;
  bodySize?: number;
  bodyRaw?: unknown;      // Raw body reference (Stage 1)
  bodyText?: string;       // Captured body (Stage 2 enrichment)
  bodyHash?: string;       // SHA-256 of body (Stage 2)
  bodyTruncated?: boolean; // True if body exceeded limit
  requestId: string;
  correlationId: string;
  traceId: string;
  clientIp: string;
  proxyHeaders: Record<string, string>;
  userAgent?: string;
  language?: string;
  accept?: string;
  origin?: string;
  referer?: string;
}
```

### `ResponseInfo`

```ts
interface ResponseInfo {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  contentType?: string;
  responseSize?: number;
  executionTime: number;
  latency: number;
  compression?: string;
  cacheHeaders?: Record<string, string>;
  endTimestamp: number;
  bodyRaw?: unknown;
  bodyText?: string;
  bodyHash?: string;
  bodyTruncated?: boolean;
}
```

### `ClientInfo`

```ts
interface ClientInfo {
  browser?: string;
  browserVersion?: string;
  os?: string;
  osVersion?: string;
  deviceType?: string;
  deviceVendor?: string;
  deviceModel?: string;
  platform?: string;
  architecture?: string;
  userAgent: string;
  ipAddress: string;
}
```

### `GeoInfo`

```ts
interface GeoInfo {
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  isp?: string;
  asn?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  isProxy?: boolean;
  isVpn?: boolean;
  proxyType?: string;
}
```

### `SecurityInfo` / `SecurityThreat`

```ts
interface SecurityInfo {
  maskedFields: string[];
  threats: SecurityThreat[];
}

interface SecurityThreat {
  type: "sql_injection" | "brute_force" | "auth_abuse" | "xss"
      | "csrf" | "path_traversal" | "suspicious_input";
  confidence: number;
  details: string;
  timestamp: number;
}
```

### `QueueStats`

```ts
interface QueueStats {
  size: number;
  processing: number;
  failed: number;
  retrying: number;
  backpressure: boolean;
}
```

---

## Best Practices

### Production Deployment

1. **Register a storage plugin** — the built-in FileStorage writes to local disk, which is suitable for development but should be replaced with a database plugin in production
2. **Set up graceful shutdown** — handle `SIGTERM` / `SIGINT` to call `shutdown()`:

```ts
process.on("SIGTERM", async () => {
  console.log("Shutting down AGStack Logger...");
  await shutdown();
  process.exit(0);
});
```

3. **Monitor backpressure** — subscribe to `queue.backpressure` events and alert when they fire:

```ts
kernel.eventBus.subscribe("queue.backpressure", (event) => {
  console.warn("Queue full, transaction dropped:", event.payload.transaction.id);
  // Send alert to your monitoring system
});
```

4. **Review masked fields** — the default 19 JSON field patterns cover common secrets; add application-specific patterns in custom storage plugins

### Plugin Development

- **Always call `kernel.lifecycle.onBeforeShutdown()`** in your plugin's `initialize()` if you need cleanup (close DB connections, flush buffers)
- **Subscribe to `enrichment.complete`**, not `queue.item.process` — enrichment runs before your plugin, so all data (body hash, UA, Geo) is available
- **Use `{ sync: true }`** for storage subscribers to ensure delivery during the worker's processing cycle
- **Keep `initialize()` fast** — defer expensive setup (connection pools, file handles) to avoid delaying app startup

### Memory Management

- **Queue max size**: Default 10,000. Monitor `queue.stats().size` in production to ensure it doesn't approach capacity
- **Buffer sizes**: FileStorage buffers 100 items before flushing. Custom storage plugins should implement similar batching
- **Dead letter**: Bounded at 1,000 entries. Monitor `eventBus.getDeadLetterEvents()` during debugging

---

## Troubleshooting

### Transactions not appearing in logs

1. **Check initialization order** — `initialize()` must be called before any HTTP server starts. The kernel patches `http.createServer` at initialization time.
2. **Check shutdown** — If the process exits before the 5-second flush interval, transactions still in the FileStorage buffer are lost. Always call `shutdown()`.
3. **Verify events** — Subscribe to `transaction.completed` to confirm transactions are being created:

```ts
kernel.eventBus.subscribe("transaction.completed", (event) => {
  console.log("Transaction:", event.payload.transaction.id);
}, { sync: true });
```

### Plugin not loading

1. **Factory must be a function** — `plugins` expects factory functions: `() => plugin`, not `plugin` directly
2. **Check `kernel.facade()` vs `kernel`** — plugins receive `KernelFacade`, not the full `Kernel`. Only `eventBus`, `di`, and `lifecycle` are available
3. **Error handling** — if `initialize()` throws, `initialize()` will reject. Wrap in try-catch:

```ts
try {
  await initialize({ plugins: [myPlugin] });
} catch (err) {
  console.error("AGStack init failed:", err);
}
```

### Performance unexpectedly high

- **Check if sync handlers are blocking** — handlers with `{ sync: true }` run during the request. If your plugin does heavy work in a sync handler, it will block the request path
- **Check enrichment timing** — the enrichment pipeline runs in the worker, but if CPU is saturated, enrichment adds latency to queued items
- **Monitor queue depth** — `queue.stats().size` growing indicates workers can't keep up; increase `workerConcurrency`

### Common Errors

| Error | Cause | Fix |
|---|---|---|
| `ConfigManager not initialized` | `initialize()` not called | Call `await initialize()` before using kernel |
| `Kernel is in "created" state` | `kernel.boot()` not called | Always use `initialize()` instead of `new Kernel()` directly |
| `Cannot find module @agstack/storage-*` | Plugin package not installed | `npm install @agstack/storage-postgres` (when available) |
| Transactions in dead letter | Handler threw repeatedly | Check plugin error handling, increase `maxRetries` |

---

## Roadmap

### Ecosystem Packages (Planned)

| Package | Description |
|---|---|
| `@agstack/storage-postgres` | PostgreSQL transaction persistence |
| `@agstack/storage-mongodb` | MongoDB transaction persistence |
| `@agstack/storage-elasticsearch` | Elasticsearch transaction indexing |
| `@agstack/storage-redis` | Redis transaction caching |
| `@agstack/ai-openai` | OpenAI integration for anomaly detection |
| `@agstack/ai-gemini` | Google Gemini integration |
| `@agstack/ai-anthropic` | Anthropic Claude integration |
| `@agstack/notification-slack` | Slack webhook notifications |
| `@agstack/notification-discord` | Discord webhook notifications |
| `@agstack/notification-email` | SMTP email notifications |
| `@agstack/notification-webhook` | Generic webhook notifications |
| `@agstack/security` | Advanced threat detection (SQLi, XSS, RCE) |
| `@agstack/opentelemetry` | OpenTelemetry trace bridge |
| `@agstack/prometheus` | Prometheus metrics exporter |
| `@agstack/enricher-geoip` | MaxMind GeoIP enrichment |
| `@agstack/enricher-device` | Device detection (beyond UA parsing) |

### Kernel Roadmap

- [ ] HTTP-layer backpressure (503 when queue is full)
- [ ] Dynamic worker auto-scaling
- [ ] Performance metrics built-in (event loop lag, GC stats)
- [ ] Sampling / rate limiting
- [ ] Distributed tracing propagation

---

## Contributing

### Code Standards

- TypeScript strict mode
- No runtime dependencies
- All new features require tests
- ESM modules in source; CJS + ESM dual publish

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make changes with tests
4. Run `npm run typecheck && npm test`
5. Submit PR with description of changes

### Testing

```sh
npm test              # Run all tests
npm run typecheck     # TypeScript type checking
npm run build         # Build CJS + ESM + types
```

---

## License

MIT

Copyright (c) 2026 AGStack

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## Support

- **GitHub Issues**: [https://github.com/agstack/logger/issues](https://github.com/agstack/logger/issues)
- **Documentation**: [https://agstack.dev](https://agstack.dev)
- **Discord**: [https://discord.gg/agstack](https://discord.gg/agstack)
