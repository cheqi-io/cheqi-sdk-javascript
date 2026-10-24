import { base64ToBytes, bytesToArrayBuffer, bytesToUtf8, utf8ToBytes } from "./bytes.js";
import { cryptoOperation, requireSubtleCrypto, type CryptoProvider } from "./runtime-crypto.js";

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

/** Basic email format check: local@domain with at least one dot in domain. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function sha256Hex(value: string, crypto?: CryptoProvider): Promise<string> {
  const subtle = requireSubtleCrypto(crypto, "digest");
  const digest = new Uint8Array(await cryptoOperation("SHA-256 hashing", () =>
    subtle.digest("SHA-256", bytesToArrayBuffer(utf8ToBytes(value)))));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
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

/**
 * Decode a key string into raw DER bytes.
 *
 * Accepts:
 *  - raw base64-encoded DER (the common case),
 *  - PEM-wrapped keys (`-----BEGIN ... KEY-----`), and
 *  - base64-encoded PEM (a PEM document that was itself base64-encoded).
 *
 * Mirrors the Java SDK `PemUtils.decodeKey` so both PEM-wrapped and raw base64
 * keys are accepted interchangeably.
 */
export function decodeKey(keyString: string): Uint8Array {
  // If the input doesn't contain PEM headers, it may be base64-encoded PEM.
  if (!keyString.includes("-----BEGIN")) {
    try {
      const decoded = bytesToUtf8(base64ToBytes(keyString));
      if (decoded.includes("-----BEGIN")) {
        return decodeKey(decoded);
      }
    } catch {
      // Not base64-encoded PEM — fall through to plain base64 handling.
    }
  }

  const cleanKey = keyString
    .replace(/-+BEGIN [A-Z ]+KEY-+/g, "")
    .replace(/-+END [A-Z ]+KEY-+/g, "")
    .replace(/\s+/g, "");
  return base64ToBytes(cleanKey);
}

/** @deprecated Use {@link decodeKey}, which also handles PEM-wrapped keys. */
export function parseBase64Der(base64: string): Uint8Array {
  return decodeKey(base64);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
