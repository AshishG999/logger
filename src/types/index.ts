export interface RuntimeConfig {
  plugins?: Array<() => RuntimePlugin | Promise<RuntimePlugin>>;
  debug?: boolean;
}

export interface RuntimePlugin {
  name: string;
  version: string;
  initialize(kernel: KernelFacade): Promise<void>;
  shutdown(): Promise<void>;
  health?(): Promise<{ healthy: boolean; message?: string }>;
}

export interface KernelFacade {
  readonly eventBus: import("../core/event-bus").EventBus;
  readonly di: import("../core/di-container").DIContainer;
  readonly lifecycle: import("../core/lifecycle").LifecycleManager;
}

export interface Transaction {
  id: string;
  correlationId: string;
  traceId: string;
  status: TransactionStatus;
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

export type TransactionStatus = "pending" | "in_progress" | "completed" | "error" | "timeout";

export interface RequestInfo {
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
  bodyRaw?: unknown;
  bodyText?: string;
  bodyHash?: string;
  bodyTruncated?: boolean;
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

export interface ResponseInfo {
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

export interface GeoInfo {
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

export interface PerformanceInfo {
  executionTime: number;
  memoryUsage: MemoryUsage;
  heapUsage: HeapUsage;
  cpuUsage?: CPUUsage;
  eventLoopDelay?: number;
  gcEvents?: GCEvent[];
  processUptime: number;
  openHandles?: number;
  openConnections?: number;
}

export interface MemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export interface HeapUsage {
  totalHeapSize: number;
  usedHeapSize: number;
  heapSizeLimit: number;
  mallocedMemory?: number;
  peakMallocedMemory?: number;
}

export interface CPUUsage {
  user: number;
  system: number;
  percent: number;
}

export interface GCEvent {
  type: string;
  duration: number;
  timestamp: number;
}

export interface DatabaseOperation {
  id: string;
  type: "query" | "command" | "transaction";
  system: "mysql" | "postgres" | "mongodb" | "redis";
  operation: string;
  query?: string;
  parameters?: unknown[];
  executionTime: number;
  rowsReturned?: number;
  connectionPool?: string;
  error?: string;
  retryCount: number;
  timestamp: number;
  transactionId: string;
}

export interface ExternalCall {
  id: string;
  type: "fetch" | "axios" | "undici" | "got" | "http" | "https";
  url: string;
  method: string;
  headers?: Record<string, string>;
  payloadSize?: number;
  responseStatus?: number;
  latency: number;
  retries: number;
  timeout?: number;
  error?: string;
  timestamp: number;
  transactionId: string;
}

export interface ErrorEvent {
  id: string;
  type: "unhandled_exception" | "unhandled_rejection" | "framework" | "database" | "external_api" | "validation" | "timeout" | "security" | "custom";
  message: string;
  stack?: string;
  code?: string;
  severity: "low" | "medium" | "high" | "critical";
  timestamp: number;
  context?: Record<string, unknown>;
  transactionId: string;
}

export interface ClientInfo {
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

export interface SecurityInfo {
  maskedFields: string[];
  threats: SecurityThreat[];
}

export interface SecurityThreat {
  type: "sql_injection" | "brute_force" | "auth_abuse" | "xss" | "csrf" | "path_traversal" | "suspicious_input";
  confidence: number;
  details: string;
  timestamp: number;
}

export interface TimelineEvent {
  id: string;
  name: string;
  category: string;
  startTime: number;
  endTime: number;
  duration: number;
  details?: Record<string, unknown>;
}

export interface QueueItem {
  id: string;
  transaction: Transaction;
  priority: number;
  retries: number;
  maxRetries: number;
  createdAt: number;
  nextRetryAt?: number;
}

export interface WorkerConfig {
  concurrency: number;
  intervalMs: number;
  maxRetries: number;
  backoffMs: number;
}

export interface QueueStats {
  size: number;
  pending: number;
  processing: number;
  failed: number;
  retrying: number;
  backpressure: boolean;
}


