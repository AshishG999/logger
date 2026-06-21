import fsp from "node:fs/promises";
import path from "node:path";
import type { Transaction, RuntimePlugin, KernelFacade } from "../types";

const SENSITIVE_HEADERS = new Set([
  "authorization", "cookie", "set-cookie", "x-api-key", "x-api-secret",
  "api-key", "api-secret", "x-auth-token", "x-session-id",
  "x-csrf-token", "x-xsrf-token",
]);

function maskSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowered = key.toLowerCase();
    if (SENSITIVE_HEADERS.has(lowered)) {
      masked[key] = "[MASKED]";
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

const SENSITIVE_FIELD_PATTERNS = [
  /"password"\s*:\s*"[^"]+"/gi,
  /"passwd"\s*:\s*"[^"]+"/gi,
  /"secret"\s*:\s*"[^"]+"/gi,
  /"api[_-]?key"\s*:\s*"[^"]+"/gi,
  /"api[_-]?secret"\s*:\s*"[^"]+"/gi,
  /"token"\s*:\s*"[^"]+"/gi,
  /"jwt"\s*:\s*"[^"]+"/gi,
  /"access[_-]?token"\s*:\s*"[^"]+"/gi,
  /"refresh[_-]?token"\s*:\s*"[^"]+"/gi,
  /"auth[_-]?token"\s*:\s*"[^"]+"/gi,
  /"cvv"\s*:\s*"[^"]+"/gi,
  /"cvc"\s*:\s*"[^"]+"/gi,
  /"pin"\s*:\s*"[^"]+"/gi,
  /"otp"\s*:\s*"[^"]+"/gi,
  /"two[_-]?factor[_-]?code"\s*:\s*"[^"]+"/gi,
  /"ssn"\s*:\s*"[^"]+"/gi,
  /"credit[_-]?card"\s*:\s*"[^"]+"/gi,
  /"card[_-]?number"\s*:\s*"[^"]+"/gi,
  /"card"\s*:\s*"[^"]+"/gi,
];

function maskSensitiveContent(text?: string): string | undefined {
  if (!text) return text;
  let masked = text;
  for (const pattern of SENSITIVE_FIELD_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      const colonIdx = match.indexOf(":");
      return match.slice(0, colonIdx + 1) + ' "[MASKED]"';
    });
  }
  return masked;
}

export class FileStorage implements RuntimePlugin {
  readonly name = "storage.file";
  readonly version = "0.2.0";
  private dir: string;
  private buffer: Transaction[] = [];
  private maxBufferSize: number;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private dirReady = false;

  constructor(dir?: string, options?: { maxBufferSize?: number; flushIntervalMs?: number }) {
    this.dir = dir || path.join(process.cwd(), "agstack-logs");
    this.maxBufferSize = options?.maxBufferSize || 100;
    this.dirReady = false;
    const interval = options?.flushIntervalMs ?? 5000;
    this.flushInterval = setInterval(() => this.flush(), interval).unref();
  }

  async initialize(kernel: KernelFacade): Promise<void> {
    kernel.eventBus.subscribe("enrichment.complete", async (event: any) => {
      const { transaction } = event.payload as { transaction: Transaction };
      this.buffer.push(transaction);
      if (this.buffer.length >= this.maxBufferSize) {
        await this.flush();
      }
    }, { sync: true });

    kernel.lifecycle.onBeforeShutdown(async () => {
      await this.stop();
    });
  }

  async health(): Promise<{ healthy: boolean; message?: string }> {
    return {
      healthy: true,
      message: `FileStorage at ${this.dir}, buffer: ${this.buffer.length}/${this.maxBufferSize}`,
    };
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    if (!this.dirReady) {
      try {
        await fsp.mkdir(this.dir, { recursive: true });
        this.dirReady = true;
      } catch (err) {
        console.error("[agstack] FileStorage mkdir failed:", err);
        return;
      }
    }
    const batch = this.buffer.splice(0);
    const dateStr = new Date().toISOString().split("T")[0];
    const filePath = path.join(this.dir, `transactions-${dateStr}.jsonl`);
    const lines = batch.map((t) => JSON.stringify(this.sanitize(t))).join("\n") + "\n";
    try {
      await fsp.appendFile(filePath, lines, "utf-8");
    } catch (err) {
      console.error("[agstack] FileStorage flush failed:", err);
    }
  }

  async shutdown(): Promise<void> {
    await this.stop();
  }

  private async stop(): Promise<void> {
    if (this.flushInterval) clearInterval(this.flushInterval);
    await this.flush();
  }

  private sanitize(t: Transaction): Record<string, unknown> {
    const r = t.request;
    const res = t.response;
    const c = t.client;
    const g = t.geo;

    return {
      id: t.id,
      correlationId: t.correlationId,
      traceId: t.traceId,
      status: t.status,

      method: r.method,
      url: r.url,
      path: r.path,
      host: r.host,
      query: r.query,
      headers: maskSensitiveHeaders(r.headers),
      contentType: r.contentType,
      requestSize: r.contentLength,
      bodySize: r.bodySize,
      bodyHash: r.bodyHash,
      bodyTruncated: r.bodyTruncated,
      bodyText: maskSensitiveContent(r.bodyText),

      statusCode: res?.statusCode,
      responseSize: res?.responseSize,
      responseHeaders: res?.headers ? maskSensitiveHeaders(res.headers) : undefined,
      responseContentType: res?.contentType,
      responseBodyHash: res?.bodyHash,
      responseBodyTruncated: res?.bodyTruncated,
      responseBodyText: maskSensitiveContent(res?.bodyText),
      compression: res?.compression,
      cacheHeaders: res?.cacheHeaders,

      duration: t.duration,
      startedAt: new Date(t.startedAt).toISOString(),
      completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,

      clientIp: r.clientIp,
      userAgent: r.userAgent,
      browser: c?.browser,
      browserVersion: c?.browserVersion,
      os: c?.os,
      osVersion: c?.osVersion,
      deviceType: c?.deviceType,
      deviceVendor: c?.deviceVendor,
      deviceModel: c?.deviceModel,
      platform: c?.platform,

      geo: g ? {
        city: g.city,
        country: g.country,
        isp: g.isp,
        asn: g.asn,
        timezone: g.timezone,
        isProxy: g.isProxy,
        isVpn: g.isVpn,
      } : undefined,

      proxyHeaders: Object.keys(r.proxyHeaders).length > 0 ? r.proxyHeaders : undefined,

      errors: t.errors.length,
      databaseOps: t.databaseOps.length,
      externalCalls: t.externalCalls.length,
      events: t.events.map((e) => ({
        name: e.name,
        category: e.category,
        duration: e.duration,
      })),
    };
  }
}
