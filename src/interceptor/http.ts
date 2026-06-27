import http from "node:http";
import https from "node:https";
import type { EventBus } from "../core/event-bus";
import type { TransactionEngine, Transaction } from "../transaction/engine";
import { RequestCollector } from "../collectors/request";
import { ResponseCollector } from "../collectors/response";
import { MetricsCollector } from "../core/metrics";

const END_ORIGINAL = Symbol("endOriginal");

export interface InterceptorOptions {
  captureResponseBody?: boolean;
}

export class HttpInterceptor {
  private requestCollector = new RequestCollector();
  private responseCollector = new ResponseCollector();
  private requestMap = new WeakMap<object, Transaction>();
  private initialized = false;

  constructor(
    private eventBus: EventBus,
    private transactionEngine: TransactionEngine,
    private metrics: MetricsCollector,
    private options: InterceptorOptions = {}
  ) {
    this.options = { captureResponseBody: false, ...options };
  }

  initialize(): void {
    if (this.initialized) return;
    this.patchHttp();
    this.setupErrorHandlers();
    this.initialized = true;
  }

  shutdown(): void {
    this.initialized = false;
  }

  private patchHttp(): void {
    try {
      const origCreateServer = http.createServer.bind(http);
      http.createServer = ((...args: any[]) => {
        const server = origCreateServer(...args);
        this.wrapServer(server);
        return server;
      }) as typeof http.createServer;

      const origCreateSecureServer = https.createServer.bind(https);
      https.createServer = ((...args: any[]) => {
        const server = origCreateSecureServer(...args);
        this.wrapServer(server);
        return server;
      }) as typeof https.createServer;
    } catch {
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
    const self = this;
    const startTime = process.hrtime.bigint();

    const requestInfo = this.requestCollector.collect(req);
    const transaction = this.transactionEngine.create(requestInfo);
    this.requestMap.set(req, transaction);
    this.requestMap.set(res, transaction);

    this.metrics.incrementCounter("http.requests", {
      method: requestInfo.method,
      path: requestInfo.path,
    });

    this.eventBus.publish("transaction.created", {
      transactionId: transaction.id,
      correlationId: transaction.correlationId,
      traceId: transaction.traceId,
      method: requestInfo.method as any,
      path: requestInfo.path,
    });

    const origEnd = res.end;
    if (!res[END_ORIGINAL]) {
      res[END_ORIGINAL] = origEnd;
      res.end = function (this: any, ...args: any[]) {
        const responseInfo = self.responseCollector.collect(res, startTime);
        self.transactionEngine.complete(transaction.id, responseInfo);
        self.requestMap.delete(req);
        self.requestMap.delete(res);

        self.metrics.recordHistogram("http.response_time", responseInfo.executionTime, {
          method: requestInfo.method,
          path: requestInfo.path,
          status: String(responseInfo.statusCode),
        });

        self.metrics.incrementCounter("http.responses", {
          status: String(responseInfo.statusCode),
        });

        self.eventBus.publish("transaction.completed", {
          transactionId: transaction.id,
          correlationId: transaction.correlationId,
          traceId: transaction.traceId,
          statusCode: responseInfo.statusCode,
          durationMs: responseInfo.executionTime,
        });

        return self.requestMap.has(this)
          ? this[END_ORIGINAL].apply(this, args)
          : origEnd.apply(this, args);
      };
    }
  }

  private setupErrorHandlers(): void {
    process.on("uncaughtException", (error) => {
      try {
        this.eventBus.publish("runtime.error", {
          message: error.message,
          stack: error.stack,
        });
      } catch {
      }
    });

    process.on("unhandledRejection", (reason) => {
      try {
        this.eventBus.publish("runtime.error", {
          message: reason instanceof Error ? reason.message : String(reason),
          stack: reason instanceof Error ? reason.stack : undefined,
        });
      } catch {
      }
    });
  }
}
