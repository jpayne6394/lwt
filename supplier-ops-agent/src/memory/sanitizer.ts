import type { SaveMemoryDocumentInput } from "./types.ts";

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;
const MAX_STORED_CONTENT_CHARS = 8000;

export function sanitizeMemoryDocumentInput(input: SaveMemoryDocumentInput): SaveMemoryDocumentInput {
  return {
    ...input,
    title: sanitizeText(input.title, 240),
    summary: sanitizeText(input.summary, 1000),
    content: sanitizeText(input.content, MAX_STORED_CONTENT_CHARS),
    metadata: sanitizeMetadata(input.metadata ?? {}),
    relatedProducts: sanitizeList(input.relatedProducts ?? []),
    relatedCollections: sanitizeList(input.relatedCollections ?? []),
    relatedCampaigns: sanitizeList(input.relatedCampaigns ?? []),
    evidenceLinks: sanitizeList(input.evidenceLinks ?? []),
    sensitivity: input.sensitivity ?? "internal",
  };
}

export function sanitizeText(value: string, maxChars = MAX_STORED_CONTENT_CHARS): string {
  const redacted = value
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(PHONE_PATTERN, "[redacted-phone]")
    .replace(/\s+/g, " ")
    .trim();

  if (redacted.length <= maxChars) {
    return redacted;
  }

  return `${redacted.slice(0, Math.max(0, maxChars - 14)).trimEnd()} [truncated]`;
}

function sanitizeList(values: string[]): string[] {
  return values.map((value) => sanitizeText(String(value), 500)).filter(Boolean);
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, sanitizeUnknown(value)]));
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeText(value, 1000);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeUnknown);
  }
  if (value && typeof value === "object") {
    return sanitizeMetadata(value as Record<string, unknown>);
  }
  return value;
}
