import type { TransactionStatus, TimelineEventData } from "@agstack/plugin-sdk";
import { generateId, generateTraceId, generateCorrelationId, generateRequestId } from "../utils/id";

export type { TransactionStatus } from "@agstack/plugin-sdk";

export interface RawRequestInfo {
  timestamp: number;
  method: string;
  protocol: string;
  httpVersion: string;
  host: string;
  url: string;
  path: string;
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  headers: Record<string, string>;
  contentType: string;
  contentLength: number;
  requestId: string;
  correlationId: string;
  traceId: string;
  clientIp: string;
  userAgent: string;
}

export interface RawResponseInfo {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  contentType: string;
  responseSize: number;
  executionTime: number;
}

export interface Transaction {
  id: string;
  correlationId: string;
  traceId: string;
  status: TransactionStatus;
  request: RawRequestInfo;
  response?: RawResponseInfo;
  metadata: Record<string, unknown>;
  errors: TransactionError[];
  events: TimelineEvent[];
  startedAt: number;
  completedAt?: number;
  duration?: number;
  payloadMetadata?: PayloadMetadata;
}

export interface TransactionError {
  id: string;
  type: string;
  message: string;
  stack?: string;
  severity: "low" | "medium" | "high" | "critical";
  timestamp: number;
}

export type TimelineEvent = TimelineEventData;

export interface PayloadMetadata {
  contentType?: string;
  size?: number;
  preview?: string;
  hash?: string;
  encoding?: string;
  isMultipart: boolean;
  isStreaming: boolean;
  isBase64?: boolean;
}

export class TransactionEngine {
  private activeTransactions = new Map<string, Transaction>();

  create(request: RawRequestInfo): Transaction {
    const id = generateId();
    const correlationId = request.correlationId || generateCorrelationId();
    const traceId = request.traceId || generateTraceId();

    const transaction: Transaction = {
      id,
      correlationId,
      traceId,
      status: "in_progress",
      request: {
        timestamp: request.timestamp,
        method: request.method,
        protocol: request.protocol,
        httpVersion: request.httpVersion,
        host: request.host,
        url: request.url,
        path: request.path,
        query: request.query || {},
        params: request.params || {},
        headers: request.headers || {},
        contentType: request.contentType || "",
        contentLength: request.contentLength || 0,
        requestId: request.requestId || generateRequestId(),
        correlationId,
        traceId,
        clientIp: request.clientIp || "",
        userAgent: request.userAgent || "",
      },
      metadata: {},
      errors: [],
      events: [],
      startedAt: Date.now(),
    };

    this.activeTransactions.set(id, transaction);
    return transaction;
  }

  get(id: string): Transaction | undefined {
    return this.activeTransactions.get(id);
  }

  complete(id: string, response?: RawResponseInfo): Transaction | undefined {
    const t = this.activeTransactions.get(id);
    if (t) {
      t.status = response && response.statusCode >= 400 ? "error" : "completed";
      t.completedAt = Date.now();
      t.duration = t.completedAt - t.startedAt;
      if (response) t.response = response;
    }
    return t;
  }

  fail(id: string, error?: TransactionError): Transaction | undefined {
    const t = this.activeTransactions.get(id);
    if (t) {
      t.status = "error";
      t.completedAt = Date.now();
      t.duration = t.completedAt - t.startedAt;
      if (error) t.errors.push(error);
    }
    return t;
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
