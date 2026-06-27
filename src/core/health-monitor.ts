import type { HealthStatus, HealthCheckResult, HealthReporter } from "@agstack/plugin-sdk";
import { EventBus } from "./event-bus";
import { LifecycleManager } from "./lifecycle";

export interface HealthMonitorOptions {
  intervalMs?: number;
}

export interface SystemHealth {
  status: HealthStatus;
  uptimeMs: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  eventLoopDelay: number;
  pluginCount: number;
  queueSize: number;
  workerCount: number;
}

export class HealthMonitor {
  private interval: ReturnType<typeof setInterval> | null = null;
  private _status: HealthStatus = "starting";
  private statusChangeCallbacks: Array<(status: HealthStatus) => void> = [];
  private lastEventLoopDelay = 0;

  constructor(
    private eventBus: EventBus,
    private lifecycle: LifecycleManager,
    private options: HealthMonitorOptions = {}
  ) {
    this.options = { intervalMs: 30000, ...options };
  }

  get status(): HealthStatus {
    return this._status;
  }

  start(): void {
    this._status = "healthy";
    this.measureEventLoopDelay();
    this.interval = setInterval(() => {
      this.measureEventLoopDelay();
    }, this.options.intervalMs ?? 30000).unref();
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this._status = "stopping";
  }

  private measureEventLoopDelay(): void {
    const start = Date.now();
    setImmediate(() => {
      this.lastEventLoopDelay = Date.now() - start;
    });
  }

  getEventLoopDelay(): number {
    return this.lastEventLoopDelay;
  }

  getSystemHealth(
    pluginCount: number,
    queueSize: number,
    workerCount: number
  ): SystemHealth {
    const mem = process.memoryUsage();
    return {
      status: this._status,
      uptimeMs: process.uptime() * 1000,
      memory: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      },
      eventLoopDelay: this.lastEventLoopDelay,
      pluginCount,
      queueSize,
      workerCount,
    };
  }

  updateStatus(status: HealthStatus): void {
    const old = this._status;
    this._status = status;
    if (old !== status) {
      for (const cb of this.statusChangeCallbacks) {
        try {
          cb(status);
        } catch {
        }
      }
    }
  }

  onHealthChange(callback: (status: HealthStatus) => void): void {
    this.statusChangeCallbacks.push(callback);
  }

  async check(): Promise<HealthCheckResult> {
    return {
      status: this._status,
      pluginName: "@agstack/logger",
      pluginVersion: "2.0.0",
      timestamp: Date.now(),
      durationMs: 0,
      message: `Runtime is ${this._status}`,
      metrics: {
        uptimeMs: process.uptime() * 1000,
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    };
  }

  getStatus(): HealthStatus {
    return this._status;
  }
}
