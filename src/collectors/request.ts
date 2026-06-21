import type { RequestInfo } from "../types";

export class RequestCollector {
  collect(req: any): RequestInfo {
    const headers = this.normalizeHeaders(req.headers || {});
    let url: URL;
    try {
      url = new URL(req.url, `http://${headers.host || "localhost"}`);
    } catch {
      url = new URL(req.url || "/", "http://localhost");
    }
    const contentType = headers["content-type"] || "";
    const contentLength = parseInt(headers["content-length"] || "0", 10) || 0;
    const bodyRaw = req.body ?? undefined;

    return {
      timestamp: Date.now(),
      method: (req.method || "GET").toUpperCase(),
      protocol: `HTTP/${req.httpVersion || "1.1"}`,
      httpVersion: req.httpVersion || "1.1",
      host: headers.host || "",
      url: req.url || "",
      originalUrl: req.originalUrl || req.url || "",
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()) as Record<string, string>,
      params: req.params || {},
      headers,
      cookies: this.parseCookies(headers),
      contentType,
      contentLength,
      bodyRaw,
      requestId: headers["x-request-id"] || crypto.randomUUID(),
      correlationId: headers["x-correlation-id"] || headers["x-request-id"] || "",
      traceId: headers["x-trace-id"] || headers["traceparent"] || "",
      clientIp: this.extractClientIp(req, headers),
      proxyHeaders: this.extractProxyHeaders(headers),
      userAgent: headers["user-agent"] || "",
      language: headers["accept-language"] || "",
      accept: headers["accept"] || "",
      origin: headers["origin"] || "",
      referer: headers["referer"] || headers["referrer"] || "",
      authorization: headers["authorization"] ? "[MASKED]" : undefined,
    };
  }

  private normalizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined && value !== null) {
        normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : String(value);
      }
    }
    return normalized;
  }

  private parseCookies(headers: Record<string, string>): Record<string, string> {
    const cookieHeader = headers["cookie"] || "";
    if (!cookieHeader) return {};
    const cookies: Record<string, string> = {};
    for (const pair of cookieHeader.split(";")) {
      const [key, ...val] = pair.trim().split("=");
      if (key) cookies[key] = val.join("=");
    }
    return cookies;
  }

  private extractClientIp(req: any, headers: Record<string, string>): string {
    return (
      headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      headers["x-real-ip"] ||
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress ||
      req.ip ||
      "127.0.0.1"
    );
  }

  private extractProxyHeaders(headers: Record<string, string>): Record<string, string> {
    const proxyHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (key.startsWith("x-forwarded-") || key.startsWith("x-real-") || key === "via" || key === "x-cache") {
        proxyHeaders[key] = value;
      }
    }
    return proxyHeaders;
  }
}
