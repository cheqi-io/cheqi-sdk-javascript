import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes } from "node:crypto";
import { AES_KEY_LENGTH, GCM_IV_LENGTH } from "../crypto.js";
import { EncryptionError } from "../errors.js";
import type { EncryptedReceiptRequest, MatchedRecipient } from "../types.js";
import { parseBase64Der } from "../utils.js";

function hybridEncrypt(plaintext: string, publicKeyBase64: string): { encryptedData: string; encryptedKey: string } {
  if (!publicKeyBase64) {
    throw new EncryptionError("Public key is required for encryption");
  }

  const aesKey = randomBytes(AES_KEY_LENGTH);
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedData = Buffer.concat([iv, ciphertext, tag]).toString("base64");

  const publicKey = createPublicKey({
    key: parseBase64Der(publicKeyBase64),
    format: "der",
    type: "spki"
  });

  const encryptedKey = publicEncrypt(
    {
      key: publicKey,
      oaepHash: "sha256",
      padding: constants.RSA_PKCS1_OAEP_PADDING
    },
    aesKey
  ).toString("base64");

  return { encryptedData, encryptedKey };
}

/**
 * Performs hybrid RSA-OAEP + AES-256-GCM encryption of receipts and credit
 * notes for individual recipients.
 */
export class EncryptionService {
  /**
   * Encrypt a receipt JSON payload for a single recipient.
   * @param receiptJson   Serialised receipt envelope (JSON string).
   * @param recipient     Matched recipient with a public key.
   * @returns An {@link EncryptedReceiptRequest} ready to be sent to the API.
   */
  encryptReceiptForRecipient(receiptJson: string, recipient: MatchedRecipient): EncryptedReceiptRequest {
    if (!recipient) {
      throw new EncryptionError("Recipient is required for encryption");
    }

    try {
      const publicKey = recipient.publicKey ?? "";
      const { encryptedData, encryptedKey } = hybridEncrypt(receiptJson, publicKey);

      return {
        recipientId: recipient.id,
        publicKey,
        encryptedReceipt: encryptedData,
        encryptedSymmetricKey: encryptedKey
      };
    } catch (error) {
      if (error instanceof EncryptionError) throw error;
      throw new EncryptionError(`Failed to encrypt receipt for recipient: ${recipient.id ?? "unknown"}`, {
        cause: error
      });
    }
  }

  /**
   * Encrypt a credit-note JSON payload for a single recipient.
   * @param creditNoteJson  Serialised credit-note envelope (JSON string).
   * @param recipient       Matched recipient with a public key.
   */
  encryptCreditNoteForRecipient(creditNoteJson: string, recipient: MatchedRecipient): {
    recipientId?: string;
    publicKey: string;
    encryptedCreditNote: string;
    encryptedSymmetricKey: string;
  } {
    if (!recipient) {
      throw new EncryptionError("Recipient is required for encryption");
    }

    try {
      const publicKey = recipient.publicKey ?? "";
      const { encryptedData, encryptedKey } = hybridEncrypt(creditNoteJson, publicKey);

      return {
        recipientId: recipient.id,
        publicKey,
        encryptedCreditNote: encryptedData,
        encryptedSymmetricKey: encryptedKey
      };
    } catch (error) {
      if (error instanceof EncryptionError) throw error;
      throw new EncryptionError(`Failed to encrypt credit note for recipient: ${recipient.id ?? "unknown"}`, {
        cause: error
      });
    }
  }
}
