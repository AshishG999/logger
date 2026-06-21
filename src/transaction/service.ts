import type { EventBus, BusEvent } from "../core/event-bus";
import { TransactionEngine } from "./engine";
import { RequestCollector } from "../collectors/request";
import { ResponseCollector } from "../collectors/response";

export class TransactionService {
  private engine: TransactionEngine;
  private requestCollector: RequestCollector;
  private responseCollector: ResponseCollector;
  private requestMap = new WeakMap<object, any>();

  constructor() {
    this.engine = new TransactionEngine();
    this.requestCollector = new RequestCollector();
    this.responseCollector = new ResponseCollector();
  }

  register(eventBus: EventBus): void {
    eventBus.subscribe("http.request", (event: BusEvent<{ req: any; res: any }>) => {
      const { req, res } = event.payload;
      const requestInfo = this.requestCollector.collect(req);
      const transaction = this.engine.create(requestInfo);
      this.requestMap.set(req, transaction);
      this.requestMap.set(res, transaction);

      transaction.events.push({
        id: crypto.randomUUID(),
        name: "request_received",
        category: "http",
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 0,
        details: { method: req.method, url: req.url },
      });

      eventBus.publish("transaction.created", {
        transaction,
        req,
        res,
      }, { source: "transaction-service", correlationId: transaction.correlationId });
    });

    eventBus.subscribe("http.response", (event: BusEvent<{ req: any; res: any }>) => {
      const { req, res } = event.payload;
      const transaction = this.requestMap.get(req) || this.requestMap.get(res);
      if (!transaction) return;

      this.requestMap.delete(req);
      this.requestMap.delete(res);

      const startTime = process.hrtime.bigint();
      const responseInfo = this.responseCollector.collect(res, startTime);
      transaction.response = responseInfo;
      transaction.status = responseInfo.statusCode >= 400 ? "error" : "completed";
      transaction.completedAt = Date.now();
      transaction.duration = transaction.completedAt - transaction.startedAt;

      transaction.events.push({
        id: crypto.randomUUID(),
        name: "response_sent",
        category: "http",
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 0,
      });

      this.engine.complete(transaction.id);

      eventBus.publish("transaction.completed", { transaction }, {
        source: "transaction-service",
        correlationId: transaction.correlationId,
      });
    });
  }

  getEngine(): TransactionEngine {
    return this.engine;
  }
}
