import type { RawResponseInfo } from "../transaction/engine";
import { elapsedMs } from "../utils/time";

export class ResponseCollector {
  collect(res: any, startTime: bigint): RawResponseInfo {
    const headers = this.normalizeHeaders(
      res.getHeaders?.() || res.headers || {}
    );
    const contentType = headers["content-type"] || "";
    const contentLength = parseInt(headers["content-length"] || "0", 10);

    return {
      statusCode: res.statusCode || 200,
      statusMessage: res.statusMessage || "OK",
      headers,
      contentType,
      responseSize: contentLength,
      executionTime: elapsedMs(startTime),
    };
  }

  private normalizeHeaders(
    headers: Record<string, string | number | string[] | undefined>
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
}
