import { EncryptionService, DecryptionService, sha256Hex, base64ToBytes, bytesToBase64,
  type CryptoProvider } from "@cheqi/sdk/crypto";
import { decryptDownloadEnvelope, parseDownloadUrl } from "@cheqi/sdk/download";
import { runIssuerFixture } from "./index.js";
import fixture from "../../test/fixtures/v2-crypto.json" with { type: "json" };

export interface DeviceDetails {
  platform: "iOS" | "Android" | "Chromium";
  deviceModel: string;
  apiVersion: string;
  sdkRevision: string;
  target: string;
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const delivery = (encrypted: { encryptedContent: string; encryptedAesKey: string }) => ({
  encryptedCreditNoteInitiationRequest: encrypted.encryptedContent,
  encryptedSymmetricKey: encrypted.encryptedAesKey
});

/** Run INSIDE the POS extension sandbox. Only synthetic fixture data is used; no network is performed. */
export async function runPosCryptoCheck(device: DeviceDetails, crypto?: CryptoProvider) {
  const posVersion = (globalThis as { shopify?: { session?: { currentSession?: { posVersion?: string } } } })
    .shopify?.session?.currentSession?.posVersion ?? null;
  const decrypt = new DecryptionService(crypto);
  const encrypt = new EncryptionService(crypto);
  const checks: Array<{ name: string; passed: boolean; error?: string }> = [];
  const artifacts: Record<string, { encryptedContent: string; encryptedAesKey: string }> = {};
  async function run(name: string, operation: () => Promise<void>) {
    try { await operation(); checks.push({ name, passed: true }); }
    catch (error) { checks.push({ name, passed: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }); }
  }

  await run("SHA-256 known vector", async () => {
    check(await sha256Hex("abc", crypto) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      "Incorrect SHA-256 digest");
  });
  await run("Node v2 ciphertext decrypts on device", async () => {
    check(await decrypt.decryptCreditNoteInitiation(delivery(fixture.encrypted), fixture.privateKeyB64) === fixture.plaintext,
      "Legacy plaintext changed");
  });
  for (const [name, publicKey] of [["SPKI", fixture.publicKeyB64], ["PKCS#1", fixture.publicKeyPkcs1B64]]) {
    await run(`${name} RSA-OAEP/SHA-256 and AES-256-GCM round trip`, async () => {
      const encrypted = await encrypt.encryptForDevice(fixture.plaintext, { id: "synthetic-device", publicKey });
      check(await decrypt.decryptCreditNoteInitiation(delivery(encrypted), fixture.privateKeyB64) === fixture.plaintext,
        "Hybrid encryption round trip changed plaintext");
      check(base64ToBytes(encrypted.encryptedContent).length === new TextEncoder().encode(fixture.plaintext).length + 12 + 16,
        "Expected IV(12) | ciphertext | tag(16) framing");
      artifacts[name] = encrypted;
    });
  }
  await run("PAR resolution and ciphertext-only receipt submission", async () => {
    const issued = await runIssuerFixture(fixture.publicKeyB64, crypto);
    check(issued.result.isAccepted() && issued.result.getDeliveryRouteType() === "DIGITAL", "Digital issuance failed");
    check(issued.requests.length === 2 && issued.requests[0].path === "/recipient/resolve" &&
      issued.requests[0].body.cardDetails.paymentAccountReference === "PAR-SYNTHETIC-TEST", "PAR was not resolved");
    check(issued.requests[1].path === "/receipt/encrypted", "Unexpected upload endpoint");
    const plaintext = await decrypt.decryptCreditNoteInitiation(delivery(issued.requests[1].body.deviceDeliveries[0]), fixture.privateKeyB64);
    check(plaintext === JSON.stringify(issued.payload), "Serialized receipt changed");
    check(!JSON.stringify(issued.requests).includes(issued.payload.documentNumber), "Plain receipt contents were sent");
  });
  await run("Encrypted download fallback keeps the key in the fragment", async () => {
    const issued = await runIssuerFixture(fixture.publicKeyB64, crypto, "DOWNLOAD_FALLBACK");
    check(issued.result.isAccepted(), "Download fallback failed");
    const url = issued.result.getDownloadUrl();
    check(url, "Download URL missing");
    const { contentKey } = parseDownloadUrl(url);
    const upload = issued.requests[1];
    check(upload?.path === "/receipt/download", "Unexpected download endpoint");
    check(Object.keys(upload.body).sort().join(",") === "ciphertext,downloadId,templateHash", "Unexpected upload fields");
    check(!JSON.stringify(issued.requests).includes(contentKey), "Download key was sent");
    check(!JSON.stringify(issued.requests).includes(issued.payload.documentNumber), "Plain receipt contents were sent");
    const envelope = await decryptDownloadEnvelope(upload.body.ciphertext, contentKey, crypto);
    check(JSON.parse(envelope.documents.RECEIPT_PAYLOAD.content).documentNumber === issued.payload.documentNumber,
      "Download receipt did not decrypt");
    check(/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/.test(envelope.receiptUuid), "Invalid UUIDv4");
  });
  await run("AES-GCM rejects a modified authentication tag", async () => {
    check(artifacts.SPKI, "Hybrid encryption prerequisite failed");
    const bytes = base64ToBytes(artifacts.SPKI.encryptedContent);
    bytes[bytes.length - 1] ^= 1;
    let rejected = false;
    try { await decrypt.decryptCreditNoteInitiation(delivery({ ...artifacts.SPKI, encryptedContent: bytesToBase64(bytes) }), fixture.privateKeyB64); }
    catch (error) { rejected = (error as { errorCode?: string })?.errorCode === "DECRYPTION_ERROR"; }
    check(rejected, "Modified GCM tag was not rejected as a decryption error");
  });
  return {
    reportVersion: 1,
    runtime: posVersion ? "shopify-pos" : "non-pos",
    posVersion,
    device,
    checkedAt: new Date().toISOString(),
    passed: checks.every((entry) => entry.passed),
    checks,
    artifacts
  };
}
