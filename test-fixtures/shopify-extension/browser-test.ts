import { runIssuerFixture } from "./index.js";
import { EncryptionService, DecryptionService } from "@cheqi/sdk/crypto";
import { runPosCryptoCheck } from "./device-check.js";

export async function runBrowserTests(publicKey: string, privateKey: string) {
  const issuer = await runIssuerFixture(publicKey);
  const envelope = { cheqiReceiptId: "R-1", envelopeVersion: 1,
    receiptGeneratorVersion: "fixture", receiptUuid: crypto.randomUUID(), documents: {} };
  const encrypted = await new EncryptionService().encryptReceiptForRecipient(JSON.stringify(envelope),
    { id: "device", publicKey });
  const decrypted = await new DecryptionService().decryptReceipt({
    encryptedEnvelope: encrypted.encryptedContent, encryptedEnvelopeKey: encrypted.encryptedAesKey
  }, privateKey);
  const nativeCrypto = globalThis.crypto;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
  try {
    const diagnostics = await runPosCryptoCheck({ platform: "Chromium", deviceModel: "CI browser",
      apiVersion: "not-applicable", sdkRevision: "not-applicable", target: "browser-test" },
      { subtle: nativeCrypto.subtle, getRandomValues: nativeCrypto.getRandomValues.bind(nativeCrypto) });
    let missingCrypto;
    try { await new EncryptionService().encryptForDevice("{}", { id: "device", publicKey }); }
    catch (error) { const failure = error as { name: string; message: string; capability?: string };
      missingCrypto = { name: failure.name, message: failure.message, capability: failure.capability }; }
    return { issuer, envelope, decrypted, diagnostics, missingCrypto };
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
}
