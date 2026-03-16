import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes } from "node:crypto";
import { EncryptionError } from "../errors.js";
import type { EncryptedCreditNote, EncryptedReceiptRequestDto, Recipient } from "../types.js";
import { parseBase64Der } from "../utils.js";

const AES_KEY_LENGTH = 32;
const GCM_IV_LENGTH = 12;

function hybridEncrypt(plaintext: string, publicKeyBase64: string): { encryptedData: string; encryptedKey: string } {
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

export class EncryptionService {
  encryptReceiptForRecipient(receiptJson: string, recipient: Recipient): EncryptedReceiptRequestDto {
    try {
      const publicKey = recipient.publicKey ?? recipient.public_key ?? "";
      const { encryptedData, encryptedKey } = hybridEncrypt(receiptJson, publicKey);

      return {
        recipientId: recipient.id,
        receiverType: recipient.receiverType ?? recipient.receiver_type,
        publicKey,
        encryptedReceipt: encryptedData,
        encryptedSymmetricKey: encryptedKey
      };
    } catch (error) {
      throw new EncryptionError(`Failed to encrypt receipt for recipient: ${recipient.id ?? "unknown"}`, {
        cause: error
      });
    }
  }

  encryptCreditNoteForRecipient(creditNoteJson: string, recipient: Recipient): EncryptedCreditNote {
    try {
      const publicKey = recipient.publicKey ?? recipient.public_key ?? "";
      const { encryptedData, encryptedKey } = hybridEncrypt(creditNoteJson, publicKey);

      return {
        recipientId: recipient.id,
        receiverType: recipient.receiverType ?? recipient.receiver_type,
        publicKey,
        encryptedCreditNote: encryptedData,
        encryptedSymmetricKey: encryptedKey
      };
    } catch (error) {
      throw new EncryptionError(`Failed to encrypt credit note for recipient: ${recipient.id ?? "unknown"}`, {
        cause: error
      });
    }
  }
}
