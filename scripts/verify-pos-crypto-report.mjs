import assert from "node:assert/strict";
import { constants, createDecipheriv, createPrivateKey, privateDecrypt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = JSON.parse(await readFile(new URL("../test/fixtures/v2-crypto.json", import.meta.url), "utf8"));
const requiredChecks = ["SHA-256 known vector", "Node v2 ciphertext decrypts on device",
  "SPKI RSA-OAEP/SHA-256 and AES-256-GCM round trip", "PKCS#1 RSA-OAEP/SHA-256 and AES-256-GCM round trip",
  "PAR resolution and ciphertext-only receipt submission", "Encrypted download fallback keeps the key in the fragment",
  "AES-GCM rejects a modified authentication tag"];

/** Cross-check device-generated ciphertext with the legacy Node implementation. */
export function verifyPosCryptoReport(report, { allowNonPos = false } = {}) {
  assert.equal(report.reportVersion, 1, "Unsupported report version");
  if (!allowNonPos) {
    assert.equal(report.runtime, "shopify-pos", "This report was not generated inside Shopify POS");
    assert.ok(report.posVersion?.trim(), "POS version is missing");
    assert.ok(["iOS", "Android"].includes(report.device?.platform), "POS device platform is missing");
    for (const field of ["deviceModel", "apiVersion", "sdkRevision", "target"]) {
      assert.ok(report.device?.[field]?.trim(), `${field} is missing`);
    }
    assert.match(report.device.sdkRevision, /^[a-f\d]{40}$/, "Record the full SDK commit SHA");
  }
  assert.ok(Number.isFinite(Date.parse(report.checkedAt)), "Check timestamp is missing");
  assert.equal(report.passed, true, "One or more device checks failed");
  assert.deepEqual(report.checks.map((check) => check.name), requiredChecks, "Device checks are missing or unexpected");
  assert.ok(report.checks.every((check) => check.passed === true), "A device check failed");
  for (const format of ["SPKI", "PKCS#1"]) {
    const encrypted = report.artifacts[format];
    const key = privateDecrypt({ key: createPrivateKey({ key: Buffer.from(fixture.privateKeyB64, "base64"),
      format: "der", type: "pkcs8" }), oaepHash: "sha256", padding: constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(encrypted.encryptedAesKey, "base64"));
    assert.equal(key.length, 32, "Expected an AES-256 key");
    const bytes = Buffer.from(encrypted.encryptedContent, "base64");
    assert.equal(bytes.length, Buffer.byteLength(fixture.plaintext) + 12 + 16, "Ciphertext framing changed");
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(-16));
    assert.equal(Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString("utf8"),
      fixture.plaintext, `${format} ciphertext is not compatible with Node`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Usage: npm run verify:pos-report -- /path/to/pos-crypto-report.json");
  const report = JSON.parse(await readFile(process.argv[2], "utf8"));
  verifyPosCryptoReport(report);
  console.log(`Verified Shopify POS ${report.posVersion} (${report.device.platform}, ${report.device.deviceModel}) ` +
    `for SDK ${report.device.sdkRevision}; device ciphertext decrypts with Node.`);
}
