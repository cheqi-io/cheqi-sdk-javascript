import { canonicalizeJson } from "../rfc8785.js";
import { sha256Hex } from "../utils.js";
import { canonicalizeAndHashXml, canonicalizeXml } from "../xml.js";

export class VerificationService {
  calculateCheqiReceiptHash(cheqiReceipt: string | object): Promise<string> {
    return this.canonicalizeAndHashJson(cheqiReceipt);
  }

  canonicalizeCheqiReceipt(cheqiReceipt: string | object): string {
    return canonicalizeJson(cheqiReceipt);
  }

  canonicalizeAndHashJson(json: string | object): Promise<string> {
    return sha256Hex(canonicalizeJson(json));
  }

  async verifyJsonHash(json: string | object, expectedHash: string): Promise<boolean> {
    return await this.canonicalizeAndHashJson(json) === expectedHash;
  }

  calculateUblHash(xml: string): Promise<string> {
    return this.canonicalizeAndHashXml(xml);
  }

  canonicalizeUbl(xml: string): string {
    return canonicalizeXml(xml);
  }

  canonicalizeAndHashXml(xml: string): Promise<string> {
    return canonicalizeAndHashXml(xml);
  }

  async verifyXmlHash(xml: string, expectedHash: string): Promise<boolean> {
    return await this.canonicalizeAndHashXml(xml) === expectedHash;
  }
}
