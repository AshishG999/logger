import type { ResponseInfo } from "../types";
import { elapsedMs } from "../utils/time";

export class ResponseCollector {
  collect(res: any, startTime: bigint, _req?: any): ResponseInfo {
    const headers = this.normalizeHeaders(res.getHeaders?.() || res.headers || {});
    const contentType = headers["content-type"] || "";
    const responseSize = this.calculateResponseSize(res, headers);

    return {
      statusCode: res.statusCode || 200,
      statusMessage: res.statusMessage || "OK",
      headers,
      contentType,
      responseSize,
      executionTime: elapsedMs(startTime),
      latency: elapsedMs(startTime),
      compression: headers["content-encoding"] || undefined,
      cacheHeaders: this.extractCacheHeaders(headers),
      endTimestamp: Date.now(),
    };
  }

  private normalizeHeaders(headers: Record<string, string | number | string[] | undefined>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined && value !== null) {
        normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
      }
    }
    return normalized;
  }

  private calculateResponseSize(res: any, headers: Record<string, string>): number {
    const contentLength = parseInt(headers["content-length"] || "0", 10);
    if (contentLength > 0) return contentLength;
    return 0;
  }

  private extractCacheHeaders(headers: Record<string, string>): Record<string, string> {
    const cacheHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (key.startsWith("cache-") || key === "etag" || key === "last-modified" || key === "expires" || key === "pragma") {
        cacheHeaders[key] = value;
      }
    }
    return cacheHeaders;
  }
}
