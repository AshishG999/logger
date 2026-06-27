# @agstack/logger — AGStack Runtime Kernel

**Version 2.0.0**

The AGStack Runtime Kernel is a lightweight, high-performance Node.js runtime lifecycle manager. It provides HTTP interception, transaction creation, event bus, queue, worker pool, plugin management, hook execution, configuration, health monitoring, and metrics collection — all without external dependencies beyond the plugin SDK.

## Philosophy

The Runtime Kernel is the only required package in the AGStack ecosystem. Everything else is a plugin:

- **Storage** (file, database, cloud) → plugins
- **AI** (analysis, classification) → plugins
- **Notifications** (email, Slack, Discord) → plugins
- **Enrichment** (GeoIP, UA parsing, body capture) → plugins

The Kernel only knows about plugin interfaces defined by `@agstack/plugin-sdk`.

## Architecture

```
Incoming Request
    ↓
Create Transaction
    ↓
Collect Raw Request Metadata
    ↓
Pass Request to Application
    ↓
Capture Response
    ↓
Collect Raw Response Metadata
    ↓
Immediately Return Response
    ↓
setImmediate()
    ↓
Queue
    ↓
Worker Pool
    ↓
Plugin Pipeline → Storage → AI → Notifications → Metrics
    ↓
Completion
```

**The application response never waits for plugin execution.**

## Installation

```bash
npm install @agstack/logger
```

## Quick Start

```typescript
import { initialize, shutdown, getKernel } from "@agstack/logger";
import http from "node:http";

async function main() {
  // Initialize the Runtime Kernel
  await initialize({
    runtime: {
      debug: true,
      queueMaxSize: 10000,
      workerConcurrency: 4,
    },
  });

  // Create your HTTP server (automatically intercepted)
  const server = http.createServer((req, res) => {
    res.end("Hello from AGStack Runtime!");
  });

  server.listen(3000, () => {
    console.log("Server running on port 3000");
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    server.close();
    await shutdown();
  });
}

main();
```

## Core Concepts

### Runtime Lifecycle

The kernel transitions through states: `created` → `booting` → `running` → `stopping` → `stopped`.

### HTTP Interception

Node.js `http.createServer` and `https.createServer` are automatically patched to intercept all requests. The kernel collects:

- Request method, URL, path, headers
- Response status code, headers, timing
- Client IP and user agent

All collection is lightweight. Heavy work happens in background workers.

### Transaction Pipeline

1. **Request arrives** → Transaction created with raw metadata
2. **Response sent** → Transaction completed with response metadata
3. **Response returned** immediately to client
4. **Transaction queued** on `setImmediate()` for background processing
5. **Workers process** the queue, executing plugin pipelines

### Event Bus

Strongly-typed event system powered by `@agstack/plugin-sdk`. Key events:

| Event | Payload |
|-------|---------|
| `runtime.started` | version, startedAt, nodeVersion, platform |
| `runtime.shutdown` | uptimeMs |
| `transaction.created` | transactionId, method, path |
| `transaction.completed` | transactionId, statusCode, durationMs |
| `queue.enqueued` | itemId, priority, queueSize |
| `plugin.loaded` | pluginName, pluginType, pluginVersion |
| `plugin.failed` | pluginName, pluginType, error |

### Queue

High-performance in-memory priority queue with:

- Priority-based ordering
- Configurable max size with backpressure detection
- Retry support with exponential backoff
- Dead-letter queue for failed items
- Graceful draining on shutdown

### Worker Pool

Configurable pool of workers that process queue items:

- Dynamic scaling
- Configurable concurrency and poll interval
- Graceful shutdown with pending task completion
- Per-worker processed/failed tracking

### Plugin Manager

Dynamic plugin system via `@agstack/plugin-sdk`:

- Register plugins with metadata validation
- Version compatibility checking
- Dependency resolution
- Lifecycle hooks (initialize, start, pause, resume, shutdown)
- Error isolation — one plugin failure never affects another

### Hook Engine

Execute hooks at lifecycle points:

`beforeTransaction`, `afterTransaction`, `beforeQueue`, `afterQueue`, `beforeEnrichment`, `afterEnrichment`, `beforeStorage`, `afterStorage`, `beforePlugin`, `afterPlugin`, `beforeAI`, `afterAI`, `beforeNotification`, `afterNotification`, `beforeShutdown`, `afterShutdown`, `onError`

## API Reference

### `initialize(config?)`

Initializes the Runtime Kernel. Idempotent — safe to call multiple times.

```typescript
interface RuntimeKernelConfig {
  runtime?: {
    debug?: boolean;
    queueMaxSize?: number;
    workerConcurrency?: number;
    workerPollIntervalMs?: number;
    shutdownTimeoutMs?: number;
  };
  payload?: PayloadConfiguration;
  security?: SecurityConfiguration;
  plugins?: Array<() => IPlugin | Promise<IPlugin>>;
}
```

### `shutdown()`

Gracefully shuts down the kernel: stops workers, drains queue, stops plugins.

### `registerPlugin(plugin, config?)`

Registers a plugin after initialization.

### `getKernel()`

Returns the Kernel instance. Throws if not initialized.

### `isInitialized()`

Returns boolean indicating kernel state.

## Configuration

Configuration can be provided at initialization or via environment variables:

| Env Variable | Config Property | Default |
|-------------|----------------|---------|
| `AGSTACK_DEBUG` | `runtime.debug` | `false` |
| `AGSTACK_QUEUE_MAX_SIZE` | `runtime.queueMaxSize` | `10000` |
| `AGSTACK_WORKER_CONCURRENCY` | `runtime.workerConcurrency` | `4` |
| `AGSTACK_SHUTDOWN_TIMEOUT` | `runtime.shutdownTimeoutMs` | `30000` |

## Performance

- Additional request latency: **< 1ms**
- No blocking I/O during request lifecycle
- No database writes or network calls on the critical path
- Heavy processing deferred to background workers via `setImmediate()`

## Graceful Shutdown

```typescript
process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await shutdown();
  console.log("Goodbye.");
  process.exit(0);
});
```

Shutdown order:
1. Health monitor stops
2. Worker pool stops (waits for pending tasks)
3. Queue drains
4. All plugins shutdown (in reverse priority order)
5. Lifecycle transitions to `stopped`

## Testing

```bash
npm test        # Run all tests
npm run test:coverage  # With coverage
```

Tests cover: EventBus, Queue, WorkerPool, LifecycleManager, PluginManager, HookEngine, MetricsCollector, TransactionEngine, RequestCollector, ResponseCollector, ConfigurationManager, HealthMonitor, Kernel integration, HTTP interception, concurrency, and error handling.

## Building

```bash
npm run build       # Build ESM + CJS + DTS
npm run typecheck   # TypeScript type checking
```

## License

MIT
