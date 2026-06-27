import type { RawRequestInfo } from "../transaction/engine";
import { generateRequestId } from "../utils/id";

export class RequestCollector {
  collect(req: any): RawRequestInfo {
    const headers = this.normalizeHeaders(req.headers || {});
    let url: URL;
    try {
      url = new URL(req.url, `http://${headers.host || "localhost"}`);
    } catch {
      url = new URL(req.url || "/", "http://localhost");
    }
    const contentType = headers["content-type"] || "";
    const contentLength = parseInt(headers["content-length"] || "0", 10) || 0;

    return {
      timestamp: Date.now(),
      method: (req.method || "GET").toUpperCase(),
      protocol: `HTTP/${req.httpVersion || "1.1"}`,
      httpVersion: req.httpVersion || "1.1",
      host: headers.host || "",
      url: req.url || "",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()) as Record<string, string>,
      params: req.params || {},
      headers,
      contentType,
      contentLength,
      requestId: headers["x-request-id"] || generateRequestId(),
      correlationId: headers["x-correlation-id"] || headers["x-request-id"] || "",
      traceId: headers["x-trace-id"] || headers["traceparent"] || "",
      clientIp: this.extractClientIp(req, headers),
      userAgent: headers["user-agent"] || "",
    };
  }

  private normalizeHeaders(
    headers: Record<string, string | string[] | undefined>
  ): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined && value !== null) {
        normalized[key.toLowerCase()] = Array.isArray(value)
          ? value.join(", ")
          : String(value);
      }
    }
    return normalized;
  }

  private extractClientIp(
    req: any,
    headers: Record<string, string>
  ): string {
    return (
      headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      headers["x-real-ip"] ||
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress ||
      req.ip ||
      "127.0.0.1"
    );
  }
}
