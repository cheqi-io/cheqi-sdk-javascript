import { runIssuerFixture } from "./index.js";
import { EncryptionService, DecryptionService } from "@cheqi/sdk/crypto";

export async function runBrowserTests(publicKey: string, privateKey: string) {
  const issuer = await runIssuerFixture(publicKey);
  const envelope = { cheqiReceiptId: "R-1", envelopeVersion: 1,
    receiptGeneratorVersion: "fixture", receiptUuid: crypto.randomUUID(), documents: {} };
  const encrypted = await new EncryptionService().encryptReceiptForRecipient(JSON.stringify(envelope),
    { id: "device", publicKey });
  const decrypted = await new DecryptionService().decryptReceipt({
    encryptedEnvelope: encrypted.encryptedContent, encryptedEnvelopeKey: encrypted.encryptedAesKey
  }, privateKey);
  return { issuer, envelope, decrypted };
}
