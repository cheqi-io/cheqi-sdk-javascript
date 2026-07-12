import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import {
  canonicalizeJson,
  canonicalizeXml,
  CardDetails,
  CheqiSDK,
  CheqiSDKConfig,
  Company,
  CompanyAddress,
  CreditNoteService,
  DefaultCheqiApiClient,
  DecryptionService,
  EncryptionService,
  Environment,
  IdentificationDetails,
  MatchingService,
  NoopLogger,
  Product,
  ReceiptProcessor,
  ReceiptResult,
  ReceiptService,
  ReceiptTemplateRequest,
  RetryHandler,
  VerificationService
} from "../dist/index.js";
import {
  Identifier,
  MonetaryTotal,
  Party,
  PaymentMeans,
  PurchaseReceipt,
  PurchaseReceiptLine
} from "../dist/entity/index.js";

const NOOP = { logger: new NoopLogger() };

function rsaKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKeyB64: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    publicKeyB64: publicKey.export({ type: "spki", format: "der" }).toString("base64")
  };
}

// ───────────────────────────── Config ─────────────────────────────

test("config: requires endpoint", () => {
  assert.throws(() => new CheqiSDKConfig(NOOP), /environment.*customApiEndpoint/);
});

test("config: rejects negative timeout", () => {
  assert.throws(
    () => new CheqiSDKConfig({ environment: "https://x", timeoutSeconds: -1, ...NOOP }),
    /Timeout must be positive/
  );
});

test("config: rejects zero timeout", () => {
  assert.throws(
    () => new CheqiSDKConfig({ environment: "https://x", timeoutSeconds: 0, ...NOOP }),
    /Timeout must be positive/
  );
});

test("config: rejects negative retries", () => {
  assert.throws(
    () => new CheqiSDKConfig({ environment: "https://x", maxRetries: -1, ...NOOP }),
    /cannot be negative/
  );
});

test("config: accepts valid config", () => {
  const config = new CheqiSDKConfig({
    environment: Environment.SANDBOX,
    apiKey: "sk_test_abc",
    timeoutSeconds: 60,
    maxRetries: 5,
    ...NOOP
  });
  assert.equal(config.apiEndpoint, "https://sandbox.api.cheqi.io");
  assert.equal(config.apiKey, "sk_test_abc");
  assert.equal(config.timeoutSeconds, 60);
  assert.equal(config.maxRetries, 5);
});

test("config: customApiEndpoint overrides environment", () => {
  const config = new CheqiSDKConfig({
    environment: Environment.PRODUCTION,
    customApiEndpoint: "https://custom.example.com",
    ...NOOP
  });
  assert.equal(config.apiEndpoint, "https://custom.example.com");
});

// ───────────────────────────── Matching ────────────────────────────

test("matching: allows anonymous identification details", async () => {
  let received;
  const matching = new MatchingService({
    async matchCustomer(req) {
      received = req;
      return { customerFound: false };
    }
  });
  const result = await matching.matchCustomer({});
  assert.deepEqual(received, {});
  assert.equal(result.customerFound, false);
});

test("matching: rejects null identification details", async () => {
  const matching = new MatchingService({ matchCustomer() { throw new Error("unreachable"); } });
  await assert.rejects(() => matching.matchCustomer(null), /Identification details cannot be null/);
});

test("matching: accepts card PAN", async () => {
  let received;
  const matching = new MatchingService({
    async matchCustomer(req) {
      received = req;
      return { customerFound: false };
    }
  });
  await matching.matchCustomer({
    paymentType: "CARD_PAYMENT",
    cardDetails: { paymentAccountNumber: "1234567890" }
  });
  assert.equal(received.cardDetails.paymentAccountNumber, "1234567890");
});

test("matching: accepts card PAR", async () => {
  const matching = new MatchingService({
    async matchCustomer() { return { customerFound: false }; }
  });
  const result = await matching.matchCustomer({
    paymentType: "CARD_PAYMENT",
    cardDetails: { paymentAccountReference: "PAR-123" }
  });
  assert.equal(result.customerFound, false);
});

test("matching: accepts email identifier", async () => {
  const matching = new MatchingService({
    async matchCustomer() { return { customerFound: true, matchId: "m1" }; }
  });
  const result = await matching.matchCustomer({
    paymentType: "CARD_PAYMENT",
    recipientEmail: "user@example.com"
  });
  assert.equal(result.customerFound, true);
});

test("matching: accepts pairingCode", async () => {
  const matching = new MatchingService({
    async matchCustomer() { return { customerFound: true, matchId: "m1" }; }
  });
  const result = await matching.matchCustomer({
    paymentType: "CARD_PAYMENT",
    pairingCode: "123456"
  });
  assert.equal(result.customerFound, true);
});

test("matching: accepts cheqiReceiptId", async () => {
  const matching = new MatchingService({
    async matchCustomer() { return { customerFound: true, matchId: "m1" }; }
  });
  const result = await matching.matchCustomer({
    paymentType: "CARD_PAYMENT",
    cheqiReceiptId: "receipt-123"
  });
  assert.equal(result.customerFound, true);
});

test("matching: wraps unknown errors in CheqiApiError", async () => {
  const matching = new MatchingService({
    async matchCustomer() { throw new Error("network boom"); }
  });
  await assert.rejects(
    () => matching.matchCustomer({ paymentType: "CARD_PAYMENT", recipientEmail: "a@b.com" }),
    (err) => err.errorCode === "UNKNOWN_ERROR" && err.message.includes("network boom")
  );
});

// ──────────────────────── Encryption/Decryption ───────────────────

test("encryption: round trip for receipts", () => {
  const { privateKeyB64, publicKeyB64 } = rsaKeyPair();
  const encryption = new EncryptionService();
  const decryption = new DecryptionService();
  const payload = JSON.stringify({ documentNumber: "INV-001", totalAmount: 121 });
  const encrypted = encryption.encryptReceiptForRecipient(payload, {
    id: "device-123",
    publicKey: publicKeyB64
  });

  assert.ok(encrypted.encryptedReceipt);
  assert.ok(encrypted.encryptedSymmetricKey);
  assert.equal(encrypted.recipientId, "device-123");
  assert.equal(encrypted.publicKey, publicKeyB64);

  const decrypted = decryption.decryptReceipt(encrypted, privateKeyB64);
  assert.deepEqual(JSON.parse(decrypted.receiptContent), JSON.parse(payload));
  assert.equal(decrypted.customerDetails, null);
});


test("encryption: round trip for credit notes", () => {
  const { privateKeyB64, publicKeyB64 } = rsaKeyPair();
  const encryption = new EncryptionService();
  const decryption = new DecryptionService();
  const payload = JSON.stringify({ documentNumber: "CN-001", totalAmount: -50 });
  const encrypted = encryption.encryptCreditNoteForRecipient(payload, {
    id: "device-456",
    publicKey: publicKeyB64
  });
  const decrypted = decryption.decryptCreditNote({
    encryptedCreditNoteInitiationRequest: encrypted.encryptedCreditNote,
    encryptedSymmetricKey: encrypted.encryptedSymmetricKey
  }, privateKeyB64);
  assert.deepEqual(JSON.parse(decrypted.content), JSON.parse(payload));
});

test("encryption: throws on missing public key", () => {
  const encryption = new EncryptionService();
  assert.throws(
    () => encryption.encryptReceiptForRecipient("{}", { id: "r1", publicKey: "" }),
    /Public key is required/
  );
});

test("encryption: throws on null recipient", () => {
  const encryption = new EncryptionService();
  assert.throws(
    () => encryption.encryptReceiptForRecipient("{}", null),
    /Recipient is required/
  );
});

test("decryption: throws on null encrypted receipt", () => {
  const decryption = new DecryptionService();
  assert.throws(
    () => decryption.decryptReceipt(null, "key"),
    /cannot be null/
  );
});

test("decryption: throws on empty private key", () => {
  const decryption = new DecryptionService();
  assert.throws(
    () => decryption.decryptReceipt({ encryptedReceipt: "abc", encryptedSymmetricKey: "def" }, ""),
    /Private key is required/
  );
});

test("decryption: throws on empty encrypted key", () => {
  const decryption = new DecryptionService();
  assert.throws(
    () => decryption.decryptReceipt({ encryptedReceipt: "abc", encryptedSymmetricKey: "" }, "somekey"),
    /Encrypted key cannot be empty/
  );
});

test("decryption: throws on corrupted data", () => {
  const { privateKeyB64 } = rsaKeyPair();
  const decryption = new DecryptionService();
  assert.throws(
    () => decryption.decryptReceipt({
      encryptedReceipt: "abc",
      encryptedSymmetricKey: "not-valid-base64-encrypted-key"
    }, privateKeyB64),
    /Failed to decrypt/
  );
});

// ──────────────────── Receipt Service ─────────────────────────────

test("receipt: match → template → encrypt → send", async () => {
  const { publicKeyB64 } = rsaKeyPair();
  const calls = [];
  const apiClient = {
    async matchCustomer() {
      calls.push("match");
      return {
        customerFound: true,
        matchId: "match-1",
        recipients: [{ id: "r1", publicKey: publicKeyB64, acceptedFormats: ["CHEQI"] }],
        buyerCountryCode: "NL",
        buyerType: "CONSUMER"
      };
    },
    async generateReceiptTemplate() {
      calls.push("template");
      return { cheqi: { documentNumber: "INV-001", totalAmount: 121 } };
    },
    async sendEncryptedReceipts(matchId, encryptedReceipts, templateHash) {
      calls.push("send");
      assert.equal(matchId, "match-1");
      assert.equal(encryptedReceipts.length, 1);
      assert.ok(templateHash);
      return { receiptCount: 1 };
    }
  };
  const service = new ReceiptService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  const result = await service.processCompleteReceipt(
    { paymentType: "CARD_PAYMENT", recipientEmail: "customer@example.com" },
    { documentNumber: "INV-001", totalAmount: 121 }
  );
  assert.equal(result.isSuccess(), true);
  assert.equal(result.deliveryMethod, "APP");
  assert.deepEqual(calls, ["match", "template", "send"]);
});

test("receipt: anonymous identification details can resolve to download fallback", async () => {
  const { publicKeyB64 } = rsaKeyPair();
  let matchedRequest;
  const apiClient = {
    async matchCustomer(req) {
      matchedRequest = req;
      return {
        routeFound: true,
        customerFound: true,
        matchId: "match-download",
        recipients: [{ id: "r1", publicKey: publicKeyB64, acceptedFormats: ["CHEQI"] }]
      };
    },
    async generateReceiptTemplate() {
      return { cheqi: { documentNumber: "INV-001", totalAmount: 121 } };
    },
    async sendEncryptedReceipts() {
      return { cheqiReceiptId: "receipt-1", downloadUrl: "https://cheqi.example/download/receipt-1" };
    }
  };
  const service = new ReceiptService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  const result = await service.processCompleteReceipt(
    {},
    { documentNumber: "INV-001", totalAmount: 121 }
  );

  assert.deepEqual(matchedRequest, {});
  assert.equal(result.deliveryMethod, "DOWNLOAD");
  assert.equal(result.getDownloadUrl(), "https://cheqi.example/download/receipt-1");
});

test("receipt: encrypted submission uses backend field name", async () => {
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ cheqiReceiptId: "receipt-1", templateHash: "hash-1" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const client = new DefaultCheqiApiClient(
    new CheqiSDKConfig({
      environment: "https://api.example.test",
      apiKey: "sk_test_123",
      logger: new NoopLogger()
    }),
    fetchImpl
  );

  await client.sendEncryptedReceipts(
    "match-1",
    [{ recipientId: "r1", encryptedReceipt: "ciphertext", encryptedSymmetricKey: "wrapped-key", publicKey: "public-key" }],
    "template-hash"
  );

  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].matchId, "match-1");
  assert.equal(bodies[0].templateHash, "template-hash");
  assert.equal(bodies[0].encryptedReceipts, undefined);
  assert.deepEqual(bodies[0].encryptedReceiptRequests, [
    { recipientId: "r1", encryptedReceipt: "ciphertext", encryptedSymmetricKey: "wrapped-key", publicKey: "public-key" }
  ]);
});

test("receipt: encrypted envelopes match Java SDK schema", async () => {
  const encryptedEnvelopes = [];
  let generationRequest;
  const apiClient = {
    async matchCustomer() {
      return {
        customerFound: true,
        matchId: "match-1",
        recipients: [
          { id: "ubl", publicKey: "public-key-ubl", acceptedFormats: ["UBL_PURCHASE_RECEIPT"] },
          { id: "invoice", publicKey: "public-key-invoice", acceptedFormats: ["UBL_INVOICE"] }
        ],
        buyerCountryCode: "NL",
        buyerType: "BUSINESS"
      };
    },
    async generateReceiptTemplate(request) {
      generationRequest = request;
      return {
        cheqi: { documentNumber: "INV-001" },
        ublPurchaseReceipt: "<Receipt>ok</Receipt>",
        ublInvoice: "<Invoice>ok</Invoice>",
        vatMetadata: { buyerType: "BUSINESS", taxesApplied: true }
      };
    },
    async sendEncryptedReceipts(_matchId, encryptedReceipts) {
      assert.equal(encryptedReceipts.length, 2);
      return { receiptCount: 2 };
    }
  };
  const encryptionService = {
    encryptReceiptForRecipient(receiptJson, recipient) {
      encryptedEnvelopes.push(JSON.parse(receiptJson));
      return {
        recipientId: recipient.id,
        publicKey: recipient.publicKey,
        encryptedReceipt: `ciphertext-${recipient.id}`,
        encryptedSymmetricKey: `wrapped-key-${recipient.id}`
      };
    }
  };
  const service = new ReceiptService(apiClient, encryptionService, new MatchingService(apiClient));

  await service.processCompleteReceipt(
    {
      paymentType: "CARD_PAYMENT",
      cardDetails: { paymentAccountReference: "par-123" }
    },
    {
      documentNumber: "INV-001",
      issueDate: new Date("2024-01-15T10:30:00Z"),
      currency: "EUR",
      receiptSubtotal: 100,
      totalBeforeTax: 100,
      totalTaxAmount: 21,
      totalAmount: 121,
      products: [],
      taxes: []
    }
  );

  assert.equal(generationRequest.buyerCountryCode, "NL");
  assert.equal(generationRequest.buyerType, "BUSINESS");
  assert.equal(generationRequest.taxesApplied, true);
  assert.equal(generationRequest.receiptTemplateRequest.buyerCountryCode, "NL");
  assert.equal(generationRequest.receiptTemplateRequest.buyerType, "BUSINESS");
  assert.equal(generationRequest.receiptTemplateRequest.taxesApplied, true);
  assert.deepEqual(encryptedEnvelopes, [
    {
      ublPurchaseReceipt: "<Receipt>ok</Receipt>",
      vatMetaData: { buyerType: "BUSINESS", taxesApplied: true }
    },
    {
      ublInvoice: "<Invoice>ok</Invoice>",
      vatMetaData: { buyerType: "BUSINESS", taxesApplied: true }
    }
  ]);
  assert.equal(encryptedEnvelopes.some((envelope) => "cheqiReceipt" in envelope), false);
  assert.equal(encryptedEnvelopes.some((envelope) => "vatMetadata" in envelope), false);
});

test("receipt: falls back to email", async () => {
  const apiClient = {
    async matchCustomer() {
      return { customerFound: false, recipients: [] };
    },
    async generateReceiptTemplate() {
      return { cheqi: { documentNumber: "INV-001" } };
    },
    async sendReceiptViaEmail(email) {
      assert.equal(email, "customer@example.com");
    }
  };
  const service = new ReceiptService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  const result = await service.processCompleteReceipt(
    { paymentType: "CARD_PAYMENT", recipientEmail: "customer@example.com" },
    { documentNumber: "INV-001" }
  );
  assert.equal(result.deliveryMethod, "EMAIL");
});

test("receipt: returns customerNotFound when no email and no match", async () => {
  const apiClient = {
    async matchCustomer() { return { customerFound: false }; },
    async generateReceiptTemplate() { return {}; }
  };
  const service = new ReceiptService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  const result = await service.processCompleteReceipt(
    { paymentType: "CARD_PAYMENT", cardDetails: { paymentAccountNumber: "123" } },
    { documentNumber: "INV-001" }
  );
  assert.equal(result.isSuccess(), false);
  assert.equal(result.isCustomerNotFound(), true);
});

test("receipt: rejects null identification details", async () => {
  const apiClient = { matchCustomer() {}, generateReceiptTemplate() {}, sendEncryptedReceipts() {} };
  const service = new ReceiptService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  await assert.rejects(
    () => service.processCompleteReceipt(null, { documentNumber: "INV-001" }),
    /Identification details cannot be null/
  );
});

test("receipt: rejects null receipt request", async () => {
  const apiClient = { matchCustomer() {}, generateReceiptTemplate() {}, sendEncryptedReceipts() {} };
  const service = new ReceiptService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  await assert.rejects(
    () => service.processCompleteReceipt({ paymentType: "CARD_PAYMENT", recipientEmail: "a@b.com" }, null),
    /Receipt template request cannot be null/
  );
});

test("receipt: rejects invalid email for sendReceiptViaEmail", async () => {
  const apiClient = { sendReceiptViaEmail() {} };
  const service = new ReceiptService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  await assert.rejects(
    () => service.sendReceiptViaEmail("not-an-email", {}),
    /Valid customer email/
  );
});

// ──────────────────── Credit Note Service ─────────────────────────

test("credit note: match → template → encrypt → send", async () => {
  const { publicKeyB64 } = rsaKeyPair();
  const apiClient = {
    async matchCustomer() {
      return {
        customerFound: true,
        matchId: "match-1",
        recipients: [{ id: "r1", publicKey: publicKeyB64, acceptedFormats: ["CHEQI"] }],
        buyerCountryCode: "NL",
        buyerType: "CONSUMER"
      };
    },
    async generateCreditNoteTemplate(request) {
      assert.deepEqual(request.formats, ["CHEQI"]);
      return { cheqi: { documentNumber: "CN-001" } };
    },
    async sendEncryptedCreditNotes(matchId, parentCheqiReceiptId, encryptedCreditNotes, templateHash) {
      assert.equal(matchId, "match-1");
      assert.equal(parentCheqiReceiptId, "receipt-1");
      assert.equal(encryptedCreditNotes.length, 1);
      assert.ok(templateHash);
      return { creditNoteCount: 1 };
    }
  };
  const service = new CreditNoteService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  const result = await service.processCompleteCreditNote(
    { paymentType: "CARD_PAYMENT", cheqiReceiptId: "receipt-1" },
    { documentNumber: "CN-001" }
  );
  assert.equal(result.success, true);
});

test("credit note: requires cheqiReceiptId", async () => {
  const apiClient = { matchCustomer() {}, generateCreditNoteTemplate() {}, sendEncryptedCreditNotes() {} };
  const service = new CreditNoteService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  await assert.rejects(
    () => service.processCompleteCreditNote(
      { paymentType: "CARD_PAYMENT", recipientEmail: "a@b.com" },
      { documentNumber: "CN-001" }
    ),
    /cheqiReceiptId.*required/
  );
});

test("credit note: returns customerNotFound", async () => {
  const apiClient = {
    async matchCustomer() { return { customerFound: false }; },
    async generateCreditNoteTemplate() { return {}; }
  };
  const service = new CreditNoteService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  const result = await service.processCompleteCreditNote(
    { paymentType: "CARD_PAYMENT", cheqiReceiptId: "r1" },
    { documentNumber: "CN-001" }
  );
  assert.equal(result.success, false);
  assert.equal(result.isCustomerNotFound(), true);
});

// ──────────────────── Retry Handler ───────────────────────────────

test("retry: retries on 500", async () => {
  let calls = 0;
  const handler = new RetryHandler({ maxRetries: 2, logger: new NoopLogger() });
  const result = await handler.executeWithRetry(async () => {
    calls++;
    if (calls < 3) return new Response("error", { status: 500 });
    return new Response("ok", { status: 200 });
  }, "testOp");
  assert.equal(result.status, 200);
  assert.equal(calls, 3);
});

test("retry: retries on 429 with Retry-After header", async () => {
  let calls = 0;
  const handler = new RetryHandler({ maxRetries: 1, logger: new NoopLogger() });
  const result = await handler.executeWithRetry(async () => {
    calls++;
    if (calls === 1) return new Response("rate limited", {
      status: 429,
      headers: { "Retry-After": "0" }
    });
    return new Response("ok", { status: 200 });
  }, "testOp");
  assert.equal(result.status, 200);
  assert.equal(calls, 2);
});

test("retry: throws after max retries on network error", async () => {
  const handler = new RetryHandler({ maxRetries: 1, baseDelayMs: 1, logger: new NoopLogger() });
  await assert.rejects(
    () => handler.executeWithRetry(async () => { throw new Error("ECONNRESET"); }, "testOp"),
    (err) => err.errorCode === "NETWORK_ERROR" && err.message.includes("ECONNRESET")
  );
});

test("retry: returns non-retryable error immediately", async () => {
  let calls = 0;
  const handler = new RetryHandler({ maxRetries: 3, logger: new NoopLogger() });
  const result = await handler.executeWithRetry(async () => {
    calls++;
    return new Response("not found", { status: 404 });
  }, "testOp");
  assert.equal(result.status, 404);
  assert.equal(calls, 1);
});

// ──────────────────── Verification ────────────────────────────────

test("RFC8785 canonicalization sorts keys", () => {
  assert.equal(canonicalizeJson({ z: 1, a: 2, m: 3 }), '{"a":2,"m":3,"z":1}');
});

test("verification: JSON hash is deterministic", () => {
  const service = new VerificationService();
  const receipt = { documentNumber: "INV-001", totalAmount: 121, currency: "EUR" };
  const hash1 = service.calculateCheqiReceiptHash(receipt);
  const hash2 = service.calculateCheqiReceiptHash(receipt);
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64); // SHA-256 hex
});

test("verification: XML hash ignores formatting", () => {
  const service = new VerificationService();
  const compactXml = "<Invoice><AccountingCustomerParty><Party><Name>Cheqi</Name></Party></AccountingCustomerParty></Invoice>";
  const formattedXml = `
    <Invoice>
      <AccountingCustomerParty>
        <Party>
          <Name>Cheqi</Name>
        </Party>
      </AccountingCustomerParty>
    </Invoice>
  `;
  assert.equal(service.canonicalizeAndHashXml(compactXml), service.canonicalizeAndHashXml(formattedXml));
  assert.equal(service.canonicalizeUbl(formattedXml), compactXml);
});

test("verification: verifyJsonHash returns true for matching hash", () => {
  const service = new VerificationService();
  const receipt = { documentNumber: "INV-001", totalAmount: 121 };
  const hash = service.canonicalizeAndHashJson(receipt);
  assert.equal(service.verifyJsonHash(receipt, hash), true);
  assert.equal(service.verifyJsonHash(receipt, "wrong"), false);
});

test("verification: verifyXmlHash returns true for matching hash", () => {
  const service = new VerificationService();
  const xml = "<Invoice><ID>1</ID></Invoice>";
  const hash = service.canonicalizeAndHashXml(xml);
  assert.equal(service.verifyXmlHash(xml, hash), true);
  assert.equal(service.verifyXmlHash(xml, "wrong"), false);
});

// ──────────────────── SDK ─────────────────────────────────────────

test("sdk: wires services together", () => {
  const sdk = new CheqiSDK({ environment: "https://sandbox.api.cheqi.io", ...NOOP }, {
    matchCustomer() {},
    generateReceiptTemplate() {},
    sendEncryptedReceipts() {}
  });
  assert.ok(sdk.receiptService);
  assert.ok(sdk.creditNoteService);
  assert.ok(sdk.companyService);
  assert.ok(sdk.storeService);
  assert.ok(sdk.verificationService);
  assert.ok(sdk.encryptionService);
  assert.ok(sdk.decryptionService);
  assert.ok(sdk.matchingService);
  assert.equal(typeof sdk.getReceiptService, "function");
});

test("sdk: builder mirrors java style", () => {
  const sdk = CheqiSDK.builder()
    .apiEndpoint("https://sandbox.api.cheqi.io")
    .apiKey("sk_test_123")
    .timeoutSeconds(10)
    .maxRetries(2)
    .logger(new NoopLogger())
    .build();
  assert.equal(sdk.getConfig().apiEndpoint, "https://sandbox.api.cheqi.io");
  assert.equal(sdk.getConfig().apiKey, "sk_test_123");
  assert.equal(sdk.getConfig().timeoutSeconds, 10);
  assert.equal(sdk.getConfig().maxRetries, 2);
});

test("sdk: builder accepts custom logger", () => {
  const messages = [];
  const sdk = CheqiSDK.builder()
    .apiEndpoint("https://sandbox.api.cheqi.io")
    .logger({ debug() {}, info(msg) { messages.push(msg); }, warn() {}, error() {} })
    .build();
  assert.ok(messages.some(m => m.includes("SDK configured")));
});

// ──────────────────── Model Builders ──────────────────────────────

test("model builders: IdentificationDetails", () => {
  const id = IdentificationDetails.builder()
    .paymentType("CARD_PAYMENT")
    .cardDetails(
      CardDetails.builder()
        .paymentAccountReference("PAR-123")
        .cardProvider("VISA")
        .build()
    )
    .recipientEmail("customer@example.com")
    .build();

  assert.equal(id.getRecipientEmail(), "customer@example.com");
  assert.equal(id.paymentType, "CARD_PAYMENT");
  assert.equal(id.cardDetails.paymentAccountReference, "PAR-123");
});

test("model builders: ReceiptTemplateRequest", () => {
  const req = ReceiptTemplateRequest.builder()
    .documentNumber("INV-001")
    .currency("EUR")
    .totalAmount(12.10)
    .addProduct(
      Product.builder()
        .name("Coffee")
        .quantity(1)
        .baseQuantity(1)
        .unitCode("C62")
        .unitPrice(10.00)
        .subtotal(10.00)
        .total(12.10)
        .build()
    )
    .build();

  assert.equal(req.documentNumber, "INV-001");
  assert.equal(req.products.length, 1);
  assert.equal(req.products[0].name, "Coffee");
});

test("model builders: Company", () => {
  const company = Company.builder()
    .companyName("Cheqi")
    .companyEmail("info@cheqi.io")
    .address(
      CompanyAddress.builder()
        .streetName("Main street 1")
        .cityName("Amsterdam")
        .postalZone("1012AB")
        .countryIsoCode("NL")
        .build()
    )
    .build();

  assert.equal(company.companyName, "Cheqi");
  assert.equal(company.address.countryIsoCode, "NL");
});

test("model builders: Company.toCompanyDTO()", () => {
  const company = Company.builder()
    .companyName("Test")
    .companyLegalName("Test BV")
    .taxNumber("NL123")
    .companyEmail("a@b.com")
    .address(CompanyAddress.builder().streetName("S").cityName("C").postalZone("1234").countryIsoCode("NL").build())
    .build();

  const dto = company.toCompanyDTO();
  assert.equal(dto.companyName, "Test");
  assert.equal(dto.address.streetName, "S");
  assert.equal(dto.address.countryIsoCode, "NL");
});

// ──────────────────── Entity Builders ─────────────────────────────

test("entity builders: PurchaseReceipt", () => {
  const id = Identifier.builder("INV-001").schemeID("DOC").build();
  const supplier = Party.builder([{ registrationName: "Cheqi BV" }], { cityName: "Amsterdam" }).build();
  const monetaryTotal = MonetaryTotal.builder(
    { value: "10.00", currencyID: "EUR" },
    { value: "10.00", currencyID: "EUR" },
    { value: "12.10", currencyID: "EUR" },
    { value: "12.10", currencyID: "EUR" }
  ).build();
  const paymentMeans = PaymentMeans.builder({ value: "48" }).build();
  const line = PurchaseReceiptLine.builder(id, { name: "Coffee" })
    .lineExtensionAmount({ value: "10.00", currencyID: "EUR" })
    .build();
  const receipt = PurchaseReceipt.builder(
    id, "2026-03-16", supplier, "EUR", monetaryTotal, [line]
  ).paymentMeans([paymentMeans]).receiptUuid("nonce-1").build();

  assert.equal(receipt.id.getValue(), "INV-001");
  assert.equal(receipt.documentCurrencyCode, "EUR");
  assert.equal(receipt.purchaseReceiptLines.length, 1);
  assert.equal(receipt.paymentMeans.length, 1);
});

// ──────────────────── Company/Store Validation ────────────────────

test("company validation: requires companyEmail", () => {
  const sdk = new CheqiSDK({ environment: "https://sandbox.api.cheqi.io", ...NOOP }, {
    provisionCompany() { throw new Error("should not reach"); }
  });
  assert.throws(
    () => sdk.getCompanyService().provisionCompany({ companyName: "Cheqi" }, "admin@example.com"),
    /companyEmail is required/
  );
});

test("company validation: rejects invalid admin email", () => {
  const sdk = new CheqiSDK({ environment: "https://sandbox.api.cheqi.io", ...NOOP }, {
    provisionCompany() { throw new Error("should not reach"); }
  });
  const company = Company.builder()
    .companyName("Cheqi")
    .companyEmail("info@cheqi.io")
    .address(CompanyAddress.builder().streetName("S").cityName("C").postalZone("1234").countryIsoCode("NL").build())
    .build();
  assert.throws(
    () => sdk.getCompanyService().provisionCompany(company, "not-an-email"),
    /Admin email must be a valid/
  );
});

test("store validation: requires access token", () => {
  const sdk = new CheqiSDK({ environment: "https://sandbox.api.cheqi.io", ...NOOP }, {
    createStore() { throw new Error("should not reach"); }
  });
  assert.throws(
    () => sdk.getStoreService().createStore("company-1", {
      storeName: "Main",
      storeCode: "MAIN",
      addressDto: { streetName: "A", cityName: "B", postalZone: "1234", countryIsoCode: "NL" }
    }),
    /Access token cannot be null or empty/
  );
});

test("store validation: requires storeName", () => {
  const sdk = new CheqiSDK({ environment: "https://sandbox.api.cheqi.io", ...NOOP }, {
    createStore() { throw new Error("should not reach"); }
  });
  assert.throws(
    () => sdk.getStoreService().createStore("company-1", {
      storeCode: "MAIN",
      addressDto: { streetName: "A", cityName: "B", postalZone: "1234", countryIsoCode: "NL" }
    }, "token-123"),
    /storeName is required/
  );
});

test("store validation: requires companyId", () => {
  const sdk = new CheqiSDK({ environment: "https://sandbox.api.cheqi.io", ...NOOP }, {
    getStores() { throw new Error("should not reach"); }
  });
  assert.throws(
    () => sdk.getStoreService().getStores("", undefined, "token"),
    /Company ID cannot be null/
  );
});

// ──────────────────── Email Validation ────────────────────────────

// ──────────────────── Java parity: number canonicalization ────────────────

test("canonicalization: preserves decimal scale from JSON string", () => {
  // Matches Java BigDecimal.toPlainString(): trailing zeros and scale preserved.
  assert.equal(canonicalizeJson('{"a":12.10}'), '{"a":12.10}');
  assert.equal(canonicalizeJson('{"a":121.00,"b":1}'), '{"a":121.00,"b":1}');
});

test("canonicalization: expands scientific notation to plain string", () => {
  assert.equal(canonicalizeJson('{"a":1.5E-3}'), '{"a":0.0015}');
  assert.equal(canonicalizeJson('{"a":1.230E1}'), '{"a":12.30}');
});

test("canonicalization: normalizes negative zero and sorts nested keys", () => {
  assert.equal(canonicalizeJson('{"a":-0}'), '{"a":0}');
  assert.equal(canonicalizeJson('{"z":1,"a":{"y":2.50,"x":3}}'), '{"a":{"x":3,"y":2.50},"z":1}');
});

// ──────────────────── Java parity: XML Exclusive C14N ──────────────────────

test("c14n: exclusive namespace placement and attribute sorting", () => {
  const input = `<?xml version="1.0"?>
    <cac:Invoice xmlns:cac="urn:cac" xmlns:cbc="urn:cbc">
      <cbc:ID>1</cbc:ID>
      <cac:Party b="2" a="1"/>
    </cac:Invoice>`;
  // cbc is only used by the child, so exclusive C14N renders it on cbc:ID (not the root);
  // attributes are sorted (a before b) and empty elements expand to start+end tags.
  assert.equal(
    canonicalizeXml(input),
    '<cac:Invoice xmlns:cac="urn:cac"><cbc:ID xmlns:cbc="urn:cbc">1</cbc:ID><cac:Party a="1" b="2"></cac:Party></cac:Invoice>'
  );
});

// ──────────────────── Java parity: key formats ─────────────────────────────

test("encryption: accepts raw PKCS#1 (iOS) public keys", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pkcs1Pub = publicKey.export({ type: "pkcs1", format: "der" }).toString("base64");
  const pkcs8Priv = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  const encrypted = new EncryptionService().encryptReceiptForRecipient('{"x":1}', { id: "r1", publicKey: pkcs1Pub });
  const decrypted = new DecryptionService().decryptReceipt(encrypted, pkcs8Priv);
  assert.equal(decrypted.receiptContent, '{"x":1}');
});

test("decryption: accepts PEM-wrapped private keys", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pemPriv = privateKey.export({ type: "pkcs8", format: "pem" });
  const spkiPub = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const encrypted = new EncryptionService().encryptReceiptForRecipient('{"y":2}', { id: "r2", publicKey: spkiPub });
  const decrypted = new DecryptionService().decryptReceipt(encrypted, pemPriv);
  assert.equal(decrypted.receiptContent, '{"y":2}');
});

// ──────────────────── Java parity: receipt processor merge ─────────────────

test("receipt processor: merges receiving party and payment means", () => {
  const { privateKeyB64, publicKeyB64 } = rsaKeyPair();
  const enc = new EncryptionService();
  const dec = new DecryptionService();
  const envelope = {
    cheqi: { documentNumber: "INV-1" },
    ublPurchaseReceipt: "<Receipt><cac:AccountingCustomerParty/></Receipt>"
  };
  const context = {
    receivingParty: {
      xmlReceivingParty: "<cac:AccountingCustomerParty>MERGED</cac:AccountingCustomerParty>",
      receivingParty: { consumerName: "Bob" }
    },
    paymentMeans: { xmlPaymentMeans: "<cac:PaymentMeans>PM</cac:PaymentMeans>" }
  };
  const encrypted = enc.encryptReceiptForRecipient(JSON.stringify(envelope), { id: "r3", publicKey: publicKeyB64 });
  const encryptedContext = enc.encryptReceiptForRecipient(JSON.stringify(context), { id: "r3", publicKey: publicKeyB64 });
  encrypted.encryptedCustomerDetails = encryptedContext.encryptedReceipt;
  encrypted.encryptedCustomerAesKey = encryptedContext.encryptedSymmetricKey;

  const merged = new ReceiptProcessor(dec).processEncryptedReceipt(encrypted, privateKeyB64);
  assert.equal(
    merged.receiptEnvelope.ublPurchaseReceipt,
    "<Receipt><cac:AccountingCustomerParty>MERGED</cac:AccountingCustomerParty><cac:PaymentMeans>PM</cac:PaymentMeans></Receipt>"
  );
  assert.equal(merged.receiptEnvelope.cheqi.receivingParty.consumerName, "Bob");
});

// ──────────────────── Java parity: credit note request parsing ─────────────

test("credit note: decryptCreditNoteRequest returns a parsed object", () => {
  const { privateKeyB64, publicKeyB64 } = rsaKeyPair();
  const enc = new EncryptionService();
  const dec = new DecryptionService();
  const request = {
    cheqiReceiptId: "receipt-9",
    returnReason: "DEFECTIVE",
    lineItems: [{ lineItemId: "L1", quantityReturned: 2, condition: "DAMAGED" }],
    refundPreference: "BANK_TRANSFER",
    refundBankAccount: { iban: "NL00BANK", accountHolder: "Bob" }
  };
  const encrypted = enc.encryptCreditNoteForRecipient(JSON.stringify(request), { id: "r1", publicKey: publicKeyB64 });
  const service = new CreditNoteService({}, enc, new MatchingService({}), dec);
  const parsed = service.decryptCreditNoteRequest(
    { encryptedCreditNoteInitiationRequest: encrypted.encryptedCreditNote, encryptedSymmetricKey: encrypted.encryptedSymmetricKey },
    privateKeyB64
  );
  assert.equal(parsed.cheqiReceiptId, "receipt-9");
  assert.equal(parsed.refundPreference, "BANK_TRANSFER");
  assert.equal(parsed.lineItems[0].condition, "DAMAGED");
  assert.equal(parsed.refundBankAccount.iban, "NL00BANK");
});

// ──────────────────── Java parity: delivery status ─────────────────────────

test("ReceiptResult: email delivery is not reported as customer-not-found", () => {
  const emailed = ReceiptResult.deliveredViaEmail("a@b.com");
  assert.equal(emailed.isSuccess(), true);
  assert.equal(emailed.isCustomerNotFound(), false);
  assert.equal(emailed.getDeliveryStatus(), "DELIVERED_EMAIL");

  const notFound = ReceiptResult.customerNotFound();
  assert.equal(notFound.isCustomerNotFound(), true);
  assert.equal(notFound.getDeliveryStatus(), "CUSTOMER_NOT_FOUND");

  const failed = ReceiptResult.failed("boom");
  assert.equal(failed.isSuccess(), false);
  assert.equal(failed.getDeliveryStatus(), "FAILED");
});

test("ReceiptResult: download fallback surfaces the public download URL", () => {
  const downloaded = ReceiptResult.deliveredViaDownload(
    { cheqiReceiptId: "rcpt_123", downloadUrl: "https://cheqi.io/d/abc" },
    "{}"
  );
  assert.equal(downloaded.isSuccess(), true);
  assert.equal(downloaded.isCustomerNotFound(), false);
  assert.equal(downloaded.getDeliveryStatus(), "DELIVERED_DOWNLOAD");
  assert.equal(downloaded.getDownloadUrl(), "https://cheqi.io/d/abc");

  // The app-delivery path carries no download URL.
  const app = ReceiptResult.deliveredToApp({ cheqiReceiptId: "rcpt_123" }, "{}");
  assert.equal(app.getDeliveryStatus(), "DELIVERED_DIGITAL");
  assert.equal(app.getDownloadUrl(), null);
});

// ──────────────────── HTTP parity: PATCH verbs ─────────────────────────────

test("client: activate/deactivate store use PATCH", async () => {
  const methods = [];
  const fetchImpl = async (_url, init) => {
    methods.push(init.method);
    return new Response(null, { status: 204 });
  };
  const client = new DefaultCheqiApiClient(
    new CheqiSDKConfig({ environment: "https://api.example.test", apiKey: "sk_test_1", logger: new NoopLogger() }),
    fetchImpl
  );
  await client.activateStore("c1", "s1", "token");
  await client.deactivateStore("c1", "s1", "token");
  assert.deepEqual(methods, ["PATCH", "PATCH"]);
});

test("email validation: rejects bare @", () => {
  const sdk = new CheqiSDK({ environment: "https://sandbox.api.cheqi.io", ...NOOP }, {
    provisionCompany() { throw new Error("should not reach"); }
  });
  assert.throws(
    () => sdk.getCompanyService().provisionCompany(
      Company.builder()
        .companyName("X")
        .companyEmail("bad@")
        .address(CompanyAddress.builder().streetName("S").cityName("C").postalZone("1234").countryIsoCode("NL").build())
        .build(),
      "admin@example.com"
    ),
    /companyEmail must be a valid email/
  );
});

// ──────────────────── Download links (offline-first QR route) ──────────────

test("download: generateDownloadLink produces contract-v1 id, key, and URL", async () => {
  const { generateDownloadLink, parseDownloadUrl } = await import("../dist/download/index.js");

  const link = generateDownloadLink("https://receipt.cheqi.io/");
  assert.match(link.downloadId, /^[A-Za-z0-9_-]{22}$/);
  assert.match(link.contentKey, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(link.url, `https://receipt.cheqi.io/${link.downloadId}#${link.contentKey}`);

  // Round-trips through the parser the download page uses.
  assert.deepEqual(parseDownloadUrl(link.url), {
    downloadId: link.downloadId,
    contentKey: link.contentKey
  });

  // Fresh entropy per call.
  const other = generateDownloadLink("https://receipt.cheqi.io");
  assert.notEqual(other.downloadId, link.downloadId);
  assert.notEqual(other.contentKey, link.contentKey);
});

test("download: envelope encrypt/decrypt round-trips the generated ReceiptEnvelope model", async () => {
  const { generateDownloadLink, encryptDownloadEnvelope, decryptDownloadEnvelope } =
    await import("../dist/download/index.js");

  const envelope = {
    cheqi: {
      documentNumber: "INV-42",
      currency: "EUR",
      totalAmount: 12.5,
      sellingParty: { companyName: "Test BV" }
    },
    ublPurchaseReceipt: "<PurchaseReceipt/>"
  };
  const link = generateDownloadLink("https://receipt.cheqi.io");

  const encrypted = await encryptDownloadEnvelope(envelope, link.contentKey);
  const decrypted = await decryptDownloadEnvelope(encrypted, link.contentKey);

  assert.equal(decrypted.cheqi.documentNumber, "INV-42");
  assert.equal(decrypted.cheqi.totalAmount, 12.5);
  assert.equal(decrypted.cheqi.sellingParty.companyName, "Test BV");
  assert.equal(decrypted.ublPurchaseReceipt, "<PurchaseReceipt/>");

  // Encrypt-once semantics: two encryptions of the same envelope differ (fresh IV),
  // which is exactly why retries must resend stored bytes rather than re-encrypt.
  const again = await encryptDownloadEnvelope(envelope, link.contentKey);
  assert.notEqual(again, encrypted);
});

test("download: wrong key and tampered ciphertext are rejected", async () => {
  const { generateDownloadLink, encryptDownloadEnvelope, decryptDownloadEnvelope } =
    await import("../dist/download/index.js");
  const { DecryptionError } = await import("../dist/errors.js");

  const link = generateDownloadLink("https://receipt.cheqi.io");
  const encrypted = await encryptDownloadEnvelope({ cheqi: { documentNumber: "X" } }, link.contentKey);

  const wrongKey = generateDownloadLink("https://receipt.cheqi.io").contentKey;
  await assert.rejects(() => decryptDownloadEnvelope(encrypted, wrongKey), DecryptionError);

  const bytes = Buffer.from(encrypted, "base64");
  bytes[bytes.length - 1] ^= 0xff;
  await assert.rejects(
    () => decryptDownloadEnvelope(bytes.toString("base64"), link.contentKey),
    DecryptionError
  );

  await assert.rejects(() => decryptDownloadEnvelope(encrypted, "too-short"), DecryptionError);
});

test("download: framing is byte-compatible with the SDK's node:crypto hybrid framing", async () => {
  const { generateDownloadLink, encryptDownloadEnvelope, decryptDownloadEnvelope } =
    await import("../dist/download/index.js");
  const { createDecipheriv, createCipheriv, randomBytes } = await import("node:crypto");

  const link = generateDownloadLink("https://receipt.cheqi.io");
  const keyBytes = Buffer.from(link.contentKey.replaceAll("-", "+").replaceAll("_", "/"), "base64");

  // WebCrypto-encrypted blob decrypts with the exact slicing DecryptionService.aesDecrypt uses.
  const encrypted = await encryptDownloadEnvelope({ cheqi: { documentNumber: "INTEROP" } }, link.contentKey);
  const combined = Buffer.from(encrypted, "base64");
  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12, combined.length - 16);
  const tag = combined.subarray(combined.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  assert.equal(JSON.parse(plaintext).cheqi.documentNumber, "INTEROP");

  // And the reverse: a node:crypto-encrypted blob decrypts via the WebCrypto module.
  const iv2 = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes, iv2);
  const body = Buffer.concat([cipher.update(JSON.stringify({ cheqi: { documentNumber: "REVERSE" } }), "utf8"), cipher.final()]);
  const nodeBlob = Buffer.concat([iv2, body, cipher.getAuthTag()]).toString("base64");
  const decrypted = await decryptDownloadEnvelope(nodeBlob, link.contentKey);
  assert.equal(decrypted.cheqi.documentNumber, "REVERSE");
});

test("client: uploadClientEncryptedReceipt posts the contract body to /receipt/download", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
    return new Response(
      JSON.stringify({ cheqiReceiptId: "CHQ-1", createdAt: "2026-07-14T10:00:00Z", expiresAt: "2027-07-14T10:00:00Z" }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  };
  const client = new DefaultCheqiApiClient(
    new CheqiSDKConfig({ environment: "https://api.example.test", apiKey: "sk_test_1", logger: new NoopLogger() }),
    fetchImpl
  );

  const response = await client.uploadClientEncryptedReceipt({
    downloadId: "Zk9qYx3vT1KpN8wL2sRd_g",
    ciphertext: "AAAA",
    templateHash: "abc123"
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.ok(calls[0].url.endsWith("/receipt/download"));
  assert.deepEqual(calls[0].body, {
    downloadId: "Zk9qYx3vT1KpN8wL2sRd_g",
    ciphertext: "AAAA",
    templateHash: "abc123"
  });
  assert.equal(response.cheqiReceiptId, "CHQ-1");
});

test("receipt service: deferred download uses the canonical template response", async () => {
  const { buildDownloadEnvelope, generateDownloadLink, encryptDownloadEnvelope, decryptDownloadEnvelope } =
    await import("../dist/download/index.js");
  const { ReceiptService } = await import("../dist/index.js");

  const link = generateDownloadLink("https://receipt.cheqi.io");

  let uploaded = null;
  const service = new ReceiptService(
    {
      generateReceiptTemplate: async () => ({
        cheqi: { documentNumber: "DEFERRED-1" },
        ublPurchaseReceipt: "<PurchaseReceipt/>",
        ublInvoice: "<Invoice/>",
        vatMetadata: { vatRegime: "DOMESTIC_B2C" }
      }),
      uploadClientEncryptedReceipt: async (request) => {
        uploaded = request;
        return { cheqiReceiptId: "CHQ-2" };
      }
    },
    null,
    null
  );

  // The integration retained its template request and link credentials while offline.
  // Once it schedules the work, the SDK obtains the canonical server template and only
  // then builds and encrypts the download envelope.
  const template = await service.generateReceiptTemplate({
    receiptTemplateRequest: { documentNumber: "DEFERRED-1" },
    formats: ["CHEQI", "UBL_PURCHASE_RECEIPT", "UBL_INVOICE"],
    taxesApplied: true
  });
  const ciphertext = await encryptDownloadEnvelope(buildDownloadEnvelope(template), link.contentKey);
  const response = await service.uploadClientEncryptedReceipt({ downloadId: link.downloadId, ciphertext });
  assert.equal(response.cheqiReceiptId, "CHQ-2");

  // The exact bytes the service uploaded decrypt with the key from the QR fragment.
  const decrypted = await decryptDownloadEnvelope(uploaded.ciphertext, link.contentKey);
  assert.equal(decrypted.cheqi.documentNumber, "DEFERRED-1");
  assert.equal(decrypted.ublPurchaseReceipt, "<PurchaseReceipt/>");
  assert.equal(decrypted.ublInvoice, "<Invoice/>");
  assert.equal(decrypted.vatMetaData.vatRegime, "DOMESTIC_B2C");

  // Validation guards.
  await assert.rejects(() => service.uploadClientEncryptedReceipt({ downloadId: "nope", ciphertext }), /downloadId/);
  await assert.rejects(
    () => service.uploadClientEncryptedReceipt({ downloadId: link.downloadId, ciphertext: "" }),
    /ciphertext/
  );
});

test("download: buildDownloadEnvelope requires a template response", async () => {
  const { buildDownloadEnvelope, EncryptionError } = await import("../dist/index.js");
  assert.throws(() => buildDownloadEnvelope(null), EncryptionError);
});

test("download: encrypt accepts plain-JSON envelopes with string dates (template responses)", async () => {
  const { generateDownloadLink, encryptDownloadEnvelope, decryptDownloadEnvelope } =
    await import("../dist/download/index.js");

  const link = generateDownloadLink("https://receipt.cheqi.io");
  // Exactly what generateReceiptTemplate returns: parsed JSON, issueDate as a string.
  const plainJsonEnvelope = {
    cheqi: { documentNumber: "PLAIN-1", issueDate: "2026-07-14T09:30:00Z", currency: "EUR", totalAmount: 5 }
  };

  const encrypted = await encryptDownloadEnvelope(plainJsonEnvelope, link.contentKey);
  const decrypted = await decryptDownloadEnvelope(encrypted, link.contentKey);

  assert.equal(decrypted.cheqi.documentNumber, "PLAIN-1");
  assert.equal(decrypted.cheqi.issueDate.toISOString(), "2026-07-14T09:30:00.000Z");
});
