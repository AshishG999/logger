import { randomUUID } from "node:crypto";

export function generateId(): string {
  return randomUUID();
}

export function generateTraceId(): string {
  return `tr-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function generateCorrelationId(): string {
  return `cr-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function generateRequestId(): string {
  return `rq-${randomUUID().replace(/-/g, "").slice(0, 18)}`;
}
