import http from "node:http";
import https from "node:https";
import type { Kernel } from "../core/kernel";

const END_ORIGINAL = Symbol("endOriginal");

export class RuntimeEngine {
  private kernel!: Kernel;
  private initialized = false;

  async initialize(kernel: Kernel): Promise<void> {
    if (this.initialized) return;
    this.kernel = kernel;
    this.patchHttp();
    this.setupErrorHandlers();
    this.initialized = true;
    kernel.eventBus.publish("runtime.initialized", {}, { source: "runtime-engine" });
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    this.initialized = false;
    this.kernel.eventBus.publish("runtime.shutdown", {}, { source: "runtime-engine" });
  }

  private patchHttp(): void {
    try {
      const origCreateServer = http.createServer;
      http.createServer = ((...args: any[]) => {
        const server = (origCreateServer as any)(...args);
        this.wrapServer(server);
        return server;
      }) as typeof http.createServer;

      const origCreateSecureServer = https.createServer;
      https.createServer = ((...args: any[]) => {
        const server = (origCreateSecureServer as any)(...args);
        this.wrapServer(server);
        return server;
      }) as typeof https.createServer;
    } catch (err) {
      console.error("[agstack] Failed to patch http.createServer:", err);
    }
  }

  private wrapServer(server: any): void {
    const engine = this;
    const origListen = server.listen;
    server.listen = function (...args: any[]) {
      server.prependListener("request", (req: any, res: any) => {
        engine.handleRequest(req, res);
      });
      return origListen.apply(this, args);
    };
  }

  private handleRequest(req: any, res: any): void {
    const bus = this.kernel.eventBus;
    bus.publish("http.request", { req, res }, {
      source: "runtime-engine",
      priority: 0,
    });

    const origEnd = res.end;
    if (!res[END_ORIGINAL]) {
      res[END_ORIGINAL] = origEnd;
      res.end = function (this: any, ...args: any[]) {
        bus.publish("http.response", { req, res }, {
          source: "runtime-engine",
          priority: 0,
        });
        return this[END_ORIGINAL].apply(this, args);
      };
    }
  }

  private setupErrorHandlers(): void {
    const bus = this.kernel.eventBus;
    process.on("uncaughtException", (error) => {
      try {
        bus.publish("error.uncaught", {
          message: error.message,
          stack: error.stack,
          type: "unhandled_exception",
        }, { priority: 0, source: "runtime-engine" });
      } catch (inner) {
        console.error("[agstack] Error in uncaughtException handler:", inner);
      }
    });

    process.on("unhandledRejection", (reason) => {
      try {
        bus.publish("error.unhandled", {
          message: reason instanceof Error ? reason.message : String(reason),
          stack: reason instanceof Error ? reason.stack : undefined,
          type: "unhandled_rejection",
        }, { priority: 0, source: "runtime-engine" });
      } catch (inner) {
        console.error("[agstack] Error in unhandledRejection handler:", inner);
      }
    });
  }
}
