import { createHash } from "node:crypto";

const DEFAULT_LIMIT = 64 * 1024; // 64 KB
const PREVIEW_SIZE = 1024; // 1 KB preview

export interface CapturedBody {
  text?: string;
  hash?: string;
  truncated: boolean;
  size: number;
  preview?: string;
}

export function captureBody(raw: unknown, options?: { limit?: number }): CapturedBody | undefined {
  if (raw === undefined || raw === null) return undefined;

  const limit = options?.limit ?? DEFAULT_LIMIT;
  let text: string;

  if (typeof raw === "string") {
    text = raw;
  } else if (Buffer.isBuffer(raw)) {
    text = raw.toString("utf-8");
  } else if (typeof raw === "object") {
    try {
      text = JSON.stringify(raw);
    } catch {
      return { size: 0, truncated: false };
    }
  } else {
    text = String(raw);
  }

  const size = Buffer.byteLength(text, "utf-8");

  if (size > limit) {
    const preview = text.slice(0, PREVIEW_SIZE);
    const hash = createHash("sha256").update(preview).digest("hex");
    return {
      hash,
      truncated: true,
      size,
      preview,
    };
  }

  const hash = createHash("sha256").update(text).digest("hex");

  return {
    text,
    hash,
    truncated: false,
    size,
  };
}
