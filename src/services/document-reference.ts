import { bytesToBase64 } from "../bytes.js";
import { sha256Hex } from "../utils.js";
import { cryptoOperation, requireSubtleCrypto, type CryptoProvider } from "../runtime-crypto.js";
import type { ReceiptEnvelope } from "../types.js";

/** An exact issuer-scoped routing identifier, not encryption. */
export async function documentReferenceHash(documentNumber: string, crypto?: CryptoProvider): Promise<string> {
  if (typeof documentNumber !== "string" || !documentNumber.trim()) throw new TypeError("documentNumber is required");
  return sha256Hex("cheqi:issuer-document:v1:" + documentNumber, crypto);
}

export async function addDownloadRecipient(envelope: ReceiptEnvelope, crypto?: CryptoProvider): Promise<string> {
  const subtle = requireSubtleCrypto(crypto, "generateKey", "exportKey");
  const keys = await cryptoOperation("RSA-OAEP receiving key generation", () => subtle.generateKey!({
    name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256"
  }, true, ["encrypt", "decrypt"]));
  const privateKey = bytesToBase64(new Uint8Array(await subtle.exportKey!("pkcs8", keys.privateKey)));
  envelope.documents!.DOWNLOAD_RECIPIENT_KEY = { mediaType: "application/json",
    content: JSON.stringify({ algorithm: "RSA-OAEP-256", privateKey }) };
  return bytesToBase64(new Uint8Array(await subtle.exportKey!("spki", keys.publicKey)));
}
