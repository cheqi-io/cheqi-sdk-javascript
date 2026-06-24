import { DecryptionError } from "../errors.js";
import { ReceiptContextEnvelopeFromJSON } from "../models/generated/ReceiptContextEnvelope.js";
import { ReceiptEnvelopeFromJSON } from "../models/generated/ReceiptEnvelope.js";
import type {
  DecryptedReceipt,
  EncryptedReceipt,
  ReceiptContextEnvelope,
  ReceiptEnvelope
} from "../types.js";
import { DecryptionService } from "./decryption.js";

const CUSTOMER_PARTY_PLACEHOLDER = "<cac:AccountingCustomerParty/>";
const CUSTOMER_PARTY_CLOSING_TAG = "</cac:AccountingCustomerParty>";

/**
 * Decrypts an encrypted receipt and merges the receipt context (receiving party
 * and payment means) into both the UBL XML and CheqiReceipt formats.
 *
 * Mirrors the Java SDK `ReceiptProcessor` + `ReceiptMergeService`:
 *  - UBL XML: the `<cac:AccountingCustomerParty/>` placeholder is replaced with
 *    the `xmlReceivingParty` fragment.
 *  - UBL XML: `xmlPaymentMeans` is injected immediately after the
 *    AccountingCustomerParty element when present.
 *  - CheqiReceipt: the `receivingParty` is injected from the receipt context.
 */
export class ReceiptProcessor {
  constructor(private readonly decryptionService: DecryptionService) {}

  /**
   * Decrypt an encrypted receipt and return a fully merged {@link DecryptedReceipt}.
   * @param encryptedReceipt  The encrypted receipt payload.
   * @param privateKey        Base64-encoded PKCS#8 DER private key.
   */
  processEncryptedReceipt(encryptedReceipt: EncryptedReceipt, privateKey: string): DecryptedReceipt {
    const { receiptContent, customerDetails } = this.decryptionService.decryptReceipt(encryptedReceipt, privateKey);

    let receiptEnvelope: ReceiptEnvelope;
    try {
      receiptEnvelope = ReceiptEnvelopeFromJSON(JSON.parse(receiptContent));
    } catch (error) {
      throw new DecryptionError("Failed to deserialize decrypted receipt envelope", { cause: error });
    }

    let receiptContextEnvelope: ReceiptContextEnvelope | null = null;
    if (customerDetails && customerDetails.trim() !== "") {
      try {
        receiptContextEnvelope = ReceiptContextEnvelopeFromJSON(JSON.parse(customerDetails));
      } catch (error) {
        throw new DecryptionError("Failed to deserialize decrypted receipt context envelope", { cause: error });
      }
    }

    const decrypted: DecryptedReceipt = {
      receiptEnvelope,
      receiptContextEnvelope,
      rawReceiptJson: receiptContent,
      rawReceiptContextJson: customerDetails
    };

    this.merge(decrypted);
    return decrypted;
  }

  private merge(decrypted: DecryptedReceipt): void {
    const context = decrypted.receiptContextEnvelope;
    if (!context) {
      return;
    }

    this.mergeXmlParty(decrypted.receiptEnvelope, context);
    this.mergeXmlPaymentMeans(decrypted.receiptEnvelope, context);
    this.mergeReceivingParty(decrypted.receiptEnvelope, context);
  }

  private mergeXmlParty(receiptEnvelope: ReceiptEnvelope, context: ReceiptContextEnvelope): void {
    const xmlReceivingParty = context.receivingParty?.xmlReceivingParty;
    if (!xmlReceivingParty) {
      return;
    }

    receiptEnvelope.ublPurchaseReceipt = mergeXmlPayload(receiptEnvelope.ublPurchaseReceipt, xmlReceivingParty);
    receiptEnvelope.ublInvoice = mergeXmlPayload(receiptEnvelope.ublInvoice, xmlReceivingParty);
  }

  private mergeXmlPaymentMeans(receiptEnvelope: ReceiptEnvelope, context: ReceiptContextEnvelope): void {
    const xmlPaymentMeans = context.paymentMeans?.xmlPaymentMeans;
    if (!xmlPaymentMeans) {
      return;
    }

    receiptEnvelope.ublPurchaseReceipt = injectPaymentMeans(receiptEnvelope.ublPurchaseReceipt, xmlPaymentMeans);
    receiptEnvelope.ublInvoice = injectPaymentMeans(receiptEnvelope.ublInvoice, xmlPaymentMeans);
  }

  private mergeReceivingParty(receiptEnvelope: ReceiptEnvelope, context: ReceiptContextEnvelope): void {
    const receivingParty = context.receivingParty?.receivingParty;
    if (!receivingParty || !receiptEnvelope.cheqi) {
      return;
    }

    receiptEnvelope.cheqi = {
      ...receiptEnvelope.cheqi,
      receivingParty
    };
  }
}

function mergeXmlPayload(xml: string | undefined, xmlReceivingParty: string): string | undefined {
  if (xml == null) {
    return xml;
  }
  if (!xml.includes(CUSTOMER_PARTY_PLACEHOLDER)) {
    return xml;
  }
  return xml.replace(CUSTOMER_PARTY_PLACEHOLDER, xmlReceivingParty);
}

function injectPaymentMeans(xml: string | undefined, xmlPaymentMeans: string): string | undefined {
  if (xml == null) {
    return xml;
  }
  if (xml.includes(CUSTOMER_PARTY_CLOSING_TAG)) {
    return xml.replace(CUSTOMER_PARTY_CLOSING_TAG, CUSTOMER_PARTY_CLOSING_TAG + xmlPaymentMeans);
  }
  if (xml.includes(CUSTOMER_PARTY_PLACEHOLDER)) {
    return xml.replace(CUSTOMER_PARTY_PLACEHOLDER, CUSTOMER_PARTY_PLACEHOLDER + xmlPaymentMeans);
  }
  return xml;
}
