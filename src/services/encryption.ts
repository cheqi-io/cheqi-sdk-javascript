import { bytesToArrayBuffer, bytesToBase64, concatBytes, utf8ToBytes } from "../bytes.js";
import { AES_KEY_LENGTH, GCM_IV_LENGTH } from "../crypto.js";
import { EncryptionError } from "../errors.js";
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

async function importPublicKey(value: string): Promise<CryptoKey> {
  const der = decodeKey(value);
  const algorithm = { name: "RSA-OAEP", hash: "SHA-256" };
  try {
    return await crypto.subtle.importKey("spki", bytesToArrayBuffer(der), algorithm, false, ["encrypt"]);
  } catch {
    return crypto.subtle.importKey("spki", bytesToArrayBuffer(pkcs1ToSpki(der)), algorithm, false, ["encrypt"]);
  }
}

async function hybridEncrypt(plaintext: string, publicKeyBase64: string): Promise<{ encryptedData: string; encryptedKey: string }> {
  if (!publicKeyBase64) throw new EncryptionError("Public key is required for encryption");
  const aesKey = crypto.getRandomValues(new Uint8Array(AES_KEY_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH));
  const key = await crypto.subtle.importKey("raw", bytesToArrayBuffer(aesKey), "AES-GCM", false, ["encrypt"]);
  // Web Crypto appends the 16-byte GCM tag, matching the existing iv|ciphertext|tag wire format.
  const ciphertextAndTag = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bytesToArrayBuffer(iv) }, key, bytesToArrayBuffer(utf8ToBytes(plaintext))));
  const publicKey = await importPublicKey(publicKeyBase64);
  const wrappedKey = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, bytesToArrayBuffer(aesKey)));
  return { encryptedData: bytesToBase64(concatBytes(iv, ciphertextAndTag)), encryptedKey: bytesToBase64(wrappedKey) };
}

/** Hybrid RSA-OAEP/SHA-256 and AES-256-GCM encryption for recipient devices. */
export class EncryptionService {
  async encryptForDevice(plaintextJson: string, recipient: MatchedRecipient): Promise<EncryptedReceiptPayload> {
    if (!recipient) throw new EncryptionError("recipient cannot be null");
    if (!recipient.id?.trim()) throw new EncryptionError("recipient.id cannot be null or empty");
    if (!recipient.publicKey?.trim()) throw new EncryptionError("recipient.publicKey cannot be null or empty");
    if (!plaintextJson?.trim()) throw new EncryptionError("plaintextJson cannot be null or empty");
    try {
      const { encryptedData, encryptedKey } = await hybridEncrypt(plaintextJson, recipient.publicKey);
      return { deviceRecipientId: recipient.id, encryptedContent: encryptedData, encryptedAesKey: encryptedKey };
    } catch (error) {
      if (error instanceof EncryptionError) throw error;
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
