import { constants, createDecipheriv, createPrivateKey, privateDecrypt } from "node:crypto";
import { DecryptionError } from "../errors.js";
import type { EncryptedCreditNoteInitiationRequest, EncryptedReceipt } from "../types.js";
import { parseBase64Der } from "../utils.js";

const AES_KEY_LENGTH = 32;
const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

function rsaDecrypt(encryptedKeyBase64: string, privateKeyBase64: string): Buffer {
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
    throw new DecryptionError(`Decrypted AES key is not ${AES_KEY_LENGTH} bytes: ${decryptedKey.length}`);
  }

  return decryptedKey;
}

function aesDecrypt(encryptedDataBase64: string, aesKey: Buffer): string {
  const combined = Buffer.from(encryptedDataBase64, "base64");
  const iv = combined.subarray(0, GCM_IV_LENGTH);
  const ciphertext = combined.subarray(GCM_IV_LENGTH, combined.length - GCM_TAG_LENGTH);
  const tag = combined.subarray(combined.length - GCM_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export class DecryptionService {
  decryptReceipt(encryptedReceipt: EncryptedReceipt, privateKeyBase64: string): {
    receiptContent: string;
    customerDetails: string | null;
  } {
    try {
      const encryptedKey = (encryptedReceipt.encryptedSymmetricKey ?? encryptedReceipt.encrypted_symmetric_key) ?? "";
      const encryptedPayload = (encryptedReceipt.encryptedReceipt ?? encryptedReceipt.encrypted_receipt) ?? "";
      const receiptKey = rsaDecrypt(encryptedKey, privateKeyBase64);
      const receiptContent = aesDecrypt(encryptedPayload, receiptKey);

      let customerDetails: string | null = null;
      const encryptedCustomerDetails = encryptedReceipt.encryptedCustomerDetails ?? encryptedReceipt.encrypted_customer_details;
      const encryptedCustomerAesKey = encryptedReceipt.encryptedCustomerAesKey ?? encryptedReceipt.encrypted_customer_aes_key;
      if (encryptedCustomerDetails && encryptedCustomerAesKey) {
        const customerKey = rsaDecrypt(encryptedCustomerAesKey, privateKeyBase64);
        customerDetails = aesDecrypt(encryptedCustomerDetails, customerKey);
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

  decryptCreditNote(
    encryptedCreditNote: EncryptedCreditNoteInitiationRequest,
    privateKeyBase64: string
  ): { content: string } {
    try {
      const encryptedKey = encryptedCreditNote.encryptedSymmetricKey ??
        encryptedCreditNote.encrypted_symmetric_key ??
        "";
      const encryptedPayload =
        encryptedCreditNote.encryptedCreditNoteInitiationRequest ??
        encryptedCreditNote.encrypted_credit_note_initiation_request ??
        encryptedCreditNote.encryptedCreditNote ??
        encryptedCreditNote.encrypted_credit_note ??
        "";

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
}
