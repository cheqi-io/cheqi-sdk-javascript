import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import {
  canonicalizeJson,
  CardDetails,
  CheqiSDK,
  CheqiSDKConfig,
  Company,
  CompanyAddress,
  CreditNoteService,
  DecryptionService,
  EncryptionService,
  Environment,
  IdentificationDetails,
  MatchingService,
  NoopLogger,
  Product,
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

test("matching: requires an identifier", async () => {
  const matching = new MatchingService({ matchCustomer() { throw new Error("unreachable"); } });
  await assert.rejects(() => matching.matchCustomer({ paymentType: "CARD_PAYMENT" }), /at least one identifier/);
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
  assert.equal(service.canonicalizeUblXml(formattedXml), compactXml);
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
  assert.equal(dto.addressDto.streetName, "S");
  assert.equal(dto.addressDto.countryIsoCode, "NL");
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
  ).paymentMeans([paymentMeans]).verificationNonce("nonce-1").build();

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
