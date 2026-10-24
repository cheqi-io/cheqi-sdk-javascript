/**
 * Client-generated, end-to-end-encrypted receipt download links
 * ("Download Link Contract v1" — the offline-first QR route).
 *
 * The download id and AES-256-GCM content key are generated locally, with no network,
 * so an integration can render the QR `<baseUrl>/<downloadId>#<contentKey>` even while
 * the Cheqi API is unreachable. Before exposing the URL, the integration is responsible
 * for retaining the original template request, download id, and content key so it can
 * finish issuance later. This SDK does not provide storage, scheduling, or background
 * retry behavior.
 *
 * The content key travels only in the URL fragment, which browsers never send to any
 * server: Cheqi stores ciphertext it can never decrypt, and decryption happens on the
 * customer's device.
 *
 * This module is separate from recipient-envelope decryption, but both paths
 * use Web Crypto and run in Node.js 20+ and modern browser runtimes.
 *
 * Framing matches the SDK's hybrid encryption: `base64(iv || ciphertext || tag)` in a
 * single opaque blob. The plaintext is a {@link ReceiptEnvelope} — the same envelope model
 * used for wallet delivery, so no separate download-route model exists.
 */

import { AES_KEY_LENGTH, GCM_IV_LENGTH, GCM_TAG_LENGTH } from "../crypto.js";
import { base64ToBytes as fromBase64, bytesToBase64 as toBase64 } from "../bytes.js";
import { CryptoUnavailableError, DecryptionError, EncryptionError } from "../errors.js";
import { cryptoOperation, randomBytes, requireSubtleCrypto, type CryptoProvider } from "../runtime-crypto.js";
import type { ReceiptEnvelope } from "../models/generated/ReceiptEnvelope.js";
import { ReceiptEnvelopeFromJSON, ReceiptEnvelopeToJSON } from "../models/generated/ReceiptEnvelope.js";

// Re-exported so browser-safe consumers can type envelopes without importing the SDK root.
export type { ReceiptEnvelope };
export type { CryptoProvider } from "../runtime-crypto.js";
export { CryptoUnavailableError } from "../errors.js";

/** Download id length in bytes (128 bits — the enumeration defense on the public endpoint). */
export const DOWNLOAD_ID_LENGTH = 16;

/** A freshly generated download link. The integration owns persistence and later processing. */
export interface DownloadLink {
  /** base64url (unpadded) download id; the only part of the link the server ever sees. */
  downloadId: string;
  /** base64url (unpadded) AES-256 content key; lives ONLY in the URL fragment. */
  contentKey: string;
  /** Full customer-facing URL: `<baseUrl>/<downloadId>#<contentKey>`. */
  url: string;
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  return fromBase64(value.replaceAll("-", "+").replaceAll("_", "/"));
}

async function importContentKey(contentKey: string, usage: "encrypt" | "decrypt", provider?: CryptoProvider): Promise<CryptoKey> {
  let keyBytes: Uint8Array;
  try {
    keyBytes = fromBase64Url(contentKey);
  } catch {
    throw new DecryptionError("Content key is not valid base64url");
  }
  if (keyBytes.length !== AES_KEY_LENGTH) {
    throw new DecryptionError(`Content key has invalid length: expected ${AES_KEY_LENGTH} bytes, got ${keyBytes.length}`);
  }
  const subtle = requireSubtleCrypto(provider, "importKey", usage);
  return cryptoOperation("AES-256-GCM key import", () =>
    subtle.importKey("raw", keyBytes as BufferSource, "AES-GCM", false, [usage]));
}

/**
 * Generates a fresh download link locally — no network involved. Use it after an online
 * `DOWNLOAD_FALLBACK` decision or when a Cheqi outage requires a deferred customer URL.
 * The integration must retain the request, id, and key before exposing the URL so it can
 * finish template generation, encryption, and upload later.
 */
export function generateDownloadLink(baseUrl: string, crypto?: CryptoProvider): DownloadLink {
  if (!baseUrl?.trim()) {
    throw new EncryptionError("baseUrl cannot be null or empty");
  }
  const receiptBaseUrl = receiptOrigin(baseUrl);
  const downloadId = toBase64Url(randomBytes(DOWNLOAD_ID_LENGTH, crypto));
  const contentKey = toBase64Url(randomBytes(AES_KEY_LENGTH, crypto));
  return { downloadId, contentKey, url: buildDownloadUrl(receiptBaseUrl, downloadId, contentKey) };
}

/** Builds the customer-facing URL. The content key MUST stay in the fragment. */
export function buildDownloadUrl(baseUrl: string, downloadId: string, contentKey: string): string {
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${trimmed}/${downloadId}#${contentKey}`;
}

/**
 * Splits a download URL (or a path + fragment) back into its parts, e.g. on the
 * download page: `parseDownloadUrl(location.href)`.
 */
export function parseDownloadUrl(url: string): { downloadId: string; contentKey: string } {
  const hashIndex = url.indexOf("#");
  if (hashIndex < 0) {
    throw new DecryptionError("Download URL has no #fragment content key");
  }
  const contentKey = url.slice(hashIndex + 1);
  const path = url.slice(0, hashIndex);
  const downloadId = path.slice(path.lastIndexOf("/") + 1);
  if (!downloadId || !contentKey) {
    throw new DecryptionError("Download URL is missing the download id or content key");
  }
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(downloadId)) {
    throw new DecryptionError("downloadId must be 22-64 base64url characters");
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(contentKey)) {
    throw new DecryptionError("contentKey must be an unpadded base64url AES-256 key");
  }
  return { downloadId, contentKey };
}

function receiptOrigin(baseUrl: string): string {
  if (baseUrl === "https://api.cheqi.io") return "https://receipt.cheqi.io";
  if (baseUrl === "https://sandbox.api.cheqi.io") return "https://sandbox.receipt.cheqi.io";
  if (baseUrl === "https://test.api.cheqi.io") return "https://test.receipt.cheqi.io";
  return baseUrl;
}

/**
 * Encrypts a receipt envelope with the content key. Returns `base64(iv || ciphertext || tag)` —
 * the exact bytes to upload as `ciphertext` to `POST /receipt/download`. Encrypt once and
 * persist the result: upload retries MUST resend identical bytes (the endpoint is
 * idempotent on them).
 */
export async function encryptDownloadEnvelope(envelope: ReceiptEnvelope, contentKey: string, crypto?: CryptoProvider): Promise<string> {
  const key = await importContentKey(contentKey, "encrypt", crypto);
  const iv = randomBytes(GCM_IV_LENGTH, crypto);
  // Normalize through FromJSON first so callers may pass either plain parsed JSON or
  // hydrated model objects. The round-trip also allow-lists the current envelope fields.
  const normalized = ReceiptEnvelopeToJSON(ReceiptEnvelopeFromJSON(envelope));
  const plaintext = new TextEncoder().encode(JSON.stringify(normalized));

  const encrypted = new Uint8Array(
    await cryptoOperation("AES-256-GCM encryption", () => requireSubtleCrypto(crypto, "encrypt")
      .encrypt({ name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 }, key, plaintext as BufferSource))
  );

  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv, 0);
  combined.set(encrypted, iv.length);
  return toBase64(combined);
}

/**
 * Decrypts a `base64(iv || ciphertext || tag)` blob (as served by
 * `GET /public/receipt/encrypted/{downloadId}`) with the content key from the URL fragment.
 * Throws {@link DecryptionError} when the key is wrong or the blob was tampered with.
 */
export async function decryptDownloadEnvelope(encryptedEnvelope: string, contentKey: string, crypto?: CryptoProvider): Promise<ReceiptEnvelope> {
  const key = await importContentKey(contentKey, "decrypt", crypto);

  let combined: Uint8Array;
  try {
    combined = fromBase64(encryptedEnvelope);
  } catch {
    throw new DecryptionError("Encrypted envelope is not valid base64");
  }
  const minLength = GCM_IV_LENGTH + GCM_TAG_LENGTH;
  if (combined.length < minLength) {
    throw new DecryptionError(`Encrypted envelope too short: expected at least ${minLength} bytes, got ${combined.length}`);
  }

  const iv = combined.subarray(0, GCM_IV_LENGTH);
  const ciphertextWithTag = combined.subarray(GCM_IV_LENGTH);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await cryptoOperation("AES-256-GCM decryption", () => requireSubtleCrypto(crypto, "decrypt").decrypt(
      { name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 },
      key,
      ciphertextWithTag as BufferSource
    ));
  } catch (error) {
    if (error instanceof CryptoUnavailableError) throw error;
    throw new DecryptionError("Failed to decrypt envelope: wrong content key or tampered ciphertext");
  }

  try {
    return ReceiptEnvelopeFromJSON(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch {
    throw new DecryptionError("Decrypted envelope is not valid JSON");
  }
}

/** Object-oriented facade matching the Java SDK's stateless DownloadService. */
export class DownloadService {
  constructor(private readonly crypto?: CryptoProvider) {}

  static readonly DOWNLOAD_ID_LENGTH = DOWNLOAD_ID_LENGTH;
  static readonly CONTENT_KEY_LENGTH = AES_KEY_LENGTH;
  static readonly PRODUCTION_BASE_URL = "https://receipt.cheqi.io";
  static readonly SANDBOX_BASE_URL = "https://sandbox.receipt.cheqi.io";

  generateDownloadLink(baseUrl: string): DownloadLink {
    return generateDownloadLink(baseUrl, this.crypto);
  }

  buildDownloadUrl(baseUrl: string, downloadId: string, contentKey: string): string {
    return buildDownloadUrl(baseUrl, downloadId, contentKey);
  }

  parseDownloadUrl(url: string): DownloadLink {
    return { ...parseDownloadUrl(url), url };
  }

  encryptDownloadEnvelope(envelope: ReceiptEnvelope, contentKey: string): Promise<string> {
    return encryptDownloadEnvelope(envelope, contentKey, this.crypto);
  }

  decryptDownloadEnvelope(ciphertext: string, contentKey: string): Promise<ReceiptEnvelope> {
    return decryptDownloadEnvelope(ciphertext, contentKey, this.crypto);
  }
}
