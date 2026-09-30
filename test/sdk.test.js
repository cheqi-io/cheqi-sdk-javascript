import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

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

test("encryption produces the current per-device payload shape", () => {
  const { publicKeyB64 } = rsaKeyPair();
  const encrypted = new EncryptionService().encryptForDevice("{\"hello\":\"world\"}", {
    id: "device-1",
    publicKey: publicKeyB64
  });
  assert.equal(encrypted.deviceRecipientId, "device-1");
  assert.ok(encrypted.encryptedContent);
  assert.ok(encrypted.encryptedAesKey);
  assert.equal("recipientId" in encrypted, false);
  assert.equal("publicKey" in encrypted, false);
});

test("encryption rejects incomplete temporary recipients", () => {
  const encryption = new EncryptionService();
  assert.throws(() => encryption.encryptForDevice("{}", null), /recipient cannot be null/);
  assert.throws(() => encryption.encryptForDevice("{}", { id: "", publicKey: "key" }), /recipient.id/);
  assert.throws(() => encryption.encryptForDevice("{}", { id: "device", publicKey: "" }), /recipient.publicKey/);
  assert.throws(() => encryption.encryptForDevice("", { id: "device", publicKey: "key" }), /plaintextJson/);
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
    storeId
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

test("receipt issuance forwards a three-argument OAuth token", async () => {
  let matchedToken;
  let submittedToken;
  const apiClient = {
    async matchCustomer(_request, token) {
      matchedToken = token;
      return {
        routeFound: true,
        deliveryRouteType: "DIGITAL",
        matchId: "match-token",
        recipients: [{ id: "device-1", publicKey: rsaKeyPair().publicKeyB64 }]
      };
    },
    async submitEncryptedReceipt(_envelope, token) {
      submittedToken = token;
      return { cheqiReceiptId: "CHQ-TOKEN", matchId: "match-token", status: "PENDING" };
    },
    async uploadEncryptedDownloadReceipt() { throw new Error("unreachable"); }
  };
  const service = new ReceiptService(apiClient, new EncryptionService(), new MatchingService(apiClient));
  await service.issueReceipt({ recipientEmail: "buyer@example.com" }, receiptPayload(), "oauth-access-token");
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

test("queued and webhook receipt envelopes decrypt to the complete ReceiptEnvelope", () => {
  const { privateKeyB64, publicKeyB64 } = rsaKeyPair();
  const expected = {
    cheqiReceiptId: "CHQ-20260730-000001",
    documents: { CHEQI: { mediaType: "application/json", content: "{\"ok\":true}" } },
    envelopeVersion: 1,
    receiptGeneratorVersion: "2.1.0",
    receiptUuid: "706920f8-63a7-4d9d-a92a-5889545562ce"
  };
  const encrypted = new EncryptionService().encryptForDevice(JSON.stringify(expected), {
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
  assert.deepEqual(JSON.parse(JSON.stringify(decryption.decryptReceipt(queued, privateKeyB64))), expected);
  assert.deepEqual(JSON.parse(JSON.stringify(decryption.decryptReceipt(webhook, privateKeyB64))), expected);
});

test("queued and webhook credit-note initiation requests decrypt and validate", () => {
  const { privateKeyB64, publicKeyB64 } = rsaKeyPair();
  const expected = {
    cheqiReceiptId: "CHQ-20260730-000001",
    receiptId: "merchant-receipt-1",
    lineItems: [{ productId: "SKU-1", quantity: 1, reasonCode: ReturnReasonCode.DAMAGED }],
    refundPreference: "ORIGINAL_PAYMENT_METHOD"
  };
  const encrypted = new EncryptionService().encryptForDevice(JSON.stringify(expected), {
    id: "device-1",
    publicKey: publicKeyB64
  });
  const queued = {
    encryptedCreditNoteInitiationRequest: encrypted.encryptedContent,
    encryptedSymmetricKey: encrypted.encryptedAesKey
  };
  const webhook = { companyId: "company-1", ...queued };
  const decryption = new DecryptionService();
  assert.deepEqual(decryption.decryptCreditNoteInitiationRequest(queued, privateKeyB64), expected);
  assert.deepEqual(decryption.decryptCreditNoteInitiationRequest(webhook, privateKeyB64), expected);
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

test("verification canonicalizes JSON before hashing", () => {
  const verification = new VerificationService();
  assert.equal(
    verification.calculateCheqiReceiptHash('{"b":2,"a":1}'),
    verification.calculateCheqiReceiptHash('{"a":1,"b":2}')
  );
});

test("default HTTP client posts the v2 encrypted envelope unchanged", async () => {
  let requestUrl;
  let requestBody;
  const fetchImpl = async (url, init) => {
    requestUrl = String(url);
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      cheqiReceiptId: "CHQ-HTTP",
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

  await service.createStore("company-1", request, "oauth-token");
  await service.getStores("company-1", "oauth-token");
  await service.getStores("company-1", undefined, "oauth-token");
  await service.getActiveStores("company-1", "oauth-token");
  await service.getStore("company-1", "store-1", "oauth-token");
  await service.updateStore("company-1", "store-1", { storeName: "Updated" }, "oauth-token");
  await service.deleteStore("company-1", "store-1", "oauth-token");
  await service.activateStore("company-1", "store-1", "oauth-token");
  await service.deactivateStore("company-1", "store-1", "oauth-token");

  assert.deepEqual(calls.map(([operation]) => operation), [
    "create", "list", "list", "list", "get", "update", "delete", "activate", "deactivate"
  ]);
  assert.equal(calls[3][2], true);
  assert.throws(() => service.getStores("", undefined, "oauth-token"), /Company ID cannot be null/);
  assert.throws(() => service.getStore("company-1", "", "oauth-token"), /Store ID cannot be null/);
  assert.throws(() => service.getStores("company-1", undefined, " "), /Access token cannot be null/);
  assert.throws(
    () => service.createStore("company-1", { storeName: "", addressDto: {} }, "oauth-token"),
    /storeName is required.*streetName is required.*countryIsoCode is required/
  );
  assert.throws(
    () => service.updateStore("company-1", "store-1", null, "oauth-token"),
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
        return Response.json({ cheqiReceiptId: "CHQ-CREDIT" }, { status: 202 });
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
