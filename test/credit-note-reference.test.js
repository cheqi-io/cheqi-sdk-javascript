import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { CheqiSDK, Environment, NoopLogger } from "../dist/index.js";
import { decryptDownloadEnvelope } from "../dist/download/index.js";
import { documentReferenceHash, addDownloadRecipient } from "../dist/services/document-reference.js";

const payload = { documentNumber: "CN-123", originatorDocumentReference: "INV-123", taxesApplied: true, totalAmount: "12.10" };
function harness(resolution, match) {
  const requests = [];
  const sdk = new CheqiSDK({ apiEndpoint: Environment.SANDBOX, apiKey: "test-key", crypto: webcrypto,
    maxRetries: 0, logger: new NoopLogger(), fetch: async (url, init) => {
      const path = new URL(url).pathname;
      const body = JSON.parse(init.body);
      requests.push({ path, body });
      if (path === "/credit-note/resolve") return resolution instanceof Response ? resolution : Response.json(resolution);
      if (path === "/recipient/resolve") return Response.json(match);
      if (path === "/credit-note/encrypted") return Response.json({ cheqiReceiptId: "credit", matchId: body.matchId });
      if (path === "/receipt/download") return Response.json({ cheqiReceiptId: "credit" });
      throw new Error(`Unexpected request ${path}`);
    } });
  return { sdk, requests };
}
async function receiver() {
  const envelope = { documents: {} };
  const publicKey = await addDownloadRecipient(envelope, webcrypto);
  return { publicKey, privateKey: JSON.parse(envelope.documents.DOWNLOAD_RECIPIENT_KEY.content).privateKey };
}
async function decrypt(sdk, encryptedContent, encryptedAesKey, privateKey) {
  return JSON.parse(await sdk.decryptionService.decryptCreditNoteInitiation({
    encryptedCreditNoteInitiationRequest: encryptedContent, encryptedSymmetricKey: encryptedAesKey
  }, privateKey));
}
test("reference hashes preserve exact document numbers across SDKs", async () => {
  const expected = "7d4b8ece79c805d20d5451ad72f019580fe0dc893f7aa16eedd94992dbaebd32";
  assert.equal(await documentReferenceHash("INV-123", webcrypto), expected);
  assert.notEqual(await documentReferenceHash(" INV-123", webcrypto), expected);
  assert.notEqual(await documentReferenceHash("inv-123", webcrypto), expected);
});
test("download credit note resolves by reference and persists encrypted retry state", async () => {
  const keys = await receiver();
  const { sdk, requests } = harness({ deliveryRoute: "DOWNLOAD", parentCheqiReceiptId: "original", creditNotePublicKey: keys.publicKey });
  const prepared = await sdk.creditNoteService.prepareCreditNote(payload);
  const saved = JSON.stringify(prepared);
  assert.ok(!/INV-123|CN-123|contentKey|privateKey/.test(saved));
  const restored = JSON.parse(saved);
  const request = restored.downloadSubmission;
  const link = await decrypt(sdk, request.encryptedParentLink, request.encryptedParentLinkKey, keys.privateKey);
  assert.equal(link.parentCheqiReceiptId, "original");
  assert.equal(link.downloadId, request.downloadId);
  assert.equal(link.version, 2);
  const note = await decryptDownloadEnvelope(request.ciphertext, link.contentKey, webcrypto);
  assert.deepEqual(JSON.parse(note.documents.CREDIT_NOTE_PAYLOAD.content), payload);
  await sdk.creditNoteService.submitPreparedCreditNote(restored);
  await sdk.creditNoteService.submitPreparedCreditNote(restored);
  assert.deepEqual(requests.map(r => r.path), ["/credit-note/resolve", "/receipt/download", "/receipt/download"]);
  assert.deepEqual(requests[1].body, requests[2].body);
  assert.deepEqual(requests[0].body, { documentReferenceHash: await documentReferenceHash("INV-123", webcrypto) });
  assert.ok(!JSON.stringify(requests).includes(link.contentKey));
  restored.parentCheqiReceiptId = "different";
  await assert.rejects(sdk.creditNoteService.submitPreparedCreditNote(restored), /parent mismatch/);
});
test("digital credit note follows original store and owner devices", async () => {
  const keys = await receiver();
  const storeId = "b77cdb90-b38f-491c-b460-a9469ca58a5c";
  const { sdk, requests } = harness({ deliveryRoute: "DIGITAL", parentCheqiReceiptId: "original", storeId },
    { routeFound: true, deliveryRouteType: "DIGITAL", matchId: "match", recipients: [{ id: "device", publicKey: keys.publicKey }] });
  const prepared = await sdk.creditNoteService.prepareCreditNote(payload);
  assert.equal(prepared.deviceSubmission.storeId, storeId);
  assert.equal(requests[1].body.cheqiReceiptId, "original");
  const d = prepared.deviceSubmission.deviceDeliveries[0];
  assert.deepEqual(await decrypt(sdk, d.encryptedContent, d.encryptedAesKey, keys.privateKey),
    { taxesApplied: true, creditNoteTemplateRequest: payload });
  assert.ok((await sdk.creditNoteService.submitPreparedCreditNote(prepared)).isAccepted());
});
for (const status of [404, 409]) test(`reference failure ${status} never creates a fallback`, async () => {
  const { sdk, requests } = harness(Response.json({ message: "Original unavailable" }, { status }));
  await assert.rejects(sdk.creditNoteService.prepareCreditNote(payload), e => e.httpStatusCode === status);
  assert.equal(requests.length, 1);
});
