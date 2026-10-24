import { runIssuerFixture } from "./index.js";
import { EncryptionService, DecryptionService, sha256Hex, base64ToBytes, bytesToBase64 } from "@cheqi/sdk/crypto";
import { decryptDownloadEnvelope, parseDownloadUrl } from "@cheqi/sdk/download";

interface CryptoFixture {
  plaintext: string;
  publicKeyB64: string;
  publicKeyPkcs1B64: string;
  privateKeyB64: string;
  encrypted: { encryptedContent: string; encryptedAesKey: string };
}

const delivery = (encrypted: CryptoFixture["encrypted"]) => ({
  encryptedCreditNoteInitiationRequest: encrypted.encryptedContent,
  encryptedSymmetricKey: encrypted.encryptedAesKey
});

export async function runBrowserTests(fixture: CryptoFixture) {
  const { publicKeyB64: publicKey, privateKeyB64: privateKey } = fixture;
  const issuer = await runIssuerFixture(publicKey);
  const envelope = { cheqiReceiptId: "R-1", envelopeVersion: 1,
    receiptGeneratorVersion: "fixture", receiptUuid: "bd646ff8-8d36-4cc7-9c19-f70d201259bf", documents: {} };
  const encrypted = await new EncryptionService().encryptReceiptForRecipient(JSON.stringify(envelope),
    { id: "device", publicKey });
  const decrypted = await new DecryptionService().decryptReceipt({
    encryptedEnvelope: encrypted.encryptedContent, encryptedEnvelopeKey: encrypted.encryptedAesKey
  }, privateKey);
  const nativeCrypto = globalThis.crypto;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
  try {
    const crypto = { subtle: nativeCrypto.subtle, getRandomValues: nativeCrypto.getRandomValues.bind(nativeCrypto) };
    const encryption = new EncryptionService(crypto);
    const decryption = new DecryptionService(crypto);
    const legacyPlaintext = await decryption.decryptCreditNoteInitiation(delivery(fixture.encrypted), privateKey);
    const spki = await encryption.encryptForDevice(fixture.plaintext, { id: "device", publicKey });
    const pkcs1 = await encryption.encryptForDevice(fixture.plaintext,
      { id: "device", publicKey: fixture.publicKeyPkcs1B64 });
    const hash = await sha256Hex("abc", crypto);
    const injectedIssuer = await runIssuerFixture(publicKey, crypto);
    const fallback = await runIssuerFixture(publicKey, crypto, "DOWNLOAD_FALLBACK");
    const url = parseDownloadUrl(fallback.result.getDownloadUrl()!);
    const download = await decryptDownloadEnvelope(fallback.requests[1].body.ciphertext, url.contentKey, crypto);
    const bytes = base64ToBytes(spki.encryptedContent);
    bytes[bytes.length - 1] ^= 1;
    let tamperErrorCode;
    try { await decryption.decryptCreditNoteInitiation(delivery({ ...spki, encryptedContent: bytesToBase64(bytes) }), privateKey); }
    catch (error) { tamperErrorCode = (error as { errorCode?: string }).errorCode; }
    let missingCrypto;
    try { await new EncryptionService().encryptForDevice("{}", { id: "device", publicKey }); }
    catch (error) { const failure = error as { name: string; message: string; capability?: string };
      missingCrypto = { name: failure.name, message: failure.message, capability: failure.capability }; }
    return { issuer, envelope, decrypted, legacyPlaintext, spki, pkcs1, hash, injectedIssuer,
      fallback, download, downloadKey: url.contentKey, tamperErrorCode, missingCrypto };
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
}
