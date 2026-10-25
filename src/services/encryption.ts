import { bytesToArrayBuffer, bytesToBase64, concatBytes, utf8ToBytes } from "../bytes.js";
import { AES_KEY_LENGTH, GCM_IV_LENGTH } from "../crypto.js";
import { CryptoUnavailableError, EncryptionError } from "../errors.js";
import { cryptoOperation, randomBytes, requireSubtleCrypto, type CryptoProvider } from "../runtime-crypto.js";
import type { CryptoKeyHandle, SubtleCryptoProvider } from "../runtime-crypto.js";
import type { EncryptedReceiptPayload, MatchedRecipient } from "../types.js";
import { decodeKey } from "../utils.js";

// iOS SecKeyCopyExternalRepresentation supplies PKCS#1 rather than SPKI.
const RSA_ALGORITHM = Uint8Array.from([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
  0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);

function derLength(length: number): Uint8Array {
  if (length < 128) return Uint8Array.of(length);
  if (length < 256) return Uint8Array.of(0x81, length);
  return Uint8Array.of(0x82, length >> 8, length & 255);
}

function pkcs1ToSpki(pkcs1: Uint8Array): Uint8Array {
  const bitString = concatBytes(Uint8Array.of(0x03), derLength(pkcs1.length + 1), Uint8Array.of(0), pkcs1);
  const contents = concatBytes(RSA_ALGORITHM, bitString);
  return concatBytes(Uint8Array.of(0x30), derLength(contents.length), contents);
}

async function importPublicKey(value: string, subtle: SubtleCryptoProvider): Promise<CryptoKeyHandle> {
  const der = decodeKey(value);
  const algorithm = { name: "RSA-OAEP", hash: "SHA-256" };
  try {
    return await cryptoOperation("RSA-OAEP/SHA-256 public-key import", () =>
      subtle.importKey("spki", bytesToArrayBuffer(der), algorithm, false, ["encrypt"]));
  } catch (error) {
    if (error instanceof CryptoUnavailableError) throw error;
    return cryptoOperation("RSA-OAEP/SHA-256 public-key import", () =>
      subtle.importKey("spki", bytesToArrayBuffer(pkcs1ToSpki(der)), algorithm, false, ["encrypt"]));
  }
}

async function hybridEncrypt(plaintext: string, publicKeyBase64: string, provider?: CryptoProvider): Promise<{ encryptedData: string; encryptedKey: string }> {
  if (!publicKeyBase64) throw new EncryptionError("Public key is required for encryption");
  const subtle = requireSubtleCrypto(provider, "importKey", "encrypt");
  const aesKey = randomBytes(AES_KEY_LENGTH, provider);
  const iv = randomBytes(GCM_IV_LENGTH, provider);
  const key = await cryptoOperation("AES-256-GCM key import", () =>
    subtle.importKey("raw", bytesToArrayBuffer(aesKey), "AES-GCM", false, ["encrypt"]));
  // Web Crypto appends the 16-byte GCM tag, matching the existing iv|ciphertext|tag wire format.
  const ciphertextAndTag = new Uint8Array(await cryptoOperation("AES-256-GCM encryption", () =>
    subtle.encrypt({ name: "AES-GCM", iv: bytesToArrayBuffer(iv), tagLength: 128 }, key, bytesToArrayBuffer(utf8ToBytes(plaintext)))));
  const publicKey = await importPublicKey(publicKeyBase64, subtle);
  const wrappedKey = new Uint8Array(await cryptoOperation("RSA-OAEP/SHA-256 key wrapping", () =>
    subtle.encrypt({ name: "RSA-OAEP" }, publicKey, bytesToArrayBuffer(aesKey))));
  return { encryptedData: bytesToBase64(concatBytes(iv, ciphertextAndTag)), encryptedKey: bytesToBase64(wrappedKey) };
}

/** Hybrid RSA-OAEP/SHA-256 and AES-256-GCM encryption for recipient devices. */
export class EncryptionService {
  constructor(private readonly crypto?: CryptoProvider) {}

  async encryptForDevice(plaintextJson: string, recipient: MatchedRecipient): Promise<EncryptedReceiptPayload> {
    if (!recipient) throw new EncryptionError("recipient cannot be null");
    if (!recipient.id?.trim()) throw new EncryptionError("recipient.id cannot be null or empty");
    if (!recipient.publicKey?.trim()) throw new EncryptionError("recipient.publicKey cannot be null or empty");
    if (!plaintextJson?.trim()) throw new EncryptionError("plaintextJson cannot be null or empty");
    try {
      const { encryptedData, encryptedKey } = await hybridEncrypt(plaintextJson, recipient.publicKey, this.crypto);
      return { deviceRecipientId: recipient.id, encryptedContent: encryptedData, encryptedAesKey: encryptedKey };
    } catch (error) {
      if (error instanceof EncryptionError || error instanceof CryptoUnavailableError) throw error;
      throw new EncryptionError(`Failed to encrypt payload for temporary recipient ${recipient.id}`, { cause: error });
    }
  }

  encryptReceiptForRecipient(receiptJson: string, recipient: MatchedRecipient): Promise<EncryptedReceiptPayload> {
    return this.encryptForDevice(receiptJson, recipient);
  }

  encryptCreditNoteForRecipient(creditNoteJson: string, recipient: MatchedRecipient): Promise<EncryptedReceiptPayload> {
    return this.encryptForDevice(creditNoteJson, recipient);
  }
}
