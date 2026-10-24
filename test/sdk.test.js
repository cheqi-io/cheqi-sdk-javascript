import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { specsMatch } from "../scripts/check-spec.mjs";

import {
  CheqiApiError,
  CheqiSDK,
  CheqiSDKConfig,
  CheqiSDKError,
  CreditNoteService,
  DecryptionService,
  DownloadService,
  EncryptionService,
  Environment,
  FiscalizationStatus,
  MatchingService,
  NoopLogger,
  PaymentType,
  ReceiptService,
  ReceiptIssueState,
  SubmissionInProgressError,
  DefaultCheqiApiClient,
  ErrorCodes,
  StoreService,
  ReturnReasonCode,
  UnitCode,
  VerificationService,
  createCreditNoteInitiationRequest,
  createFiscalizationData,
  createJurisdictionalData,
  createProduct,
  createReceiptPayload,
  createTax,
  parseDownloadUrl,
  validateCreditNoteInitiationRequest
} from "../dist/index.js";

const NOOP = { logger: new NoopLogger() };

test("inviteUsers posts the email request and returns invitation outcomes", async () => {
  let captured;
  const sdk = new CheqiSDK({
    apiEndpoint: Environment.SANDBOX,
    apiKey: "api-key",
    fetch: async (url, init) => {
      captured = { url: String(url), init };
      return Response.json({ invitedEmails: ["employee@example.com"], pendingEmails: [], existingMembers: [] });
    }
  });
  assert.deepEqual(await sdk.companyService.inviteUsers("company-1", ["employee@example.com"], true, { accessToken: "oauth-token" }),
    { invitedEmails: ["employee@example.com"], pendingEmails: [], existingMembers: [] });
  assert.equal(captured.url, "https://sandbox.api.cheqi.io/company/company-1/invite/employees");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.Authorization, "Bearer oauth-token");
  assert.deepEqual(JSON.parse(captured.init.body), { emails: ["employee@example.com"], resendPending: true });
});

test("receipt destination and webhook methods use the production routes", async () => {
  const calls = [];
  const sdk = new CheqiSDK({
    apiEndpoint: Environment.SANDBOX,
    apiKey: "api-key",
    fetch: async (url, init) => {
      calls.push({ path: new URL(url).pathname, method: init.method, body: init.body });
      if (calls.length === 1 || calls.length === 3) return Response.json([]);
      if (calls.length === 5 || calls.length === 4) return new Response(null, { status: 204 });
      return Response.json({ id: "destination-1", notificationUrl: "https://example.com/hook" });
    }
  });
  assert.deepEqual(await sdk.companyService.listReceiptDestinations(), []);
  await sdk.companyService.registerReceiptDestination({ name: "ERP", publicKey: "key", keyAlgorithm: "RSA" });
  assert.deepEqual(await sdk.companyService.getPendingReceipts("destination-1"), []);
  await sdk.companyService.acknowledgeReceipts("destination-1", ["receipt-1"]);
  await sdk.companyService.deactivateReceiptDestination("destination-1");
  await sdk.webhookService.updateSubscriptionUrl("subscription-1", "https://example.com/hook");
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
    "GET /company/receipt-destinations",
    "POST /company/receipt-destinations",
    "GET /company/receipt-destinations/destination-1/receipts/queue",
    "POST /company/receipt-destinations/destination-1/receipts/queue/acknowledge",
    "DELETE /company/receipt-destinations/destination-1",
    "PATCH /webhook/subscription/subscription-1"
  ]);
  assert.deepEqual(JSON.parse(calls[3].body), { receiptIds: ["receipt-1"] });
  assert.deepEqual(JSON.parse(calls[5].body), { notificationUrl: "https://example.com/hook" });
});

function rsaKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKeyB64: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    publicKeyB64: publicKey.export({ type: "spki", format: "der" }).toString("base64")
  };
}

function receiptPayload() {
  return createReceiptPayload({
    documentNumber: "R-100",
    issueDate: new Date("2026-07-29T10:00:00Z"),
    currency: "EUR",
    receiptSubtotal: "10.10",
    totalBeforeTax: "10.10",
    totalTaxAmount: "2.24",
    totalAmount: "12.34",
    taxesApplied: true,
    products: [{
      name: "Coffee",
      identifier: "COFFEE-1",
      quantity: 1,
      unitCode: UnitCode.C62,
      unitPrice: "10.10",
      subtotal: "10.10",
      total: "12.34"
    }]
  });
}

test("config aligns standard API and receipt environments", () => {
  assert.equal(
    new CheqiSDKConfig({ apiEndpoint: Environment.PRODUCTION, ...NOOP }).receiptDownloadBaseUrl,
    "https://receipt.cheqi.io"
  );
  assert.equal(
    new CheqiSDKConfig({ apiEndpoint: Environment.SANDBOX, ...NOOP }).receiptDownloadBaseUrl,
    "https://sandbox.receipt.cheqi.io"
  );
  assert.equal(
    new CheqiSDKConfig({ apiEndpoint: Environment.TEST, ...NOOP }).receiptDownloadBaseUrl,
    "https://test.receipt.cheqi.io"
  );
});

test("config validates endpoint, timeout, and retries", () => {
  assert.throws(() => new CheqiSDKConfig({ apiEndpoint: "", ...NOOP }), /apiEndpoint.*required/);
  assert.throws(
    () => new CheqiSDKConfig({ apiEndpoint: Environment.TEST, timeoutSeconds: 0, ...NOOP }),
    /Timeout must be positive/
  );
  assert.throws(
    () => new CheqiSDKConfig({ apiEndpoint: Environment.TEST, maxRetries: -1, ...NOOP }),
    /cannot be negative/
  );
});

test("config accepts backend-issued sk_ API keys without a format warning", () => {
  const warnings = [];
  const logger = {
    debug() {},
    info() {},
    warn(message) { warnings.push(message); },
    error() {}
  };

  const config = new CheqiSDKConfig({
    apiEndpoint: Environment.TEST,
    apiKey: "sk_generatedKeyWithoutEnvironmentPrefix",
    logger
  });

  assert.equal(config.apiKey, "sk_generatedKeyWithoutEnvironmentPrefix");
  assert.deepEqual(warnings, []);
});

test("SDK options support custom endpoints and Fetch transports", async () => {
  const requests = [];
  const customFetch = async (url) => {
    requests.push(String(url));
    return Response.json({ routeFound: false });
  };

  const custom = new CheqiSDK({
    apiEndpoint: "https://merchant.example/api",
    apiKey: "sk_test_example",
    fetch: customFetch,
    logger: new NoopLogger()
  });
  assert.equal(custom.config.apiEndpoint, "https://merchant.example/api");
  assert.equal(custom.config.environment, null);
  assert.equal(custom.config.receiptDownloadBaseUrl, null);
  await custom.apiClient.matchCustomer({ recipientEmail: "buyer@example.com" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0], "https://merchant.example/api/recipient/resolve");

  const standard = new CheqiSDK({
    apiEndpoint: Environment.TEST,
    apiKey: "sk_test_example",
    logger: new NoopLogger()
  });
  assert.equal(standard.config.apiEndpoint, Environment.TEST);
  assert.equal(standard.config.environment, Environment.TEST);
  assert.equal(standard.config.receiptDownloadBaseUrl, "https://test.receipt.cheqi.io");
});

test("Java error-code aliases participate in SDK error classification", () => {
  assert.equal(
    new CheqiSDKError("expired", { errorCode: "INVALID_ACCESS_TOKEN" }).isAuthenticationError(),
    true
  );
  assert.equal(
    new CheqiSDKError("forbidden", { errorCode: "INSUFFICIENT_PERMISSIONS" }).isAuthorizationError(),
    true
  );
});

test("SDK exposes the same primary services as Java v2.1", () => {
  const sdk = new CheqiSDK({
    apiEndpoint: Environment.SANDBOX,
    apiKey: "sk_test_example",
    logger: new NoopLogger()
  });
  assert.ok(sdk.receiptService);
  assert.ok(sdk.creditNoteService);
  assert.ok(sdk.encryptionService);
  assert.ok(sdk.decryptionService);
  assert.ok(sdk.downloadService);
  assert.ok(sdk.matchingService);
  assert.ok(sdk.storeService);
  assert.ok(sdk.verificationService);
});

test("public construction API uses JavaScript options and plain objects", async () => {
  const sdkModule = await import("../dist/index.js");
  assert.equal("CheqiSDKBuilder" in sdkModule, false);
  assert.equal("ReceiptPayloadBuilder" in sdkModule, false);
  assert.equal(Object.getPrototypeOf(receiptPayload()), Object.prototype);
});

test("payload factories preserve caller-supplied decimal values", () => {
  const payload = receiptPayload();
  assert.equal(payload.receiptSubtotal, 10.1);
  assert.equal(payload.totalAmount, 12.34);
  assert.equal(payload.products[0].unitCode, "C62");
  assert.deepEqual(payload.products[0].taxes, []);
  assert.throws(() => createReceiptPayload({ documentNumber: "missing-fields" }), /issueDate is required/);
  const tax = createTax({
    rate: 21,
    type: "VAT",
    taxableAmount: "10.00",
    amount: "2.10"
  });
  assert.equal(tax.amount, 2.1);
  const jurisdiction = createJurisdictionalData({
    countryCode: "NL",
    fiscalization: createFiscalizationData({
      system: "NL-FISCAL",
      status: FiscalizationStatus.FISCALIZED,
      additionalFields: [{ code: "authorityId", value: "AUTH-1", label: "Authority" }]
    }),
    legalTexts: [{ code: "RETURN_NOTICE", text: "Returns within 30 days", languageCode: "en" }]
  });
  assert.equal(jurisdiction.fiscalization.additionalFields[0].code, "authorityId");
});

test("payload factories reject non-finite and unsafe numeric values", () => {
  assert.throws(
    () => createReceiptPayload({ ...receiptPayload(), receiptSubtotal: "not-a-number" }),
    /receiptSubtotal must be a finite number/
  );
  assert.throws(
    () => createProduct({ ...receiptPayload().products[0], unitPrice: Number.POSITIVE_INFINITY }),
    /Product unitPrice must be a finite number/
  );
  assert.throws(
    () => createProduct({ ...receiptPayload().products[0], total: "9007199254740993" }),
    /safe integer range/
  );
});

test("encryption produces the current per-device payload shape", async () => {
  const { publicKeyB64 } = rsaKeyPair();
  const encrypted = await new EncryptionService().encryptForDevice("{\"hello\":\"world\"}", {
    id: "device-1",
    publicKey: publicKeyB64
  });
  assert.equal(encrypted.deviceRecipientId, "device-1");
  assert.ok(encrypted.encryptedContent);
  assert.ok(encrypted.encryptedAesKey);
  assert.equal("recipientId" in encrypted, false);
  assert.equal("publicKey" in encrypted, false);
});

test("encryption rejects incomplete temporary recipients", async () => {
  const encryption = new EncryptionService();
  await assert.rejects(() => encryption.encryptForDevice("{}", null), /recipient cannot be null/);
  await assert.rejects(() => encryption.encryptForDevice("{}", { id: "", publicKey: "key" }), /recipient.id/);
  await assert.rejects(() => encryption.encryptForDevice("{}", { id: "device", publicKey: "" }), /recipient.publicKey/);
  await assert.rejects(() => encryption.encryptForDevice("", { id: "device", publicKey: "key" }), /plaintextJson/);
});

test("receipt issuance sends one unchanged definitive payload per owner device", async () => {
  const plaintexts = [];
  const recipients = [
    { id: "device-1", publicKey: "key-1" },
    { id: "device-2", publicKey: "key-2" }
  ];
  let submitted;
  const apiClient = {
    async matchCustomer() {
      return { routeFound: true, matchId: "match-123", recipients };
    },
    async submitEncryptedReceipt(envelope) {
      submitted = envelope;
      return {
        cheqiReceiptId: "CHQ-123",
        matchId: "match-123",
        status: "PENDING",
        createdAt: new Date("2026-07-29T10:15:30Z")
      };
    },
    async uploadEncryptedDownloadReceipt() { throw new Error("unreachable"); }
  };
  const encryption = {
    encryptReceiptForRecipient(plaintext, recipient) {
      plaintexts.push(plaintext);
      return {
        deviceRecipientId: recipient.id,
        encryptedContent: `cipher-${recipient.id}`,
        encryptedAesKey: `key-${recipient.id}`
      };
    }
  };
  const service = new ReceiptService(
    apiClient,
    encryption,
    new MatchingService(apiClient)
  );
  const storeId = "706920f8-63a7-4d9d-a92a-5889545562ce";
  const result = await service.issueReceipt(
    { recipientEmail: "buyer@example.com" },
    receiptPayload(),
    { storeId }
  );

  assert.equal(result.isAccepted(), true);
  assert.equal(result.getCheqiReceiptId(), "CHQ-123");
  assert.equal(result.getDeliveryRouteType(), "DIGITAL");
  assert.equal(plaintexts.length, 2);
  assert.equal(plaintexts[0], plaintexts[1]);
  assert.equal(JSON.parse(plaintexts[0]).documentNumber, "R-100");
  assert.equal("receiptTemplateRequest" in JSON.parse(plaintexts[0]), false);
  assert.equal(submitted.storeId, storeId);
  assert.equal(submitted.deviceDeliveries.length, 2);
});

test("receipt issuance forwards the per-call OAuth token", async () => {
  let matchedToken;
  let submittedToken;
  const apiClient = {
    async matchCustomer(_request, options) {
      matchedToken = options?.accessToken;
      return {
        routeFound: true,
        deliveryRouteType: "DIGITAL",
        matchId: "match-token",
        recipients: [{ id: "device-1", publicKey: rsaKeyPair().publicKeyB64 }]
      };
    },
    async submitEncryptedReceipt(_envelope, options) {
      submittedToken = options?.accessToken;
      return { cheqiReceiptId: "CHQ-TOKEN", matchId: "match-token", status: "PENDING" };
    },
    async uploadEncryptedDownloadReceipt() { throw new Error("unreachable"); }
  };
  const service = new ReceiptService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  await service.issueReceipt({ recipientEmail: "buyer@example.com" }, receiptPayload(), { accessToken: "oauth-access-token" });
  assert.equal(matchedToken, "oauth-access-token");
  assert.equal(submittedToken, "oauth-access-token");
});

test("receipt issuance rejects a missing route instead of synthesizing customer-not-found", async () => {
  const apiClient = {
    async matchCustomer() { return { routeFound: false }; },
    async submitEncryptedReceipt() { throw new Error("unreachable"); },
    async uploadEncryptedDownloadReceipt() { throw new Error("unreachable"); }
  };
  const service = new ReceiptService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  await assert.rejects(
    () => service.issueReceipt({ recipientEmail: "buyer@example.com" }, receiptPayload()),
    (error) => error.errorCode === "CUSTOMER_NOT_FOUND" && error.httpStatusCode === 404
  );
});

test("email fallback is explicit and performs no encryption or email delivery", async () => {
  let encrypted = false;
  const apiClient = {
    async matchCustomer() {
      return {
        routeFound: true,
        deliveryRouteType: "EMAIL_FALLBACK",
        matchId: "match-email",
        expiresAt: new Date("2026-08-05T00:00:00Z")
      };
    },
    async submitEncryptedReceipt() { throw new Error("unreachable"); },
    async uploadEncryptedDownloadReceipt() { throw new Error("unreachable"); }
  };
  const service = new ReceiptService(
    apiClient,
    { encryptReceiptForRecipient() { encrypted = true; } },
    new MatchingService(apiClient)
  );
  const result = await service.issueReceipt({ recipientEmail: "buyer@example.com" }, receiptPayload());
  assert.equal(result.isAccepted(), false);
  assert.equal(result.isEmailReceiptRequired(), true);
  assert.equal(result.getDeliveryRouteType(), "EMAIL_FALLBACK");
  assert.equal(encrypted, false);
});

test("download fallback with payment context is completed client-side", async () => {
  let upload;
  const apiClient = {
    async matchCustomer() {
      return { routeFound: true, deliveryRouteType: "DOWNLOAD_FALLBACK", matchId: "match-download" };
    },
    async submitEncryptedReceipt() { throw new Error("unreachable"); },
    async uploadEncryptedDownloadReceipt(request) {
      upload = request;
      return { cheqiReceiptId: "CHQ-DL", createdAt: new Date() };
    }
  };
  const service = new ReceiptService(
    apiClient,
    new EncryptionService(),
    new MatchingService(apiClient),
    "https://receipt.example"
  );
  const identification = {
    paymentType: PaymentType.CARD_PAYMENT,
    cardDetails: {
      cardProvider: "VISA",
      paymentAccountReference: "PAR-123",
      lastFourDigits: "4242"
    }
  };
  const result = await service.issueReceipt(identification, receiptPayload());
  assert.equal(result.isAccepted(), true);
  assert.equal(result.getDeliveryRouteType(), "DOWNLOAD_FALLBACK");
  assert.ok(upload.templateHash);

  const downloadService = new DownloadService();
  const { contentKey } = parseDownloadUrl(result.getDownloadUrl());
  const envelope = await downloadService.decryptDownloadEnvelope(upload.ciphertext, contentKey);
  assert.equal(envelope.envelopeVersion, 2);
  const document = JSON.parse(envelope.documents.RECEIPT_PAYLOAD.content);
  const identificationDetails = JSON.parse(envelope.documents.IDENTIFICATION_DETAILS.content);
  assert.equal(document.documentNumber, "R-100");
  assert.equal(document.identificationDetails, undefined);
  assert.equal(identificationDetails.cardDetails.paymentAccountReference, "PAR-123");
  assert.equal(identificationDetails.cardDetails.lastFourDigits, "4242");
});

test("download fallback without payment type requests a final envelope", async () => {
  const apiClient = {
    async matchCustomer() {
      return { routeFound: true, deliveryRouteType: "DOWNLOAD_FALLBACK", matchId: "match-manual" };
    },
    async submitEncryptedReceipt() { throw new Error("unreachable"); },
    async uploadEncryptedDownloadReceipt() { throw new Error("unreachable"); }
  };
  const service = new ReceiptService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  const result = await service.issueReceipt({ recipientEmail: "buyer@example.com" }, receiptPayload());
  assert.equal(result.isDownloadEnvelopeRequired(), true);
  assert.equal(result.getMatchId(), "match-manual");
});

test("explicit cash download skips recipient matching", async () => {
  let matches = 0;
  const apiClient = {
    async matchCustomer() { matches += 1; throw new Error("must not match"); },
    async submitEncryptedReceipt() { throw new Error("unreachable"); },
    async uploadEncryptedDownloadReceipt() { return { cheqiReceiptId: "CHQ-CASH" }; }
  };
  const service = new ReceiptService(
    apiClient,
    new EncryptionService(),
    new MatchingService(apiClient),
    "https://receipt.example"
  );
  const result = await service.issueDownloadReceipt({ paymentType: PaymentType.CASH }, receiptPayload());
  assert.equal(result.isAccepted(), true);
  assert.equal(matches, 0);
});

test("credit notes use their own generated envelope and preserve plaintext", async () => {
  let submitted;
  let plaintext;
  const recipient = { id: "device-1", publicKey: "key" };
  const apiClient = {
    async matchCustomer() {
      return { routeFound: true, matchId: "match-credit", recipients: [recipient] };
    },
    async submitEncryptedCreditNote(envelope) {
      submitted = envelope;
      return { cheqiReceiptId: "CHQ-CN-1", matchId: "match-credit", status: "PENDING" };
    }
  };
  const encryption = {
    encryptCreditNoteForRecipient(value) {
      plaintext = value;
      return { deviceRecipientId: "device-1", encryptedContent: "cipher", encryptedAesKey: "key" };
    }
  };
  const service = new CreditNoteService(apiClient, encryption, new MatchingService(apiClient));
  const result = await service.issueCreditNote(
    { cheqiReceiptId: "CHQ-PARENT" },
    "CHQ-PARENT",
    { documentNumber: "CN-1", totalAmount: 5 }
  );
  assert.equal(result.isAccepted(), true);
  assert.equal(result.getParentCheqiReceiptId(), "CHQ-PARENT");
  assert.equal(JSON.parse(plaintext).documentNumber, "CN-1");
  assert.equal(submitted.parentCheqiReceiptId, "CHQ-PARENT");
  assert.equal(submitted.deviceDeliveries.length, 1);
});

test("queued and webhook receipt envelopes decrypt to the complete ReceiptEnvelope", async () => {
  const { privateKeyB64, publicKeyB64 } = rsaKeyPair();
  const expected = {
    cheqiReceiptId: "CHQ-20260730-000001",
    documents: { CHEQI: { mediaType: "application/json", content: "{\"ok\":true}" } },
    envelopeVersion: 1,
    receiptGeneratorVersion: "2.1.0",
    receiptUuid: "706920f8-63a7-4d9d-a92a-5889545562ce"
  };
  const encrypted = await new EncryptionService().encryptForDevice(JSON.stringify(expected), {
    id: "device-1",
    publicKey: publicKeyB64
  });
  const queued = {
    encryptedEnvelope: encrypted.encryptedContent,
    encryptedEnvelopeKey: encrypted.encryptedAesKey
  };
  const webhook = {
    companyId: "company-1",
    encryptedEnvelope: encrypted.encryptedContent,
    encryptedEnvelopeKey: encrypted.encryptedAesKey
  };
  const decryption = new DecryptionService();
  assert.deepEqual(JSON.parse(JSON.stringify(await decryption.decryptReceipt(queued, privateKeyB64))), expected);
  assert.deepEqual(JSON.parse(JSON.stringify(await decryption.decryptReceipt(webhook, privateKeyB64))), expected);
});

test("queued and webhook credit-note initiation requests decrypt and validate", async () => {
  const { privateKeyB64, publicKeyB64 } = rsaKeyPair();
  const expected = {
    cheqiReceiptId: "CHQ-20260730-000001",
    receiptId: "merchant-receipt-1",
    lineItems: [{ productId: "SKU-1", quantity: 1, reasonCode: ReturnReasonCode.DAMAGED }],
    refundPreference: "ORIGINAL_PAYMENT_METHOD"
  };
  const encrypted = await new EncryptionService().encryptForDevice(JSON.stringify(expected), {
    id: "device-1",
    publicKey: publicKeyB64
  });
  const queued = {
    encryptedCreditNoteInitiationRequest: encrypted.encryptedContent,
    encryptedSymmetricKey: encrypted.encryptedAesKey
  };
  const webhook = { companyId: "company-1", ...queued };
  const decryption = new DecryptionService();
  assert.deepEqual(await decryption.decryptCreditNoteInitiationRequest(queued, privateKeyB64), expected);
  assert.deepEqual(await decryption.decryptCreditNoteInitiationRequest(webhook, privateKeyB64), expected);
});

test("credit-note initiation validation matches Java merchant-side rules", () => {
  const built = createCreditNoteInitiationRequest({
    cheqiReceiptId: "CHQ-1",
    receiptId: "R-1",
    lineItems: [{
      productId: "SKU",
      quantity: 1,
      reasonCode: ReturnReasonCode.DAMAGED,
      reasonDescription: "Seal broken"
    }],
    refundPreference: "ORIGINAL_PAYMENT_METHOD"
  });
  assert.equal(built.lineItems[0].productId, "SKU");
  assert.throws(
    () => validateCreditNoteInitiationRequest({
      cheqiReceiptId: "CHQ-1",
      receiptId: "R-1",
      lineItems: [{ productId: "SKU", quantity: 0, reasonCode: "DAMAGED" }],
      refundPreference: "ORIGINAL_PAYMENT_METHOD"
    }),
    /quantity must be greater than zero/
  );
  assert.throws(
    () => validateCreditNoteInitiationRequest({
      cheqiReceiptId: "CHQ-1",
      receiptId: "R-1",
      lineItems: [{ productId: "SKU", quantity: 1, reasonCode: "DAMAGED" }],
      refundPreference: "BANK_TRANSFER"
    }),
    /refundBankAccount is required/
  );
  assert.throws(
    () => validateCreditNoteInitiationRequest({
      cheqiReceiptId: "CHQ-1",
      receiptId: "R-1",
      lineItems: [{ productId: "SKU", quantity: 1, reasonCode: "NOT_A_REASON" }],
      refundPreference: "ORIGINAL_PAYMENT_METHOD"
    }),
    /reasonCode is invalid/
  );
  assert.throws(
    () => validateCreditNoteInitiationRequest({
      cheqiReceiptId: "CHQ-1",
      receiptId: "R-1",
      lineItems: [{ productId: "SKU", quantity: 1, reasonCode: "DAMAGED" }],
      refundPreference: "NOT_A_REFUND_METHOD"
    }),
    /refundPreference is invalid/
  );
  assert.throws(
    () => createCreditNoteInitiationRequest({
      cheqiReceiptId: "CHQ-1",
      receiptId: "R-1",
      lineItems: [{ productId: "SKU", quantity: 1, reasonCode: "NOT_A_REASON" }],
      refundPreference: "ORIGINAL_PAYMENT_METHOD"
    }),
    /reasonCode is invalid/
  );
});

test("download service round-trips current receipt envelopes", async () => {
  const downloads = new DownloadService();
  const link = downloads.generateDownloadLink("https://receipt.example/");
  assert.equal(link.downloadId.length, 22);
  assert.equal(link.url.includes("#"), true);
  const envelope = {
    cheqiReceiptId: "CHQ-1",
    documents: {},
    envelopeVersion: 1,
    receiptGeneratorVersion: "2.1.0",
    receiptUuid: "706920f8-63a7-4d9d-a92a-5889545562ce"
  };
  const encrypted = await downloads.encryptDownloadEnvelope(envelope, link.contentKey);
  assert.deepEqual(JSON.parse(JSON.stringify(await downloads.decryptDownloadEnvelope(encrypted, link.contentKey))), envelope);
  assert.equal(
    downloads.generateDownloadLink(Environment.PRODUCTION).url.startsWith("https://receipt.cheqi.io/"),
    true
  );
  assert.equal(
    downloads.generateDownloadLink(Environment.SANDBOX).url.startsWith("https://sandbox.receipt.cheqi.io/"),
    true
  );
  assert.throws(() => downloads.generateDownloadLink(""), /baseUrl cannot be null or empty/);
  assert.throws(() => downloads.parseDownloadUrl("https://receipt.example/not-valid#bad"), /downloadId/);
});

test("verification canonicalizes JSON before hashing", async () => {
  const verification = new VerificationService();
  assert.equal(
    await verification.calculateCheqiReceiptHash('{"b":2,"a":1}'),
    await verification.calculateCheqiReceiptHash('{"a":1,"b":2}')
  );
});

test("XML verification retains canonicalization and async SHA-256", async () => {
  const verification = new VerificationService();
  const xml = '<root xmlns="urn:test"><child a="1">value</child></root>';
  const canonical = verification.canonicalizeUbl(xml);
  assert.equal(canonical, xml);
  const hash = await verification.calculateUblHash(xml);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(await verification.verifyXmlHash(xml, hash), true);
  assert.equal(await verification.verifyXmlHash(xml, "bad"), false);
});

test("default HTTP client posts the v2 encrypted envelope unchanged", async () => {
  let requestUrl;
  let requestBody;
  const fetchImpl = async (url, init) => {
    requestUrl = String(url);
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      cheqiReceiptId: "CHQ-HTTP",
      matchId: "match-http",
      status: "PENDING",
      createdAt: "2026-08-04T10:00:00Z"
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const sdk = new CheqiSDKConfig({
    apiEndpoint: Environment.TEST,
    apiKey: "sk_test_http",
    maxRetries: 0,
    ...NOOP
  });
  const { DefaultCheqiApiClient } = await import("../dist/index.js");
  const client = new DefaultCheqiApiClient(sdk, fetchImpl);
  const response = await client.submitEncryptedReceipt({
    matchId: "match-http",
    deviceDeliveries: [{
      deviceRecipientId: "device-1",
      encryptedContent: "cipher",
      encryptedAesKey: "key"
    }]
  });
  assert.equal(requestUrl, "https://test.api.cheqi.io/receipt/encrypted");
  assert.equal(requestBody.matchId, "match-http");
  assert.equal(requestBody.deviceDeliveries[0].deviceRecipientId, "device-1");
  assert.equal(response.cheqiReceiptId, "CHQ-HTTP");
  assert.equal(response.createdAt instanceof Date, true);
});

test("HTTP submission validates required envelope fields before fetch", async () => {
  const { DefaultCheqiApiClient } = await import("../dist/index.js");
  const client = new DefaultCheqiApiClient(
    new CheqiSDKConfig({ apiEndpoint: Environment.TEST, apiKey: "sk_test_http", ...NOOP }),
    async () => { throw new Error("fetch should not run"); }
  );
  await assert.rejects(
    () => client.submitEncryptedReceipt({ matchId: "", deviceDeliveries: [] }),
    (error) => error instanceof CheqiApiError && error.errorCode === "INVALID_REQUEST"
  );
});

test("store active-only filtering uses the OpenAPI active query parameter", async () => {
  const requestUrls = [];
  const { DefaultCheqiApiClient } = await import("../dist/index.js");
  const client = new DefaultCheqiApiClient(
    new CheqiSDKConfig({ apiEndpoint: Environment.TEST, apiKey: "sk_test_http", ...NOOP }),
    async (url) => {
      requestUrls.push(String(url));
      return new Response("[]", { status: 200 });
    }
  );

  await client.getStores("company-1", true);
  await client.getStores("company-1", false);

  assert.equal(requestUrls[0], "https://test.api.cheqi.io/company/company-1/stores?active=true");
  assert.equal(requestUrls[1], "https://test.api.cheqi.io/company/company-1/stores");
});

test("store service validates inputs and delegates every store operation", async () => {
  const calls = [];
  const apiClient = {
    async createStore(...args) { calls.push(["create", ...args]); return { id: "store-1" }; },
    async getStores(...args) { calls.push(["list", ...args]); return []; },
    async getStore(...args) { calls.push(["get", ...args]); return { id: "store-1" }; },
    async updateStore(...args) { calls.push(["update", ...args]); return { id: "store-1" }; },
    async deleteStore(...args) { calls.push(["delete", ...args]); },
    async activateStore(...args) { calls.push(["activate", ...args]); },
    async deactivateStore(...args) { calls.push(["deactivate", ...args]); }
  };
  const service = new StoreService(apiClient);
  const request = {
    storeName: "Amsterdam",
    storeCode: "AMS-1",
    addressDto: {
      streetName: "Dam 1",
      cityName: "Amsterdam",
      postalZone: "1012JS",
      countryIsoCode: "NL"
    }
  };

  const options = { accessToken: "oauth-token" };
  await service.createStore("company-1", request, options);
  await service.getStores("company-1");
  await service.getStores("company-1", undefined, options);
  await service.getActiveStores("company-1", options);
  await service.getStore("company-1", "store-1", options);
  await service.updateStore("company-1", "store-1", { storeName: "Updated" }, options);
  await service.deleteStore("company-1", "store-1", options);
  await service.activateStore("company-1", "store-1", options);
  await service.deactivateStore("company-1", "store-1", options);

  assert.deepEqual(calls.map(([operation]) => operation), [
    "create", "list", "list", "list", "get", "update", "delete", "activate", "deactivate"
  ]);
  assert.equal(calls[3][2], true);
  assert.equal(calls[4][3], options);
  assert.throws(() => service.getStores("", undefined, options), /Company ID cannot be null/);
  assert.throws(() => service.getStore("company-1", "", options), /Store ID cannot be null/);
  assert.throws(
    () => service.createStore("company-1", { storeName: "", addressDto: {} }, options),
    /storeName is required.*streetName is required.*countryIsoCode is required/
  );
  assert.throws(
    () => service.updateStore("company-1", "store-1", null, options),
    /Store request cannot be null/
  );
});

test("non-idempotent POST requests are not automatically retried", async () => {
  let attempts = 0;
  const { DefaultCheqiApiClient } = await import("../dist/index.js");
  const client = new DefaultCheqiApiClient(
    new CheqiSDKConfig({
      apiEndpoint: Environment.TEST,
      apiKey: "sk_test_http",
      maxRetries: 3,
      ...NOOP
    }),
    async () => {
      attempts += 1;
      throw new Error("connection reset after request write");
    }
  );

  await assert.rejects(
    () => client.submitEncryptedReceipt({
      matchId: "match-http",
      deviceDeliveries: [{
        deviceRecipientId: "device-1",
        encryptedContent: "cipher",
        encryptedAesKey: "key"
      }]
    }),
    (error) => error instanceof CheqiApiError && error.errorCode === "NETWORK_ERROR"
  );
  assert.equal(attempts, 1);
});

test("explicitly idempotent encrypted downloads retain transient retries", async () => {
  let attempts = 0;
  const { DefaultCheqiApiClient } = await import("../dist/index.js");
  const client = new DefaultCheqiApiClient(
    new CheqiSDKConfig({
      apiEndpoint: Environment.TEST,
      apiKey: "sk_test_http",
      maxRetries: 1,
      ...NOOP
    }),
    async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("temporary", { status: 500, headers: { "Retry-After": "0" } });
      }
      return new Response(JSON.stringify({ cheqiReceiptId: "CHQ-DOWNLOAD" }), { status: 201 });
    }
  );

  const response = await client.uploadEncryptedDownloadReceipt({
    downloadId: "Zk9qYx3vT1KpN8wL2sRd_g",
    ciphertext: "ciphertext"
  });
  assert.equal(attempts, 2);
  assert.equal(response.cheqiReceiptId, "CHQ-DOWNLOAD");
});

test("default HTTP client covers the remaining service endpoint contracts", async () => {
  const requests = [];
  const { DefaultCheqiApiClient } = await import("../dist/index.js");
  const client = new DefaultCheqiApiClient(
    new CheqiSDKConfig({ apiEndpoint: Environment.TEST, apiKey: "sk_test_http", ...NOOP }),
    async (url, init) => {
      const path = new URL(url).pathname;
      requests.push([init.method, path]);
      if (path === "/recipient/resolve") {
        return Response.json({ routeFound: true, matchId: "match-1", recipients: [] });
      }
      if (path === "/credit-note/encrypted") {
        return Response.json({ cheqiReceiptId: "CHQ-CREDIT", matchId: "match-1" }, { status: 202 });
      }
      if (path === "/receipt/email") {
        return new Response(null, { status: 201 });
      }
      if (path === "/company/company-1/stores" && init.method === "POST") {
        return Response.json({ id: "store-1" }, { status: 201 });
      }
      if (path === "/company/company-1/stores/store-1" && init.method === "GET") {
        return Response.json({ id: "store-1" });
      }
      if (path === "/company/company-1/stores/store-1" && init.method === "PUT") {
        return Response.json({ id: "store-1", storeName: "Updated" });
      }
      return new Response(null, { status: 204 });
    }
  );

  await client.matchCustomer({ recipientEmail: "buyer@example.com" });
  await client.submitEncryptedCreditNote({
    matchId: "match-1",
    parentCheqiReceiptId: "CHQ-PARENT",
    deviceDeliveries: [{
      deviceRecipientId: "device-1",
      encryptedContent: "cipher",
      encryptedAesKey: "key"
    }]
  });
  await client.sendReceiptViaEmail("buyer@example.com", { receiptId: "R-1" });
  await client.createStore("company-1", {
    storeName: "Amsterdam",
    storeCode: "AMS-1",
    addressDto: {
      streetName: "Dam 1",
      cityName: "Amsterdam",
      postalZone: "1012JS",
      countryIsoCode: "NL"
    }
  });
  await client.getStore("company-1", "store-1");
  await client.updateStore("company-1", "store-1", { storeName: "Updated" });
  await client.deleteStore("company-1", "store-1");
  await client.activateStore("company-1", "store-1");
  await client.deactivateStore("company-1", "store-1");

  assert.deepEqual(requests, [
    ["POST", "/recipient/resolve"],
    ["POST", "/credit-note/encrypted"],
    ["POST", "/receipt/email"],
    ["POST", "/company/company-1/stores"],
    ["GET", "/company/company-1/stores/store-1"],
    ["PUT", "/company/company-1/stores/store-1"],
    ["DELETE", "/company/company-1/stores/store-1"],
    ["PATCH", "/company/company-1/stores/store-1/activate"],
    ["PATCH", "/company/company-1/stores/store-1/deactivate"]
  ]);
});

test("HTTP errors retain diagnostics without logging response bodies", async () => {
  const errorLogs = [];
  const logger = {
    debug() {},
    info() {},
    warn() {},
    error(message) { errorLogs.push(message); }
  };
  const { DefaultCheqiApiClient } = await import("../dist/index.js");
  const client = new DefaultCheqiApiClient(
    new CheqiSDKConfig({
      apiEndpoint: Environment.TEST,
      apiKey: "sk_test_http",
      maxRetries: 0,
      logger
    }),
    async () => new Response(JSON.stringify({ message: "private backend detail" }), {
      status: 400,
      headers: { "x-correlation-id": "correlation-1" }
    })
  );

  await assert.rejects(
    () => client.getStore("company-1", "store-1"),
    (error) => error instanceof CheqiApiError &&
      error.errorCode === "INVALID_REQUEST" &&
      error.correlationId === "correlation-1" &&
      error.message.includes("private backend detail")
  );
  assert.equal(errorLogs.length, 1);
  assert.equal(errorLogs[0].includes("private backend detail"), false);
});

test("HTTP client rejects successful non-JSON responses", async () => {
  const { DefaultCheqiApiClient } = await import("../dist/index.js");
  const client = new DefaultCheqiApiClient(
    new CheqiSDKConfig({ apiEndpoint: Environment.TEST, apiKey: "sk_test_http", ...NOOP }),
    async () => new Response("not json", { status: 200 })
  );

  await assert.rejects(
    () => client.getStore("company-1", "store-1"),
    (error) => error instanceof CheqiApiError && error.errorCode === "INVALID_RESPONSE"
  );
});

test("HTTP client applies Java response-shape semantics", async () => {
  const { DefaultCheqiApiClient } = await import("../dist/index.js");
  const config = new CheqiSDKConfig({
    apiEndpoint: Environment.TEST,
    apiKey: "sk_test_http",
    ...NOOP
  });
  const emptyClient = new DefaultCheqiApiClient(
    config,
    async () => new Response(null, {
      status: 200,
      headers: { "x-correlation-id": "empty-response" }
    })
  );
  await assert.rejects(
    () => emptyClient.getStore("company-1", "store-1"),
    (error) => error instanceof CheqiApiError &&
      error.errorCode === "INVALID_RESPONSE" &&
      error.correlationId === "empty-response"
  );
  assert.deepEqual(await emptyClient.getStores("company-1"), []);

  const wrongListClient = new DefaultCheqiApiClient(
    config,
    async () => Response.json({ id: "not-a-list" })
  );
  await assert.rejects(
    () => wrongListClient.getStores("company-1"),
    (error) => error instanceof CheqiApiError && error.errorCode === "INVALID_RESPONSE"
  );
});

function recoveryService(overrides = {}) {
  const calls = { matches: 0, snapshots: [], submissions: [], uploads: [], plaintext: [] };
  const api = {
    async matchCustomer() {
      calls.matches++;
      return { routeFound: true, matchId: "original-match", deliveryRouteType: "DIGITAL",
        recipients: [{ id: "original-device", publicKey: "key" }] };
    },
    async getMatch(id, options) {
      calls.snapshots.push({ id, token: options?.accessToken });
      return { matchId: id, state: "MATCHED", route: "DIGITAL",
        recipients: [{ id: "original-device", publicKey: "key" }] };
    },
    async submitEncryptedReceipt(envelope, options) {
      calls.submissions.push({ envelope, token: options?.accessToken });
      return { cheqiReceiptId: "CHQ-ORIGINAL", matchId: envelope.matchId, status: "PENDING" };
    },
    async uploadEncryptedDownloadReceipt(request, options) {
      calls.uploads.push({ request: { ...request }, token: options?.accessToken });
      return { cheqiReceiptId: "CHQ-DOWNLOAD" };
    },
    ...overrides
  };
  const encryption = {
    encryptReceiptForRecipient(plaintext, recipient) {
      calls.plaintext.push(plaintext);
      return { deviceRecipientId: recipient.id, encryptedContent: "cipher", encryptedAesKey: "key" };
    }
  };
  return { calls, service: new ReceiptService(api, encryption, new MatchingService(api)) };
}

for (const failure of [
  new CheqiApiError("offline", { errorCode: ErrorCodes.NETWORK_ERROR }),
  new CheqiApiError("timeout", { errorCode: ErrorCodes.TIMEOUT_ERROR }),
  new CheqiApiError("busy", { httpStatusCode: 503 }),
  new CheqiApiError("rate limit", { httpStatusCode: 429 }),
  new CheqiApiError("invalid JSON", { errorCode: ErrorCodes.INVALID_RESPONSE, httpStatusCode: 202 }),
  new SubmissionInProgressError(7)
]) {
  test(`ambiguous submission ${failure.errorCode}/${failure.httpStatusCode} prepares a durable download`, async () => {
    const { service, calls } = recoveryService({ async submitEncryptedReceipt() { throw failure; } });
    const payload = receiptPayload();
    const result = await service.issueReceipt({ recipientEmail: "private@example.com" }, payload);
    assert.equal(result.state, ReceiptIssueState.DIGITAL_PENDING);
    assert.equal(result.matchId, "original-match");
    assert.equal(result.retryable, true);
    assert.equal(result.isAccepted(), false);
    assert.equal(result.retryAfterSeconds, failure instanceof SubmissionInProgressError ? 7 : null);
    assert.equal(calls.uploads.length, 0);
    const persisted = JSON.parse(JSON.stringify(result.preparedDownload));
    assert.equal(persisted.downloadUrl, result.downloadUrl);
    const { contentKey, downloadId } = parseDownloadUrl(persisted.downloadUrl);
    assert.equal(downloadId, persisted.uploadRequest.downloadId);
    assert.equal(JSON.stringify(persisted.uploadRequest).includes(contentKey), false);
    const envelope = await new DownloadService().decryptDownloadEnvelope(persisted.uploadRequest.ciphertext, contentKey);
    assert.equal(envelope.envelopeVersion, 2);
    assert.deepEqual(JSON.parse(envelope.documents.RECEIPT_PAYLOAD.content), JSON.parse(JSON.stringify(payload)));
    assert.equal(envelope.documents.IDENTIFICATION_DETAILS, undefined);
    assert.equal(envelope.documents.RECEIPT_PAYLOAD.content.includes("private@example.com"), false);
    await service.uploadPreparedDownload(persisted, { accessToken: "company-token" });
    await service.uploadPreparedDownload(persisted, { accessToken: "company-token" });
    assert.deepEqual(calls.uploads[0], calls.uploads[1]);
    assert.deepEqual(calls.uploads[0].request, persisted.uploadRequest);
    assert.equal(calls.uploads[0].token, "company-token");
    assert.equal(calls.matches, 1);
  });
}

test("unreachable matching prepares a payload-only download without submission or upload", async () => {
  const { service, calls } = recoveryService({ async matchCustomer() {
    throw new CheqiApiError("offline", { errorCode: ErrorCodes.NETWORK_ERROR });
  } });
  const result = await service.issueReceipt({ recipientEmail: "private@example.com" }, receiptPayload());
  assert.equal(result.state, ReceiptIssueState.DOWNLOAD_FALLBACK);
  assert.equal(result.matchId, null);
  assert.equal(result.retryable, true);
  assert.equal(result.isAccepted(), false);
  assert.ok(result.preparedDownload);
  assert.equal(calls.submissions.length, 0);
  assert.equal(calls.uploads.length, 0);
});

test("download upload failure retains its original ciphertext and payment context", async () => {
  let failedUpload;
  const { service } = recoveryService({ async uploadEncryptedDownloadReceipt(request) {
    failedUpload = { ...request };
    throw new CheqiApiError("offline", { errorCode: ErrorCodes.NETWORK_ERROR });
  } });
  const identification = { paymentType: PaymentType.CASH };
  const result = await service.issueDownloadReceipt(identification, receiptPayload());
  assert.equal(result.state, ReceiptIssueState.DOWNLOAD_FALLBACK);
  assert.deepEqual(result.preparedDownload.uploadRequest, failedUpload);
  const { contentKey } = parseDownloadUrl(result.downloadUrl);
  const envelope = await new DownloadService().decryptDownloadEnvelope(failedUpload.ciphertext, contentKey);
  assert.equal(envelope.envelopeVersion, 2);
  assert.deepEqual(JSON.parse(envelope.documents.IDENTIFICATION_DETAILS.content), identification);
});

test("resume returns the original submission without matching, encryption or uploads", async () => {
  const submission = { cheqiReceiptId: "CHQ-ORIGINAL", matchId: "original-match", status: "COMPLETED" };
  const { service, calls } = recoveryService({ async getMatch() {
    return { matchId: "original-match", state: "SUBMITTED", submission };
  } });
  const result = await service.resumeReceipt("original-match", receiptPayload());
  assert.equal(result.state, ReceiptIssueState.DIGITAL_SUBMITTED);
  assert.equal(result.submission, submission);
  assert.equal(result.isAccepted(), true);
  assert.equal(calls.matches + calls.submissions.length + calls.uploads.length + calls.plaintext.length, 0);
});

test("resume MATCHED uses the original device snapshot and JavaScript options", async () => {
  const { service, calls } = recoveryService();
  const payload = receiptPayload();
  const result = await service.resumeReceipt("original-match", payload, { storeId: "store", accessToken: "oauth" });
  assert.equal(result.state, ReceiptIssueState.DIGITAL_SUBMITTED);
  assert.equal(calls.matches, 0);
  assert.deepEqual(calls.snapshots, [{ id: "original-match", token: "oauth" }]);
  assert.equal(calls.submissions[0].token, "oauth");
  assert.equal(calls.submissions[0].envelope.storeId, "store");
  assert.equal(calls.submissions[0].envelope.deviceDeliveries[0].deviceRecipientId, "original-device");
  assert.deepEqual(JSON.parse(calls.plaintext[0]), JSON.parse(JSON.stringify(payload)));
  assert.equal(result.preparedDownload, null);
});

for (const state of ["IN_PROGRESS", "EXPIRED"]) {
  test(`resume ${state} performs no encryption or upload`, async () => {
    const { service, calls } = recoveryService({ async getMatch() {
      return { matchId: "original-match", state, retryAfterSeconds: 5 };
    } });
    const result = await service.resumeReceipt("original-match", receiptPayload());
    assert.equal(result.state, state === "EXPIRED" ? ReceiptIssueState.DIGITAL_EXPIRED : ReceiptIssueState.DIGITAL_PENDING);
    assert.equal(result.retryable, state !== "EXPIRED");
    assert.equal(result.retryAfterSeconds, state === "EXPIRED" ? null : 5);
    assert.equal(result.preparedDownload, null);
    assert.equal(result.downloadUrl, null);
    assert.equal(calls.matches + calls.submissions.length + calls.plaintext.length + calls.uploads.length, 0);
  });
}

test("submission expiry and recovery network failure produce typed states", async () => {
  const expired = recoveryService({ async submitEncryptedReceipt() {
    throw new CheqiApiError("expired", { httpStatusCode: 410 });
  } });
  const result = await expired.service.issueReceipt({ paymentType: PaymentType.CARD_PAYMENT }, receiptPayload());
  assert.equal(result.state, ReceiptIssueState.DIGITAL_EXPIRED);
  assert.equal(result.retryable, false);
  assert.equal(result.preparedDownload, null);
  const offline = recoveryService({ async getMatch() {
    throw new CheqiApiError("offline", { errorCode: ErrorCodes.NETWORK_ERROR });
  } });
  assert.equal((await offline.service.resumeReceipt("id", receiptPayload())).state, ReceiptIssueState.DIGITAL_PENDING);
});

for (const status of [400, 401, 403, 404, 409]) {
  test(`permanent ${status} errors preserve diagnostics and do not prepare fallback`, async () => {
    const failure = new CheqiApiError("failed", { httpStatusCode: status, correlationId: "trace" });
    for (const operation of ["matchCustomer", "submitEncryptedReceipt", "getMatch"]) {
      const { service, calls } = recoveryService({ async [operation]() { throw failure; } });
      await assert.rejects(() => operation === "getMatch"
        ? service.resumeReceipt("original-match", receiptPayload())
        : service.issueReceipt({ paymentType: PaymentType.CASH }, receiptPayload()),
      (error) => error instanceof CheqiSDKError && error.httpStatusCode === status && error.correlationId === "trace");
      assert.equal(calls.uploads.length, 0);
    }
  });
}

test("invalid payloads fail before matching and malformed snapshots fail before encryption", async () => {
  const { service, calls } = recoveryService();
  for (const payload of [null, {}, { ...receiptPayload(), products: [null] }, { ...receiptPayload(), taxesApplied: null }]) {
    await assert.rejects(() => service.issueReceipt({ paymentType: PaymentType.CASH }, payload), /receiptPayload/);
    await assert.rejects(() => service.resumeReceipt("id", payload), /receiptPayload/);
  }
  assert.equal(calls.matches + calls.snapshots.length, 0);
  for (const match of [null, {}, { matchId: "wrong", state: "EXPIRED" },
    { matchId: "id", state: "SUBMITTED", submission: { cheqiReceiptId: "receipt", matchId: "wrong" } },
    { matchId: "id", state: "MATCHED", route: "DOWNLOAD_FALLBACK", recipients: [{}] },
    { matchId: "id", state: "MATCHED", route: "DIGITAL", recipients: [null] }]) {
    const invalid = recoveryService({ async getMatch() { return match; } });
    await assert.rejects(() => invalid.service.resumeReceipt("id", receiptPayload()), (error) => error.errorCode === ErrorCodes.VALIDATION_ERROR);
    assert.equal(invalid.calls.plaintext.length, 0);
  }
});

test("envelope generation accepts both generated match types without HTTP", async () => {
  const { service, calls } = recoveryService();
  const recipients = [{ id: "device", publicKey: "key" }];
  for (const match of [
    { routeFound: true, deliveryRouteType: "DIGITAL", matchId: "id", recipients },
    { state: "MATCHED", route: "DIGITAL", matchId: "id", recipients }
  ]) {
    const envelope = await service.generateEncryptedReceiptEnvelope(match, receiptPayload(), "store");
    assert.equal(envelope.matchId, "id");
    assert.equal(envelope.storeId, "store");
    assert.equal(envelope.deviceDeliveries[0].deviceRecipientId, "device");
  }
  await assert.rejects(() => service.generateEncryptedReceiptEnvelope({ state: "SUBMITTED", route: "DIGITAL" }, receiptPayload()), /MATCHED/);
  assert.equal(calls.matches + calls.snapshots.length + calls.submissions.length, 0);
});

test("HTTP match retrieval encodes the opaque id, authenticates and hydrates generated dates", async () => {
  let request;
  const client = new DefaultCheqiApiClient(new CheqiSDKConfig({ apiEndpoint: Environment.TEST, apiKey: "api-key", maxRetries: 0, ...NOOP }),
    async (url, init) => {
      request = { url: String(url), ...init };
      return Response.json({ matchId: "id /?", state: "SUBMITTED", expiresAt: "2026-09-29T10:00:00Z",
        submission: { cheqiReceiptId: "receipt", matchId: "id /?", createdAt: "2026-09-29T09:00:00Z" } });
    });
  const match = await client.getMatch("id /?", { accessToken: "oauth-token" });
  assert.equal(request.url, "https://test.api.cheqi.io/recipient/matches/id%20%2F%3F");
  assert.equal(request.headers.Authorization, "Bearer oauth-token");
  assert.equal(request.method, "GET");
  assert.equal(request.body, undefined);
  assert.ok(match.expiresAt instanceof Date);
  assert.ok(match.submission.createdAt instanceof Date);
  await assert.rejects(() => client.getMatch(" "), (error) => error.errorCode === ErrorCodes.INVALID_REQUEST);
});

test("both HTTP submission endpoints handle IN_PROGRESS before receipt deserialization", async () => {
  let count = 0;
  const client = new DefaultCheqiApiClient(new CheqiSDKConfig({ apiEndpoint: Environment.TEST, apiKey: "api-key", ...NOOP }),
    async () => { count++; return Response.json({ state: "IN_PROGRESS", retryAfterSeconds: 9 }, { status: 202 }); });
  const envelope = { matchId: "id", parentCheqiReceiptId: "parent", deviceDeliveries: [{}] };
  for (const method of ["submitEncryptedReceipt", "submitEncryptedCreditNote"]) {
    await assert.rejects(() => client[method](envelope), (error) => error instanceof SubmissionInProgressError && error.retryAfterSeconds === 9 && error.isRetryable);
  }
  assert.equal(count, 2);
});

test("successful malformed HTTP submissions return pending without a second POST", async () => {
  for (const body of ["not json", "null", "[]", "{}", JSON.stringify({ cheqiReceiptId: "receipt", matchId: "wrong" })]) {
    let submissions = 0;
    const sdk = new CheqiSDK({ apiEndpoint: Environment.TEST, apiKey: "key", ...NOOP,
      fetch: async (url) => {
        if (new URL(url).pathname === "/recipient/resolve") {
          return Response.json({ routeFound: true, deliveryRouteType: "DIGITAL", matchId: "id", recipients: [{ id: "device", publicKey: "key" }] });
        }
        submissions++;
        return new Response(body, { status: 202 });
      }
    });
    sdk.encryptionService.encryptReceiptForRecipient = () => ({ deviceRecipientId: "device", encryptedContent: "cipher", encryptedAesKey: "key" });
    const result = await sdk.receiptService.issueReceipt({ paymentType: PaymentType.CASH }, receiptPayload());
    assert.equal(result.state, ReceiptIssueState.DIGITAL_PENDING);
    assert.equal(result.matchId, "id");
    assert.equal(submissions, 1);
  }
});

test("missing authentication fails before fetch and is not treated as an outage", async () => {
  let requests = 0;
  const sdk = new CheqiSDK({ apiEndpoint: Environment.TEST, ...NOOP,
    fetch: async () => { requests++; throw new Error("unreachable"); } });
  await assert.rejects(() => sdk.receiptService.issueReceipt({ paymentType: PaymentType.CASH }, receiptPayload()),
    (error) => error.errorCode === ErrorCodes.AUTHENTICATION_FAILED && error.httpStatusCode === 401);
  assert.equal(requests, 0);
});

test("an interrupted submission response returns pending with an encrypted fallback", async () => {
  const sdk = new CheqiSDK({ apiEndpoint: Environment.TEST, apiKey: "key", ...NOOP,
    fetch: async (url) => {
      if (new URL(url).pathname === "/recipient/resolve") {
        return Response.json({ routeFound: true, deliveryRouteType: "DIGITAL", matchId: "id", recipients: [{ id: "device", publicKey: "key" }] });
      }
      return new Response(new ReadableStream({ start(controller) { controller.error(new Error("connection closed")); } }), { status: 202 });
    }
  });
  sdk.encryptionService.encryptReceiptForRecipient = () => ({ deviceRecipientId: "device", encryptedContent: "cipher", encryptedAesKey: "key" });
  const result = await sdk.receiptService.issueReceipt({ paymentType: PaymentType.CASH }, receiptPayload());
  assert.equal(result.state, ReceiptIssueState.DIGITAL_PENDING);
  assert.ok(result.preparedDownload);
});

test("generated expense metadata survives wallet and download decryption", async () => {
  const { privateKeyB64, publicKeyB64 } = rsaKeyPair();
  const envelope = {
    cheqiReceiptId: "receipt", envelopeVersion: 1, receiptGeneratorVersion: "v1",
    receiptUuid: "706920f8-63a7-4d9d-a92a-5889545562ce", documents: {},
    expenseSubmission: {
      expenseSubmissionId: "expense", targetCompanyId: "company", submittedByUserId: "user",
      submittedAt: new Date("2026-09-29T10:00:00Z"), reason: "Business lunch"
    }
  };
  const encrypted = await new EncryptionService().encryptForDevice(JSON.stringify(envelope), { id: "device", publicKey: publicKeyB64 });
  const decrypted = await new DecryptionService().decryptReceipt({
    encryptedEnvelope: encrypted.encryptedContent, encryptedEnvelopeKey: encrypted.encryptedAesKey
  }, privateKeyB64);
  assert.deepEqual(decrypted, envelope);
  const downloads = new DownloadService();
  const link = downloads.generateDownloadLink(Environment.TEST);
  const ciphertext = await downloads.encryptDownloadEnvelope(envelope, link.contentKey);
  assert.deepEqual(await downloads.decryptDownloadEnvelope(ciphertext, link.contentKey), envelope);
});

test("issuance passes a UUID-shaped access token through the options object unchanged", async () => {
  const { service, calls } = recoveryService();
  const accessToken = "706920f8-63a7-4d9d-a92a-5889545562ce";
  await service.issueReceipt({ paymentType: PaymentType.CASH }, receiptPayload(), { storeId: "store", accessToken });
  assert.equal(calls.submissions[0].token, accessToken);
  assert.equal(calls.submissions[0].envelope.storeId, "store");
});

test("credit-note issuance accepts the shared JavaScript options object", async () => {
  let submission;
  const api = {
    async matchCustomer(_request, options) {
      assert.equal(options?.accessToken, "oauth");
      return { routeFound: true, matchId: "match", recipients: [{ id: "device", publicKey: "key" }] };
    },
    async submitEncryptedCreditNote(envelope, options) {
      submission = { envelope, token: options?.accessToken };
      return { cheqiReceiptId: "credit", matchId: "match" };
    }
  };
  const service = new CreditNoteService(api, {
    encryptCreditNoteForRecipient() { return { deviceRecipientId: "device", encryptedContent: "cipher", encryptedAesKey: "key" }; }
  }, new MatchingService(api));
  const result = await service.issueCreditNote({ paymentType: PaymentType.CASH }, "parent", { refund: 10 }, { storeId: "store", accessToken: "oauth" });
  assert.equal(result.isAccepted(), true);
  assert.equal(submission.token, "oauth");
  assert.equal(submission.envelope.storeId, "store");
});

test("an unreadable permanent HTTP error retains its status instead of preparing fallback", async () => {
  const sdk = new CheqiSDK({ apiEndpoint: Environment.TEST, apiKey: "key", ...NOOP,
    fetch: async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("closed")); } }), { status: 401 })
  });
  await assert.rejects(() => sdk.receiptService.issueReceipt({ paymentType: PaymentType.CASH }, receiptPayload()),
    (error) => error.httpStatusCode === 401 && error.errorCode === ErrorCodes.AUTHENTICATION_FAILED);
});

test("OpenAPI drift comparison ignores mapping order but rejects contract changes", () => {
  const local = 'openapi: 3.0.1\ninfo: {title: Cheqi, version: v1}\ncomponents:\n  schemas:\n    Receipt:\n      type: object\n      required: [id]\n';
  const reordered = 'components:\n  schemas:\n    Receipt: {required: [id], type: object}\ninfo: {version: v1, title: Cheqi}\nopenapi: 3.0.1\n';
  assert.equal(specsMatch(local, reordered), true);
  assert.equal(specsMatch(local, reordered.replace('[id]', '[id, matchId]')), false);
  assert.equal(specsMatch(local, reordered.replace('type: object', 'type: string')), false);
  assert.equal(specsMatch(local, reordered.replace('Receipt:', 'OtherReceipt:')), false);
});

test("per-call access tokens override the API key and nothing is cached between calls", async () => {
  const authorizations = [];
  const sdk = new CheqiSDK({ apiEndpoint: Environment.TEST, apiKey: "api-key", ...NOOP,
    fetch: async (_url, init) => { authorizations.push(init.headers.Authorization); return Response.json([]); } });
  await sdk.companyService.listReceiptDestinations({ accessToken: "customer-a" });
  await sdk.companyService.listReceiptDestinations({ accessToken: "customer-b" });
  await sdk.companyService.listReceiptDestinations();
  assert.deepEqual(authorizations, ["Bearer customer-a", "Bearer customer-b", "Bearer api-key"]);
});

test("requestAccessToken posts snake_case client credentials for one Grant without a bearer", async () => {
  let request;
  const sdk = new CheqiSDK({ apiEndpoint: Environment.TEST, apiKey: "api-key", ...NOOP,
    fetch: async (url, init) => {
      request = { url: String(url), ...init };
      return Response.json({ access_token: "company-token", token_type: "bearer", expires_in: 900, scope: "receipt:issue" });
    } });
  const token = await sdk.oauthService.requestAccessToken({
    client_id: "client", client_secret: "secret", grant_id: "9f5968f2-93b7-4b4e-a1c3-7220a92f7d98", scope: "receipt:issue"
  });
  assert.equal(token.access_token, "company-token");
  assert.equal(token.expires_in, 900);
  assert.equal(request.url, "https://test.api.cheqi.io/oauth2/token");
  assert.equal(request.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(request.body), {
    grant_type: "client_credentials", client_id: "client", client_secret: "secret",
    grant_id: "9f5968f2-93b7-4b4e-a1c3-7220a92f7d98", scope: "receipt:issue"
  });
  await assert.rejects(() => sdk.oauthService.requestAccessToken({ client_id: "client", client_secret: "secret" }),
    (error) => error.errorCode === ErrorCodes.INVALID_REQUEST);
});

test("per-call maxRetries and timeoutSeconds override the configured values", async () => {
  let attempts = 0;
  const sdk = new CheqiSDK({ apiEndpoint: Environment.TEST, apiKey: "api-key", maxRetries: 3, ...NOOP,
    fetch: async () => { attempts++; return new Response("{}", { status: 503, headers: { "Retry-After": "0" } }); } });
  await assert.rejects(() => sdk.companyService.listReceiptDestinations({ maxRetries: 0 }));
  assert.equal(attempts, 1);

  let signal;
  const slow = new CheqiSDK({ apiEndpoint: Environment.TEST, apiKey: "api-key", maxRetries: 0, ...NOOP,
    fetch: async (_url, init) => { signal = init.signal; return Response.json([]); } });
  await slow.companyService.listReceiptDestinations({ timeoutSeconds: 0.05 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(signal.aborted, true);
});

test("malformed per-call options are rejected before any request", async () => {
  let requests = 0;
  const sdk = new CheqiSDK({ apiEndpoint: Environment.TEST, apiKey: "api-key", ...NOOP,
    fetch: async () => { requests++; return Response.json([]); } });
  await assert.rejects(() => sdk.receiptService.issueReceipt({ paymentType: PaymentType.CASH }, receiptPayload(), { accessToken: " " }),
    (error) => error.errorCode === ErrorCodes.VALIDATION_ERROR);
  await assert.rejects(() => sdk.companyService.listReceiptDestinations({ maxRetries: -1 }),
    (error) => error.errorCode === ErrorCodes.VALIDATION_ERROR);
  assert.equal(requests, 0);
});
