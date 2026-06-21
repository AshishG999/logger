import type { Transaction, RequestInfo, ResponseInfo, TimelineEvent, DatabaseOperation, ExternalCall, ErrorEvent } from "../types";
import { generateId, generateTraceId, generateCorrelationId, generateRequestId } from "../utils/id";

export class TransactionEngine {
  private activeTransactions = new Map<string, Transaction>();

  create(requestInfo: Partial<RequestInfo>): Transaction {
    const id = generateId();
    const correlationId = requestInfo.correlationId || generateCorrelationId();
    const traceId = requestInfo.traceId || generateTraceId();

    const transaction: Transaction = {
      id,
      correlationId,
      traceId,
      status: "in_progress",
      request: {
        timestamp: requestInfo.timestamp || Date.now(),
        method: requestInfo.method || "GET",
        protocol: requestInfo.protocol || "HTTP/1.1",
        httpVersion: requestInfo.httpVersion || "1.1",
        host: requestInfo.host || "",
        url: requestInfo.url || "",
        originalUrl: requestInfo.originalUrl || requestInfo.url || "",
        path: requestInfo.path || "",
        query: requestInfo.query || {},
        params: requestInfo.params || {},
        headers: requestInfo.headers || {},
        cookies: requestInfo.cookies || {},
        contentType: requestInfo.contentType || "",
        contentLength: requestInfo.contentLength || 0,
        requestId: requestInfo.requestId || generateRequestId(),
        correlationId,
        traceId,
        clientIp: requestInfo.clientIp || "",
        proxyHeaders: requestInfo.proxyHeaders || {},
        userAgent: requestInfo.userAgent || "",
        language: requestInfo.language || "",
        accept: requestInfo.accept || "",
        origin: requestInfo.origin || "",
        referer: requestInfo.referer || "",
      },
      databaseOps: [],
      externalCalls: [],
      errors: [],
      events: [],
      metadata: {},
      startedAt: Date.now(),
    };

    this.activeTransactions.set(id, transaction);
    return transaction;
  }

  get(id: string): Transaction | undefined {
    return this.activeTransactions.get(id);
  }

  complete(id: string, response?: Partial<ResponseInfo>): Transaction | undefined {
    const t = this.activeTransactions.get(id);
    if (t) {
      t.status = "completed";
      t.completedAt = Date.now();
      t.duration = t.completedAt - t.startedAt;
    }
    return t;
  }

  fail(id: string, error?: ErrorEvent): Transaction | undefined {
    const t = this.activeTransactions.get(id);
    if (t) {
      t.status = "error";
      t.completedAt = Date.now();
      t.duration = t.completedAt - t.startedAt;
      if (error) t.errors.push(error);
    }
    return t;
  }

  addEvent(transactionId: string, event: TimelineEvent): void {
    this.activeTransactions.get(transactionId)?.events.push(event);
  }

  addDatabaseOp(transactionId: string, op: DatabaseOperation): void {
    const t = this.activeTransactions.get(transactionId);
    if (t) {
      t.databaseOps.push(op);
      t.events.push({
        id: generateId(),
        name: `db_${op.system}_${op.operation}`,
        category: "database",
        startTime: op.timestamp,
        endTime: op.timestamp + op.executionTime,
        duration: op.executionTime,
        details: { system: op.system, operation: op.operation, query: op.query },
      });
    }
  }

  addExternalCall(transactionId: string, call: ExternalCall): void {
    const t = this.activeTransactions.get(transactionId);
    if (t) {
      t.externalCalls.push(call);
      t.events.push({
        id: generateId(),
        name: `http_${call.method}_${call.url}`,
        category: "external_http",
        startTime: call.timestamp,
        endTime: call.timestamp + call.latency,
        duration: call.latency,
        details: { url: call.url, method: call.method, status: call.responseStatus },
      });
    }
  }

  addError(transactionId: string, error: ErrorEvent): void {
    const t = this.activeTransactions.get(transactionId);
    if (t) {
      t.errors.push(error);
      t.events.push({
        id: generateId(),
        name: `error_${error.type}`,
        category: "error",
        startTime: error.timestamp,
        endTime: error.timestamp,
        duration: 0,
        details: { type: error.type, message: error.message, severity: error.severity },
      });
    }
  }

  remove(id: string): void {
    this.activeTransactions.delete(id);
  }

  getActiveCount(): number {
    return this.activeTransactions.size;
  }

  getAllActive(): Transaction[] {
    return Array.from(this.activeTransactions.values());
  }
}
