import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto, createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import { CheqiSDK, CryptoUnavailableError, DecryptionError, Environment, NoopLogger } from "../dist/index.js";
import { createCheqiIssuer, createReceiptPayload } from "../dist/issuer.js";
import { EncryptionService, DecryptionService, sha256Hex } from "../dist/crypto-entry.js";
import { DownloadService, decryptDownloadEnvelope, parseDownloadUrl } from "../dist/download/index.js";

const fixture = JSON.parse(await readFile(new URL("./fixtures/v2-crypto.json", import.meta.url), "utf8"));
const recipient = { id: "test-device", publicKey: fixture.publicKeyB64 };
const delivery = (encrypted) => ({ encryptedCreditNoteInitiationRequest: encrypted.encryptedContent,
  encryptedSymmetricKey: encrypted.encryptedAesKey });
const envelope = { cheqiReceiptId: "test", envelopeVersion: 2, receiptGeneratorVersion: "test",
  receiptUuid: "bd646ff8-8d36-4cc7-9c19-f70d201259bf", documents: {} };
const payload = () => createReceiptPayload({ documentNumber: "PRIVATE-RECEIPT", issueDate: new Date("2026-10-24T10:00:00Z"),
  currency: "EUR", receiptSubtotal: "10.00", totalBeforeTax: "10.00", totalTaxAmount: "2.10",
  totalAmount: "12.10", taxesApplied: true, products: [{ name: "PRIVATE-ITEM", identifier: "SKU-1", quantity: 1,
    unitCode: "C62", unitPrice: "10.00", subtotal: "10.00", total: "12.10" }] });

function replaceGlobalCrypto(t, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { configurable: true, value });
  t.after(() => descriptor ? Object.defineProperty(globalThis, "crypto", descriptor) : delete globalThis.crypto);
}

function trackedCrypto() {
  const calls = [];
  const provider = {
    subtle: new Proxy(webcrypto.subtle, { get(target, name) {
      const method = target[name];
      return typeof method !== "function" ? method : (...args) => {
        calls.push({ method: name, algorithm: args[0]?.name ?? args[0] });
        return method.apply(target, args);
      };
    } }),
    getRandomValues(array) {
      assert.equal(this, provider, "preserve the provider receiver");
      calls.push({ method: "getRandomValues", length: array.length });
      return webcrypto.getRandomValues(array);
    }
  };
  return { provider, calls };
}

function issuerOptions(crypto, route = "DIGITAL", requests = []) {
  return { apiEndpoint: Environment.TEST, apiKey: "test-credential", crypto, logger: new NoopLogger(), maxRetries: 0,
    fetch: async (url, init) => {
      const path = new URL(url).pathname;
      const body = JSON.parse(init.body);
      requests.push({ path, body });
      if (path === "/recipient/resolve") return Response.json({ routeFound: true,
        deliveryRouteType: route, matchId: "test-match", recipients: route === "DIGITAL" ? [recipient] : undefined });
      if (path === "/receipt/encrypted") return Response.json({ cheqiReceiptId: "test-receipt", matchId: "test-match" });
      if (path === "/receipt/download") return Response.json({ cheqiReceiptId: body.downloadId });
      throw new Error(`Unexpected request ${path}`);
    } };
}

test("injected crypto covers encryption, decryption, hashes and downloads without global crypto or DOM", async (t) => {
  replaceGlobalCrypto(t, undefined);
  assert.equal(typeof globalThis.window, "undefined");
  assert.equal(typeof globalThis.document, "undefined");
  const { provider, calls } = trackedCrypto();
  const sdk = new CheqiSDK(issuerOptions(provider));
  const encrypted = await sdk.encryptionService.encryptForDevice(fixture.plaintext, recipient);
  assert.equal(await sdk.decryptionService.decryptCreditNoteInitiation(delivery(encrypted), fixture.privateKeyB64), fixture.plaintext);
  assert.equal(await sdk.verificationService.canonicalizeAndHashJson({ b: 2, a: 1 }),
    "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777");
  assert.equal((await sdk.verificationService.canonicalizeAndHashXml("<a/>" )).length, 64);
  const link = sdk.downloadService.generateDownloadLink("https://receipt.example");
  const ciphertext = await sdk.downloadService.encryptDownloadEnvelope(envelope, link.contentKey);
  assert.deepEqual(JSON.parse(JSON.stringify(await sdk.downloadService.decryptDownloadEnvelope(ciphertext, link.contentKey))), envelope);
  assert.equal(await sha256Hex("abc", provider), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.ok(calls.some((call) => call.method === "getRandomValues" && call.length === 32));
  assert.ok(calls.some((call) => call.method === "getRandomValues" && call.length === 12));
  assert.ok(calls.some((call) => call.method === "encrypt" && call.algorithm === "RSA-OAEP"));
});

test("issuer resolves PAR and sends only locally encrypted receipts with injected crypto", async (t) => {
  replaceGlobalCrypto(t, undefined);
  const { provider } = trackedCrypto();
  const requests = [];
  const issuer = createCheqiIssuer(issuerOptions(provider, "DIGITAL", requests));
  const result = await issuer.issueReceipt({ cardDetails: { paymentAccountReference: "PAR-TEST" } }, payload());
  assert.ok(result.isAccepted());
  assert.deepEqual(requests.map((request) => request.path), ["/recipient/resolve", "/receipt/encrypted"]);
  assert.equal(requests[0].body.cardDetails.paymentAccountReference, "PAR-TEST");
  assert.ok(requests.every((request) => !/PRIVATE-RECEIPT|PRIVATE-ITEM/.test(JSON.stringify(request.body))));
  const plaintext = await new DecryptionService(provider).decryptCreditNoteInitiation(
    delivery(requests[1].body.deviceDeliveries[0]), fixture.privateKeyB64);
  assert.deepEqual(JSON.parse(plaintext), JSON.parse(JSON.stringify(payload())));
});

test("injected crypto covers fallback, UUIDv4 and deferred uploads without uploading the fragment key", async (t) => {
  replaceGlobalCrypto(t, undefined);
  const { provider, calls } = trackedCrypto();
  const requests = [];
  const issuer = createCheqiIssuer(issuerOptions(provider, "DOWNLOAD_FALLBACK", requests));
  const result = await issuer.issueReceipt({ paymentType: "CASH" }, payload());
  const { contentKey } = parseDownloadUrl(result.getDownloadUrl());
  const upload = requests[1].body;
  assert.deepEqual(Object.keys(upload).sort(), ["ciphertext", "downloadId", "templateHash"]);
  assert.ok(!JSON.stringify(requests).includes(contentKey));
  assert.ok(!JSON.stringify(requests).includes("PRIVATE-RECEIPT"));
  const decrypted = await decryptDownloadEnvelope(upload.ciphertext, contentKey, provider);
  assert.match(decrypted.receiptUuid, /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
  assert.equal(JSON.parse(decrypted.documents.RECEIPT_PAYLOAD.content).documentNumber, "PRIVATE-RECEIPT");
  assert.ok(calls.some((call) => call.method === "getRandomValues" && call.length === 16));

  const deferred = createCheqiIssuer({ ...issuerOptions(provider), fetch: async () => { throw new TypeError("offline"); } });
  const prepared = await deferred.issueReceipt({ cardDetails: { paymentAccountReference: "PAR-TEST" } }, payload());
  assert.ok(prepared.preparedDownload);
  const preparedDownload = prepared.preparedDownload;
  await issuer.uploadPreparedDownload(preparedDownload);
  assert.deepEqual(requests.at(-1).body, preparedDownload.uploadRequest);
  assert.ok(!JSON.stringify(requests.at(-1)).includes(parseDownloadUrl(preparedDownload.downloadUrl).contentKey));
});

test("missing global crypto gives actionable typed errors and never uploads receipt contents", async (t) => {
  replaceGlobalCrypto(t, undefined);
  const requests = [];
  const check = (error) => error instanceof CryptoUnavailableError && error.errorCode === "CONFIGURATION_ERROR"
    && /crypto option/.test(error.message) && /crypto.subtle/.test(error.message);
  await assert.rejects(new EncryptionService().encryptForDevice("{}", recipient), check);
  await assert.rejects(new DecryptionService().decryptCreditNoteInitiation(delivery(fixture.encrypted), fixture.privateKeyB64), check);
  await assert.rejects(sha256Hex("abc"), check);
  assert.throws(() => new DownloadService().generateDownloadLink("https://receipt.example"),
    (error) => error instanceof CryptoUnavailableError && /getRandomValues/.test(error.message));
  await assert.rejects(createCheqiIssuer(issuerOptions(undefined, "DIGITAL", requests))
    .issueReceipt({ cardDetails: { paymentAccountReference: "PAR-TEST" } }, payload()), check);
  assert.deepEqual(requests.map((request) => request.path), ["/recipient/resolve"]);
});

test("partial and explicitly supplied providers never silently fall back to ambient crypto", async () => {
  for (const [provider, missing] of [[{}, "crypto.subtle"], [{ subtle: {} }, "importKey"],
    [{ subtle: webcrypto.subtle }, "getRandomValues"]]) {
    await assert.rejects(new EncryptionService(provider).encryptForDevice("{}", recipient),
      (error) => error instanceof CryptoUnavailableError && error.message.includes(missing));
  }
  await assert.rejects(sha256Hex("abc", { subtle: {} }),
    (error) => error instanceof CryptoUnavailableError && /digest/.test(error.message));
  const denied = { get subtle() { throw new DOMException("Denied", "SecurityError"); } };
  await assert.rejects(sha256Hex("abc", denied), CryptoUnavailableError);
  assert.throws(() => new DownloadService({ getRandomValues() { throw new Error("Randomness unavailable"); } })
    .generateDownloadLink("https://receipt.example"),
  (error) => error instanceof CryptoUnavailableError && /getRandomValues/.test(error.capability));
});

test("unsupported AES-GCM, RSA-OAEP and SHA-256 identify the algorithm without hiding invalid keys or tampering", async () => {
  for (const algorithm of ["AES-GCM", "RSA-OAEP"]) {
    const provider = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
      subtle: new Proxy(webcrypto.subtle, { get(target, name) {
        return (...args) => {
          const selected = name === "importKey" ? args[2] : args[0];
          if ((selected?.name ?? selected) === algorithm) throw new DOMException("Unavailable", "NotSupportedError");
          return target[name](...args);
        };
      } }) };
    await assert.rejects(new EncryptionService(provider).encryptForDevice("{}", recipient),
      (error) => error instanceof CryptoUnavailableError && error.capability.includes(algorithm === "AES-GCM" ? "AES-256-GCM" : algorithm));
  }
  await assert.rejects(sha256Hex("abc", { subtle: { digest() { throw new DOMException("Unavailable", "NotSupportedError"); } } }),
    (error) => error instanceof CryptoUnavailableError && /SHA-256/.test(error.capability));
  const encrypted = await new EncryptionService().encryptForDevice("{}", recipient);
  const bytes = Buffer.from(encrypted.encryptedContent, "base64");
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(new DecryptionService().decryptCreditNoteInitiation(delivery({ ...encrypted,
    encryptedContent: bytes.toString("base64") }), fixture.privateKeyB64), DecryptionError);
  await assert.rejects(new EncryptionService().encryptForDevice("{}", { ...recipient, publicKey: "invalid" }),
    (error) => error.name === "EncryptionError" && !(error instanceof CryptoUnavailableError));
});

test("injected crypto retains iOS PKCS#1 encryption when globals are absent", async (t) => {
  replaceGlobalCrypto(t, undefined);
  const key = createPublicKey({ key: Buffer.from(fixture.publicKeyB64, "base64"), format: "der", type: "spki" });
  const encrypted = await new EncryptionService(webcrypto).encryptForDevice(fixture.plaintext,
    { ...recipient, publicKey: key.export({ format: "der", type: "pkcs1" }).toString("base64") });
  assert.equal(await new DecryptionService(webcrypto).decryptCreditNoteInitiation(delivery(encrypted), fixture.privateKeyB64), fixture.plaintext);
});
