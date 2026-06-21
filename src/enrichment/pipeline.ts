import type { EventBus, BusEvent } from "../core/event-bus";
import type { Transaction } from "../types";
import { captureBody } from "../utils/body-capture";
import { parseUserAgent } from "../utils/ua-parser";

export class EnrichmentPipeline {
  register(eventBus: EventBus): void {
    eventBus.subscribe("queue.item.process", (event: BusEvent<Transaction>) => {
      const tx = event.payload;
      this.enrich(tx);
      eventBus.publish("enrichment.complete", { transaction: tx }, {
        source: "enrichment-pipeline",
        correlationId: tx.correlationId,
      });
    }, { sync: true });
  }

  private enrich(tx: Transaction): void {
    this.enrichRequestBody(tx);
    this.enrichResponseBody(tx);
    this.enrichClientInfo(tx);
    this.enrichGeoInfo(tx);
  }

  private enrichRequestBody(tx: Transaction): void {
    if (!tx.request.bodyRaw) return;
    const processed = captureBody(tx.request.bodyRaw, { limit: 102400 });
    if (processed) {
      tx.request.bodyText = processed.text;
      tx.request.bodyHash = processed.hash;
      tx.request.bodyTruncated = processed.truncated;
      tx.request.bodySize = processed.size;
    }
    delete (tx.request as any).bodyRaw;
  }

  private enrichResponseBody(tx: Transaction): void {
    if (!tx.response?.bodyRaw) return;
    const processed = captureBody(tx.response.bodyRaw, { limit: 102400 });
    if (processed) {
      tx.response.bodyText = processed.text;
      tx.response.bodyHash = processed.hash;
      tx.response.bodyTruncated = processed.truncated;
    }
    delete (tx.response as any).bodyRaw;
  }

  private enrichClientInfo(tx: Transaction): void {
    if (!tx.request.userAgent) return;
    const parsed = parseUserAgent(tx.request.userAgent);
    tx.client = {
      ...parsed,
      userAgent: tx.request.userAgent,
      ipAddress: tx.request.clientIp,
    };
  }

  private enrichGeoInfo(tx: Transaction): void {
    if (!tx.request.clientIp) return;
    tx.geo = {
      ip: tx.request.clientIp,
    };
    const h = tx.request.headers;
    if (h) {
      if (h["cf-ipcountry"]) tx.geo.country = h["cf-ipcountry"];
      if (h["cf-ipcity"]) tx.geo.city = h["cf-ipcity"];
      if (h["cf-region"]) tx.geo.region = h["cf-region"];
      if (h["x-country"]) tx.geo.country = h["x-country"];
    }
  }
}
