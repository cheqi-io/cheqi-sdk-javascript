import { CryptoUnavailableError } from "./errors.js";

/** An opaque key returned by and passed back to the configured provider. */
export type CryptoKeyHandle = object;

export interface CryptoAlgorithm {
  name: string;
  hash?: string | { name: string };
  iv?: ArrayBuffer;
  tagLength?: number;
}

/** The Web Crypto methods used by the SDK; no DOM type declarations are required. */
export interface SubtleCryptoProvider {
  importKey(format: "raw" | "spki" | "pkcs8", data: ArrayBuffer, algorithm: string | CryptoAlgorithm,
    extractable: boolean, usages: Array<"encrypt" | "decrypt">): Promise<CryptoKeyHandle>;
  encrypt(algorithm: string | CryptoAlgorithm, key: CryptoKeyHandle, data: ArrayBuffer): Promise<ArrayBuffer>;
  decrypt(algorithm: string | CryptoAlgorithm, key: CryptoKeyHandle, data: ArrayBuffer): Promise<ArrayBuffer>;
  digest(algorithm: string | CryptoAlgorithm, data: ArrayBuffer): Promise<ArrayBuffer>;
}

export interface CryptoProvider {
  readonly subtle: SubtleCryptoProvider;
  getRandomValues(array: Uint8Array): Uint8Array;
}

export function requireSubtleCrypto(provider: CryptoProvider | undefined,
  ...methods: Array<keyof SubtleCryptoProvider>): SubtleCryptoProvider {
  try {
    const subtle = (provider ?? globalThis.crypto)?.subtle;
    if (!subtle) throw new CryptoUnavailableError("crypto.subtle");
    for (const method of methods) {
      if (typeof subtle[method] !== "function") {
        throw new CryptoUnavailableError(`crypto.subtle.${method}()`);
      }
    }
    return subtle;
  } catch (error) {
    if (error instanceof CryptoUnavailableError) throw error;
    throw new CryptoUnavailableError("crypto.subtle", { cause: error });
  }
}

/** Identify unavailable algorithms without confusing invalid keys or tampering with support. */
export async function cryptoOperation<T>(capability: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error !== null && typeof error === "object" && "name" in error &&
      (error.name === "NotSupportedError" || error.name === "SecurityError")) {
      throw new CryptoUnavailableError(capability, { cause: error });
    }
    throw error;
  }
}

export function randomBytes(length: number, provider?: CryptoProvider): Uint8Array {
  try {
    const cryptoApi = provider ?? globalThis.crypto;
    if (typeof cryptoApi?.getRandomValues !== "function") {
      throw new CryptoUnavailableError("crypto.getRandomValues()");
    }
    const bytes = new Uint8Array(length);
    cryptoApi.getRandomValues(bytes);
    return bytes;
  } catch (error) {
    if (error instanceof CryptoUnavailableError) throw error;
    throw new CryptoUnavailableError("crypto.getRandomValues()", { cause: error });
  }
}

/** RFC 9562 UUIDv4, using the same injected CSPRNG as keys and IVs. */
export function randomUuid(provider?: CryptoProvider): string {
  const bytes = randomBytes(16, provider);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
