import { constants, createDecipheriv, createPrivateKey, privateDecrypt } from "node:crypto";
import { AES_KEY_LENGTH, GCM_IV_LENGTH, GCM_TAG_LENGTH } from "../crypto.js";
import { DecryptionError } from "../errors.js";
import { CreditNoteContextEnvelopeFromJSON } from "../models/generated/CreditNoteContextEnvelope.js";
import type {
  CreditNoteEnvelope,
  DecryptedDeliveredCreditNote,
  EncryptedCreditNote,
  EncryptedCreditNoteInitiationRequest,
  EncryptedReceipt
} from "../types.js";
import { parseBase64Der } from "../utils.js";

function rsaDecrypt(encryptedKeyBase64: string, privateKeyBase64: string): Buffer {
  if (!encryptedKeyBase64) {
    throw new DecryptionError("Encrypted key cannot be empty");
  }
  if (!privateKeyBase64) {
    throw new DecryptionError("Private key is required for decryption");
  }

  const privateKey = createPrivateKey({
    key: parseBase64Der(privateKeyBase64),
    format: "der",
    type: "pkcs8"
  });

  const decryptedKey = privateDecrypt(
    {
      key: privateKey,
      oaepHash: "sha256",
      padding: constants.RSA_PKCS1_OAEP_PADDING
    },
    Buffer.from(encryptedKeyBase64, "base64")
  );

  if (decryptedKey.length !== AES_KEY_LENGTH) {
    throw new DecryptionError(`Decrypted AES key has invalid length: expected ${AES_KEY_LENGTH} bytes, got ${decryptedKey.length}`);
  }

  return decryptedKey;
}

function aesDecrypt(encryptedDataBase64: string, aesKey: Buffer): string {
  if (!encryptedDataBase64) {
    throw new DecryptionError("Encrypted data cannot be empty");
  }

  const combined = Buffer.from(encryptedDataBase64, "base64");
  const minLength = GCM_IV_LENGTH + GCM_TAG_LENGTH;
  if (combined.length < minLength) {
    throw new DecryptionError(`Encrypted data too short: expected at least ${minLength} bytes, got ${combined.length}`);
  }

  const iv = combined.subarray(0, GCM_IV_LENGTH);
  const ciphertext = combined.subarray(GCM_IV_LENGTH, combined.length - GCM_TAG_LENGTH);
  const tag = combined.subarray(combined.length - GCM_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Decrypts encrypted receipts and credit-note initiation requests using
 * the seller's RSA private key.
 */
export class DecryptionService {
  /**
   * Decrypt an encrypted receipt payload.
   * @param encryptedReceipt  The encrypted receipt from the Cheqi backend.
   * @param privateKeyBase64  Base64-encoded PKCS#8 DER private key.
   * @returns The decrypted receipt content and optional customer details.
   */
  decryptReceipt(encryptedReceipt: EncryptedReceipt, privateKeyBase64: string): {
    receiptContent: string;
    customerDetails: string | null;
  } {
    if (!encryptedReceipt) {
      throw new DecryptionError("Encrypted receipt cannot be null");
    }

    try {
      const encryptedKey = encryptedReceipt.encryptedSymmetricKey ?? "";
      const encryptedPayload = encryptedReceipt.encryptedReceipt ?? "";
      const receiptKey = rsaDecrypt(encryptedKey, privateKeyBase64);
      const receiptContent = aesDecrypt(encryptedPayload, receiptKey);

      let customerDetails: string | null = null;
      if (encryptedReceipt.encryptedCustomerDetails && encryptedReceipt.encryptedCustomerAesKey) {
        const customerKey = rsaDecrypt(encryptedReceipt.encryptedCustomerAesKey, privateKeyBase64);
        customerDetails = aesDecrypt(encryptedReceipt.encryptedCustomerDetails, customerKey);
      }

      return { receiptContent, customerDetails };
    } catch (error) {
      if (error instanceof DecryptionError) {
        throw error;
      }
      throw new DecryptionError(`Failed to decrypt receipt: ${String((error as Error).message)}`, {
        cause: error
      });
    }
  }

  /**
   * Decrypt an encrypted credit-note initiation request.
   * @param encryptedCreditNote  The encrypted credit-note from a webhook.
   * @param privateKeyBase64     Base64-encoded PKCS#8 DER private key.
   * @returns The decrypted credit-note content.
   */
  decryptCreditNote(
    encryptedCreditNote: EncryptedCreditNoteInitiationRequest,
    privateKeyBase64: string
  ): { content: string } {
    if (!encryptedCreditNote) {
      throw new DecryptionError("Encrypted credit note cannot be null");
    }

    try {
      const encryptedKey = encryptedCreditNote.encryptedSymmetricKey ?? "";
      const encryptedPayload = encryptedCreditNote.encryptedCreditNoteInitiationRequest ?? "";

      const aesKey = rsaDecrypt(encryptedKey, privateKeyBase64);
      return {
        content: aesDecrypt(encryptedPayload, aesKey)
      };
    } catch (error) {
      if (error instanceof DecryptionError) {
        throw error;
      }
      throw new DecryptionError(`Failed to decrypt credit note: ${String((error as Error).message)}`, {
        cause: error
      });
    }
  }

  /**
   * Decrypt an encrypted delivered credit-note payload and optional credit-note context.
   * @param encryptedCreditNote  The encrypted delivered credit-note payload from the backend.
   * @param privateKeyBase64     Base64-encoded PKCS#8 DER private key.
   * @returns The decrypted credit-note envelope and optional context envelope.
   */
  decryptDeliveredCreditNote(
    encryptedCreditNote: EncryptedCreditNote,
    privateKeyBase64: string
  ): DecryptedDeliveredCreditNote {
    if (!encryptedCreditNote) {
      throw new DecryptionError("Encrypted credit note cannot be null");
    }

    try {
      const payloadKey = rsaDecrypt(encryptedCreditNote.encryptedSymmetricKey ?? "", privateKeyBase64);
      const rawJson = aesDecrypt(encryptedCreditNote.encryptedCreditNote ?? "", payloadKey);
      const creditNoteEnvelope = JSON.parse(rawJson) as CreditNoteEnvelope;

      let creditNoteContextEnvelope = null;
      let rawCreditNoteContextJson: string | null = null;

      if (encryptedCreditNote.encryptedCustomerDetails && encryptedCreditNote.encryptedCustomerAesKey) {
        const contextKey = rsaDecrypt(encryptedCreditNote.encryptedCustomerAesKey, privateKeyBase64);
        rawCreditNoteContextJson = aesDecrypt(encryptedCreditNote.encryptedCustomerDetails, contextKey);
        creditNoteContextEnvelope = CreditNoteContextEnvelopeFromJSON(JSON.parse(rawCreditNoteContextJson));
      }

      return {
        creditNoteEnvelope,
        creditNoteContextEnvelope,
        rawJson,
        rawCreditNoteContextJson
      };
    } catch (error) {
      if (error instanceof DecryptionError) {
        throw error;
      }
      throw new DecryptionError(`Failed to decrypt delivered credit note: ${String((error as Error).message)}`, {
        cause: error
      });
    }
  }
}
