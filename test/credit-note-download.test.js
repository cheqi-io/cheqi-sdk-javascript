import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { CheqiSDK, NoopLogger, Environment } from "../dist/index.js";
import { decryptDownloadEnvelope, parseDownloadUrl } from "../dist/download/index.js";

test("credit-note reference stays inside normal encrypted download; no parent lookup", async () => {
  const requests = [];
  const sdk = new CheqiSDK({ apiEndpoint: Environment.SANDBOX, apiKey: "test", crypto: webcrypto, logger: new NoopLogger(), fetch: async (url, init) => {
    requests.push({ path: new URL(url).pathname, body: JSON.parse(init.body) });
    return Response.json({ cheqiReceiptId: "credit-note" });
  } });
  const payload = { documentNumber: "CN-123", originatorDocumentReference: " INV-123 ", creditNoteSubtotal: "12.123456789012345678" };
  const prepared = await sdk.creditNoteService.prepareDownload({ taxesApplied: false, creditNoteTemplateRequest: payload });
  assert.equal(requests.length, 0);
  const restored = JSON.parse(JSON.stringify(prepared));
  const { contentKey } = parseDownloadUrl(restored.downloadUrl);
  const envelope = await decryptDownloadEnvelope(restored.uploadRequest.ciphertext, contentKey, webcrypto);
  assert.deepEqual(JSON.parse(envelope.documents.CREDIT_NOTE_PAYLOAD.content), { ...payload, taxesApplied: false });
  await sdk.receiptService.uploadPreparedDownload(restored);
  await sdk.receiptService.uploadPreparedDownload(restored);
  assert.deepEqual(requests.map(r => r.path), ["/receipt/download", "/receipt/download"]);
  assert.deepEqual(requests[0].body, requests[1].body);
  assert.deepEqual(Object.keys(requests[0].body).sort(), ["ciphertext", "downloadId"]);
  assert.ok(!JSON.stringify(requests).includes(contentKey));
  assert.ok(!JSON.stringify(requests).includes("INV-123"));
  await assert.rejects(sdk.creditNoteService.prepareDownload({ documentNumber: "CN", taxesApplied: true }), /originatorDocumentReference/);
});
