import { createHash } from "node:crypto";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function coalesceString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (isNonEmptyString(value)) {
      return value;
    }
  }
  return undefined;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function toCamelCase(value: string): string {
  return value.replace(/[_-]([a-z])/g, (_, character: string) => character.toUpperCase());
}

export function normalizeValue<T>(value: T): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }
  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, innerValue] of Object.entries(value)) {
    if (innerValue === undefined || innerValue === null) {
      continue;
    }
    normalized[toCamelCase(key)] = normalizeValue(innerValue);
  }
  return normalized;
}

export function serializeJson<T>(value: T): string {
  return JSON.stringify(normalizeValue(value));
}

export function parseBase64Der(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
