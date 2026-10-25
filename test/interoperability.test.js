import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { constants, createDecipheriv, createPrivateKey, createPublicKey, privateDecrypt } from "node:crypto";
import { EncryptionService } from "../dist/crypto-entry.js";
import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from "../dist/bytes.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/v2-crypto.json", import.meta.url), "utf8"));

test("shared binary helpers match Node Base64 and UTF-8", () => {
  const allBytes = Uint8Array.from({ length: 256 }, (_, index) => index);
  assert.equal(bytesToBase64(allBytes), Buffer.from(allBytes).toString("base64"));
  assert.deepEqual(base64ToBytes(bytesToBase64(allBytes)), allBytes);
  assert.equal(bytesToUtf8(utf8ToBytes("Cheqi café 🧾")), "Cheqi café 🧾");
});

async function webDecrypt(encrypted) {
  const privateKey = await crypto.subtle.importKey("pkcs8", base64ToBytes(fixture.privateKeyB64),
    { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  const aesKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey,
    base64ToBytes(encrypted.encryptedAesKey));
  const bytes = base64ToBytes(encrypted.encryptedContent);
  const key = await crypto.subtle.importKey("raw", aesKey, "AES-GCM", false, ["decrypt"]);
  return bytesToUtf8(new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.subarray(0, 12) }, key, bytes.subarray(12))));
}

test("v2 encrypted payload decrypts with Web Crypto", async () => {
  assert.equal(await webDecrypt(fixture.encrypted), fixture.plaintext);
});

test("v3 encryption decrypts with v2 Node protocol", async () => {
  const encrypted = await new EncryptionService().encryptForDevice(fixture.plaintext,
    { id: "fixture-device", publicKey: fixture.publicKeyB64 });
  const aesKey = privateDecrypt({ key: createPrivateKey({ key: Buffer.from(fixture.privateKeyB64, "base64"),
    format: "der", type: "pkcs8" }), oaepHash: "sha256", padding: constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(encrypted.encryptedAesKey, "base64"));
  const combined = Buffer.from(encrypted.encryptedContent, "base64");
  const decipher = createDecipheriv("aes-256-gcm", aesKey, combined.subarray(0, 12));
  decipher.setAuthTag(combined.subarray(-16));
  const plaintext = Buffer.concat([decipher.update(combined.subarray(12, -16)), decipher.final()]).toString("utf8");
  assert.equal(plaintext, fixture.plaintext);
});

test("iOS PKCS#1 and PEM public keys retain interoperability", async () => {
  const publicKey = createPublicKey({ key: Buffer.from(fixture.publicKeyB64, "base64"),
    format: "der", type: "spki" });
  for (const value of [publicKey.export({ format: "der", type: "pkcs1" }).toString("base64"),
    publicKey.export({ format: "pem", type: "spki" }).toString()]) {
    const encrypted = await new EncryptionService().encryptForDevice(fixture.plaintext,
      { id: "fixture-device", publicKey: value });
    assert.equal(await webDecrypt(encrypted), fixture.plaintext);
  }
});
