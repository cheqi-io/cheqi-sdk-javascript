import { base64ToBytes, bytesToArrayBuffer, bytesToUtf8 } from "../bytes.js";
import { AES_KEY_LENGTH, GCM_IV_LENGTH, GCM_TAG_LENGTH } from "../crypto.js";
import { DecryptionError } from "../errors.js";
import { ReceiptEnvelopeFromJSON } from "../models/generated/ReceiptEnvelope.js";
import { instanceOfRefundPreference } from "../models/generated/RefundPreference.js";
import { instanceOfReturnReasonCode } from "../models/generated/ReturnReasonCode.js";
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

async function rsaDecrypt(encryptedKeyBase64: string, privateKeyBase64: string): Promise<Uint8Array> {
  requireText(encryptedKeyBase64, "encryptedKey");
  requireText(privateKeyBase64, "privateKeyBase64");

  const privateKey = await crypto.subtle.importKey("pkcs8", bytesToArrayBuffer(decodeKey(privateKeyBase64)),
    { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  const decryptedKey = new Uint8Array(await crypto.subtle.decrypt(
    { name: "RSA-OAEP" }, privateKey, bytesToArrayBuffer(base64ToBytes(encryptedKeyBase64))));

  if (decryptedKey.length !== AES_KEY_LENGTH) {
    throw new DecryptionError(
      `Decrypted AES key has invalid length: expected ${AES_KEY_LENGTH} bytes, got ${decryptedKey.length}`
    );
  }
  return decryptedKey;
}

async function aesDecrypt(encryptedDataBase64: string, aesKey: Uint8Array): Promise<string> {
  requireText(encryptedDataBase64, "encryptedData");
  const combined = base64ToBytes(encryptedDataBase64);
  const minLength = GCM_IV_LENGTH + GCM_TAG_LENGTH;
  if (combined.length < minLength) {
    throw new DecryptionError(
      `Encrypted data too short: expected at least ${minLength} bytes, got ${combined.length}`
    );
  }

  const iv = combined.subarray(0, GCM_IV_LENGTH);
  const key = await crypto.subtle.importKey("raw", bytesToArrayBuffer(aesKey), "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytesToArrayBuffer(iv) }, key,
    bytesToArrayBuffer(combined.subarray(GCM_IV_LENGTH)));
  return bytesToUtf8(new Uint8Array(plaintext));
}

/** Decrypts complete recipient envelopes with the recipient's private key. */
export class DecryptionService {
  /** Accepts either a polling delivery or `data.encryptedReceipt` webhook envelope. */
  async decryptReceipt(delivery: ReceiptDelivery, privateKeyBase64: string): Promise<ReceiptEnvelope> {
    if (!delivery) {
      throw new TypeError("delivery cannot be null");
    }
    const encryptedEnvelope = requireText(delivery.encryptedEnvelope, "delivery.encryptedEnvelope");
    const encryptedEnvelopeKey = requireText(
      delivery.encryptedEnvelopeKey,
      "delivery.encryptedEnvelopeKey"
    );

    try {
      const plaintext = await aesDecrypt(
        encryptedEnvelope,
        await rsaDecrypt(encryptedEnvelopeKey, privateKeyBase64)
      );
      return ReceiptEnvelopeFromJSON(JSON.parse(plaintext));
    } catch (error) {
      throw new DecryptionError("Failed to decrypt receipt envelope", { cause: error });
    }
  }

  /** Decrypts a customer credit-note initiation payload without deserializing it. */
  async decryptCreditNoteInitiation(
    request: CreditNoteInitiationDelivery,
    privateKeyBase64: string
  ): Promise<string> {
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
      return await aesDecrypt(
        encryptedRequest,
        await rsaDecrypt(encryptedSymmetricKey, privateKeyBase64)
      );
    } catch (error) {
      throw new DecryptionError("Failed to decrypt credit-note initiation request", { cause: error });
    }
  }

  /** Decrypts, deserializes, and validates a customer return request. */
  async decryptCreditNoteInitiationRequest(
    request: CreditNoteInitiationDelivery,
    privateKeyBase64: string
  ): Promise<CreditNoteInitiationRequest> {
    const plaintext = await this.decryptCreditNoteInitiation(request, privateKeyBase64);
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
    if (lineItem.quantity == null || !Number.isFinite(lineItem.quantity) || lineItem.quantity <= 0) {
      throw new TypeError("lineItems.quantity must be greater than zero");
    }
    if (!instanceOfReturnReasonCode(lineItem.reasonCode)) {
      throw new TypeError("lineItems.reasonCode is invalid");
    }
    if (lineItem.reasonDescription != null && lineItem.reasonDescription.length > 1000) {
      throw new TypeError("lineItems.reasonDescription must be at most 1000 characters");
    }
  }
  if (!instanceOfRefundPreference(request.refundPreference)) {
    throw new TypeError("refundPreference is invalid");
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
