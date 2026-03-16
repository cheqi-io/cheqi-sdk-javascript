import { canonicalizeJson } from "../rfc8785.js";
import { sha256Hex } from "../utils.js";
import { canonicalizeAndHashXml, canonicalizeXml } from "../xml.js";

export class VerificationService {
  calculateCheqiReceiptHash(cheqiReceipt: string | object): string {
    return this.canonicalizeAndHashJson(cheqiReceipt);
  }

  canonicalizeCheqiReceipt(cheqiReceipt: string | object): string {
    return canonicalizeJson(cheqiReceipt);
  }

  canonicalizeAndHashJson(json: string | object): string {
    return sha256Hex(canonicalizeJson(json));
  }

  verifyJsonHash(json: string | object, expectedHash: string): boolean {
    return this.canonicalizeAndHashJson(json) === expectedHash;
  }

  calculateUblXmlHash(xml: string): string {
    return this.canonicalizeAndHashXml(xml);
  }

  canonicalizeUblXml(xml: string): string {
    return canonicalizeXml(xml);
  }

  canonicalizeAndHashXml(xml: string): string {
    return canonicalizeAndHashXml(xml);
  }

  verifyXmlHash(xml: string, expectedHash: string): boolean {
    return this.canonicalizeAndHashXml(xml) === expectedHash;
  }
}
