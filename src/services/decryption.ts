import { constants, createDecipheriv, createPrivateKey, privateDecrypt } from "node:crypto";
import { AES_KEY_LENGTH, GCM_IV_LENGTH, GCM_TAG_LENGTH } from "../crypto.js";
import { DecryptionError } from "../errors.js";
import { ReceiptEnvelopeFromJSON } from "../models/generated/ReceiptEnvelope.js";
import type {
  CreditNoteInitiationRequest,
  EncryptedCreditNoteInitiationRequest,
  EncryptedCreditNoteInitiationRequestResponse,
  EncryptedReceiptDeliveryResponse,
  ReceiptEnvelope,
  WebhookCreditNoteInitiationRequest,
  WebhookReceiptEnvelope
} from "../types.js";
import { decodeKey } from "../utils.js";

type ReceiptDelivery = EncryptedReceiptDeliveryResponse | WebhookReceiptEnvelope;
type CreditNoteInitiationDelivery =
  | EncryptedCreditNoteInitiationRequest
  | EncryptedCreditNoteInitiationRequestResponse
  | WebhookCreditNoteInitiationRequest;

function requireText(value: string | undefined, field: string): string {
  if (!value?.trim()) {
    throw new TypeError(`${field} cannot be null or empty`);
  }
  return value;
}

function rsaDecrypt(encryptedKeyBase64: string, privateKeyBase64: string): Buffer {
  requireText(encryptedKeyBase64, "encryptedKey");
  requireText(privateKeyBase64, "privateKeyBase64");

  const privateKey = createPrivateKey({
    key: decodeKey(privateKeyBase64),
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
    throw new DecryptionError(
      `Decrypted AES key has invalid length: expected ${AES_KEY_LENGTH} bytes, got ${decryptedKey.length}`
    );
  }
  return decryptedKey;
}

function aesDecrypt(encryptedDataBase64: string, aesKey: Buffer): string {
  requireText(encryptedDataBase64, "encryptedData");
  const combined = Buffer.from(encryptedDataBase64, "base64");
  const minLength = GCM_IV_LENGTH + GCM_TAG_LENGTH;
  if (combined.length < minLength) {
    throw new DecryptionError(
      `Encrypted data too short: expected at least ${minLength} bytes, got ${combined.length}`
    );
  }

  const iv = combined.subarray(0, GCM_IV_LENGTH);
  const ciphertext = combined.subarray(GCM_IV_LENGTH, combined.length - GCM_TAG_LENGTH);
  const tag = combined.subarray(combined.length - GCM_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", aesKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Decrypts complete recipient envelopes with the recipient's private key. */
export class DecryptionService {
  /** Accepts either a polling delivery or `data.encryptedReceipt` webhook envelope. */
  decryptReceipt(delivery: ReceiptDelivery, privateKeyBase64: string): ReceiptEnvelope {
    if (!delivery) {
      throw new TypeError("delivery cannot be null");
    }
    const encryptedEnvelope = requireText(delivery.encryptedEnvelope, "delivery.encryptedEnvelope");
    const encryptedEnvelopeKey = requireText(
      delivery.encryptedEnvelopeKey,
      "delivery.encryptedEnvelopeKey"
    );

    try {
      const plaintext = aesDecrypt(
        encryptedEnvelope,
        rsaDecrypt(encryptedEnvelopeKey, privateKeyBase64)
      );
      return ReceiptEnvelopeFromJSON(JSON.parse(plaintext));
    } catch (error) {
      throw new DecryptionError("Failed to decrypt receipt envelope", { cause: error });
    }
  }

  /** Decrypts a customer credit-note initiation payload without deserializing it. */
  decryptCreditNoteInitiation(
    request: CreditNoteInitiationDelivery,
    privateKeyBase64: string
  ): string {
    if (!request) {
      throw new TypeError("request cannot be null");
    }
    const encryptedRequest = requireText(
      request.encryptedCreditNoteInitiationRequest,
      "request.encryptedCreditNoteInitiationRequest"
    );
    const encryptedSymmetricKey = requireText(
      request.encryptedSymmetricKey,
      "request.encryptedSymmetricKey"
    );

    try {
      return aesDecrypt(
        encryptedRequest,
        rsaDecrypt(encryptedSymmetricKey, privateKeyBase64)
      );
    } catch (error) {
      throw new DecryptionError("Failed to decrypt credit-note initiation request", { cause: error });
    }
  }

  /** Decrypts, deserializes, and validates a customer return request. */
  decryptCreditNoteInitiationRequest(
    request: CreditNoteInitiationDelivery,
    privateKeyBase64: string
  ): CreditNoteInitiationRequest {
    const plaintext = this.decryptCreditNoteInitiation(request, privateKeyBase64);
    try {
      const parsed = JSON.parse(plaintext) as CreditNoteInitiationRequest;
      validateCreditNoteInitiationRequest(parsed);
      return parsed;
    } catch (error) {
      throw new DecryptionError("Failed to deserialize credit-note initiation request", {
        cause: error
      });
    }
  }
}

/** Validates the plaintext fields Cheqi cannot inspect in its zero-knowledge flow. */
export function validateCreditNoteInitiationRequest(request: CreditNoteInitiationRequest): void {
  requireRequiredText(request.cheqiReceiptId, "cheqiReceiptId");
  requireRequiredText(request.receiptId, "receiptId");
  if (request.customerNote != null && request.customerNote.length > 1000) {
    throw new TypeError("customerNote must be at most 1000 characters");
  }
  if (!request.lineItems?.length) {
    throw new TypeError("At least one return line item is required");
  }
  for (const lineItem of request.lineItems) {
    requireRequiredText(lineItem.productId, "lineItems.productId");
    if (lineItem.productId.length > 255) {
      throw new TypeError("lineItems.productId must be at most 255 characters");
    }
    if (lineItem.quantity == null || lineItem.quantity <= 0) {
      throw new TypeError("lineItems.quantity must be greater than zero");
    }
    if (!lineItem.reasonCode) {
      throw new TypeError("lineItems.reasonCode is required");
    }
    if (lineItem.reasonDescription != null && lineItem.reasonDescription.length > 1000) {
      throw new TypeError("lineItems.reasonDescription must be at most 1000 characters");
    }
  }
  if (!request.refundPreference) {
    throw new TypeError("refundPreference is required");
  }
  if (request.refundPreference === "BANK_TRANSFER") {
    if (!request.refundBankAccount) {
      throw new TypeError("refundBankAccount is required for BANK_TRANSFER");
    }
    requireRequiredText(request.refundBankAccount.iban, "refundBankAccount.iban");
    requireRequiredText(request.refundBankAccount.accountHolder, "refundBankAccount.accountHolder");
  } else if (request.refundBankAccount != null) {
    throw new TypeError("refundBankAccount is only allowed for BANK_TRANSFER");
  }
}

function requireRequiredText(value: string | undefined, field: string): asserts value is string {
  if (!value?.trim()) {
    throw new TypeError(`${field} is required`);
  }
}
