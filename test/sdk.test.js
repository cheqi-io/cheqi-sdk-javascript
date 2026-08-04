import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import {
  CheqiApiError,
  CheqiSDK,
  CheqiSDKConfig,
  CreditNoteInitiationRequest,
  CreditNoteService,
  DecryptionService,
  DownloadService,
  EncryptionService,
  Environment,
  FiscalizationData,
  FiscalizationStatus,
  MatchingService,
  NoopLogger,
  PaymentType,
  Product,
  JurisdictionalData,
  ReceiptPayload,
  ReceiptService,
  ReturnReasonCode,
  ReturnLineItem,
  Tax,
  UnitCode,
  VerificationService,
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
  return ReceiptPayload.builder()
    .documentNumber("R-100")
    .issueDate(new Date("2026-07-29T10:00:00Z"))
    .currency("EUR")
    .receiptSubtotal("10.10")
    .totalBeforeTax("10.10")
    .totalTaxAmount("2.24")
    .totalAmount("12.34")
    .taxesApplied(true)
    .addProduct(
      Product.builder()
        .name("Coffee")
        .identifier("COFFEE-1")
        .quantity(1)
        .unitCode(UnitCode.C62)
        .unitPrice("10.10")
        .subtotal("10.10")
        .total("12.34")
        .build()
    )
    .build();
}

test("config aligns standard API and receipt environments", () => {
  assert.equal(
    new CheqiSDKConfig({ environment: Environment.PRODUCTION, ...NOOP }).receiptDownloadBaseUrl,
    "https://receipt.cheqi.io"
  );
  assert.equal(
    new CheqiSDKConfig({ environment: Environment.SANDBOX, ...NOOP }).receiptDownloadBaseUrl,
    "https://sandbox.receipt.cheqi.io"
  );
  assert.equal(
    new CheqiSDKConfig({ environment: Environment.TEST, ...NOOP }).receiptDownloadBaseUrl,
    "https://test.receipt.cheqi.io"
  );
});

test("config validates endpoint, timeout, and retries", () => {
  assert.throws(() => new CheqiSDKConfig(NOOP), /environment.*customApiEndpoint/);
  assert.throws(
    () => new CheqiSDKConfig({ environment: Environment.TEST, timeoutSeconds: 0, ...NOOP }),
    /Timeout must be positive/
  );
  assert.throws(
    () => new CheqiSDKConfig({ environment: Environment.TEST, maxRetries: -1, ...NOOP }),
    /cannot be negative/
  );
});

test("SDK exposes the same primary services as Java v2.1", () => {
  const sdk = CheqiSDK.builder()
    .apiEndpoint(Environment.SANDBOX)
    .apiKey("sk_test_example")
    .logger(new NoopLogger())
    .build();
  assert.ok(sdk.getReceiptService());
  assert.ok(sdk.getCreditNoteService());
  assert.ok(sdk.getEncryptionService());
  assert.ok(sdk.getDecryptionService());
  assert.ok(sdk.getDownloadService());
  assert.ok(sdk.getMatchingService());
  assert.ok(sdk.getStoreService());
  assert.ok(sdk.getVerificationService());
});

test("definitive payload builders preserve caller-supplied decimal values", () => {
  const payload = receiptPayload();
  assert.equal(payload.receiptSubtotal, 10.1);
  assert.equal(payload.totalAmount, 12.34);
  assert.equal(payload.products[0].unitCode, "C62");
  assert.deepEqual(payload.products[0].taxes, []);
  assert.throws(
    () => ReceiptPayload.builder().documentNumber("missing-fields").build(),
    /issueDate is required/
  );
  const tax = Tax.builder()
    .rate(21)
    .type("VAT")
    .taxableAmount("10.00")
    .amount("2.10")
    .build();
  assert.equal(tax.amount, 2.1);
  const jurisdiction = JurisdictionalData.builder()
    .countryCode("NL")
    .fiscalization(FiscalizationData.of("NL-FISCAL", FiscalizationStatus.FISCALIZED)
      .addField("authorityId", "AUTH-1", "Authority"))
    .addLegalText("RETURN_NOTICE", "Returns within 30 days", "en")
    .build();
  assert.equal(jurisdiction.fiscalization.additionalFields[0].code, "authorityId");
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
  const document = JSON.parse(envelope.documents.CHEQI.content);
  assert.equal(document.documentNumber, "R-100");
  assert.equal(document.identificationDetails.cardDetails.paymentAccountReference, "PAR-123");
  assert.equal(document.identificationDetails.cardDetails.lastFourDigits, "4242");
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
  assert.deepEqual(decryption.decryptReceipt(queued, privateKeyB64), expected);
  assert.deepEqual(decryption.decryptReceipt(webhook, privateKeyB64), expected);
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
  const built = CreditNoteInitiationRequest.builder()
    .cheqiReceiptId("CHQ-1")
    .receiptId("R-1")
    .lineItems([new ReturnLineItem("SKU", 1, ReturnReasonCode.DAMAGED, "Seal broken")])
    .refundPreference("ORIGINAL_PAYMENT_METHOD")
    .build();
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
  assert.deepEqual(await downloads.decryptDownloadEnvelope(encrypted, link.contentKey), envelope);
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
    environment: Environment.TEST,
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
    new CheqiSDKConfig({ environment: Environment.TEST, apiKey: "sk_test_http", ...NOOP }),
    async () => { throw new Error("fetch should not run"); }
  );
  await assert.rejects(
    () => client.submitEncryptedReceipt({ matchId: "", deviceDeliveries: [] }),
    (error) => error instanceof CheqiApiError && error.errorCode === "INVALID_REQUEST"
  );
});
