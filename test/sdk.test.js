import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";

import {
  canonicalizeJson,
  CardDetails,
  CheqiSDK,
  Company,
  CompanyAddress,
  CreditNoteService,
  DecryptionService,
  EncryptionService,
  IdentificationDetails,
  MatchingService,
  Product,
  ReceiptService,
  ReceiptTemplateRequest,
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

function rsaKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKeyB64: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    publicKeyB64: publicKey.export({ type: "spki", format: "der" }).toString("base64")
  };
}

test("matching validation requires an identifier", async () => {
  const matching = new MatchingService({ matchCustomer() { throw new Error("unreachable"); } });
  await assert.rejects(() => matching.matchCustomer({}), /at least one identifier/);
});

test("receipt encryption/decryption round trip", () => {
  const { privateKeyB64, publicKeyB64 } = rsaKeyPair();
  const encryption = new EncryptionService();
  const decryption = new DecryptionService();
  const payload = JSON.stringify({ documentNumber: "INV-001", totalAmount: 121 });
  const encrypted = encryption.encryptReceiptForRecipient(payload, {
    id: "device-123",
    receiverType: "DEVICE",
    publicKey: publicKeyB64
  });
  const decrypted = decryption.decryptReceipt(encrypted, privateKeyB64);
  assert.deepEqual(JSON.parse(decrypted.receiptContent), JSON.parse(payload));
});

test("credit note encryption/decryption round trip", () => {
  const { privateKeyB64, publicKeyB64 } = rsaKeyPair();
  const encryption = new EncryptionService();
  const decryption = new DecryptionService();
  const payload = JSON.stringify({ documentNumber: "CN-001", totalAmount: -50 });
  const encrypted = encryption.encryptCreditNoteForRecipient(payload, {
    id: "device-456",
    receiverType: "DEVICE",
    publicKey: publicKeyB64
  });
  const decrypted = decryption.decryptCreditNote({
    encryptedCreditNoteInitiationRequest: encrypted.encryptedCreditNote,
    encryptedSymmetricKey: encrypted.encryptedSymmetricKey
  }, privateKeyB64);
  assert.deepEqual(JSON.parse(decrypted.content), JSON.parse(payload));
});

test("receipt service performs match, template, encrypt, and send", async () => {
  const { publicKeyB64 } = rsaKeyPair();
  const calls = [];
  const apiClient = {
    async matchCustomer() {
      calls.push("match");
      return {
        customerFound: true,
        matchId: "match-1",
        recipients: [{ id: "r1", publicKey: publicKeyB64, receiverType: "DEVICE", acceptedFormats: ["CHEQI"] }]
      };
    },
    async generateReceiptTemplate() {
      calls.push("template");
      return {
        cheqi: { documentNumber: "INV-001", totalAmount: 121 }
      };
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
    { recipientEmail: "customer@example.com" },
    { documentNumber: "INV-001", totalAmount: 121 }
  );
  assert.equal(result.isSuccess(), true);
  assert.deepEqual(calls, ["match", "template", "send"]);
});

test("receipt service falls back to email when customer is not found", async () => {
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
    { recipientEmail: "customer@example.com" },
    { documentNumber: "INV-001" }
  );
  assert.equal(result.deliveryMethod, "EMAIL");
});

test("credit note service performs match, template, encrypt, and send", async () => {
  const { publicKeyB64 } = rsaKeyPair();
  const apiClient = {
    async matchCustomer() {
      return {
        customerFound: true,
        matchId: "match-1",
        recipients: [{ id: "r1", publicKey: publicKeyB64, receiverType: "DEVICE", acceptedFormats: ["CHEQI"] }]
      };
    },
    async generateCreditNoteTemplate(request) {
      assert.deepEqual(request.receiptFormats, ["CHEQI"]);
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
    { cheqiReceiptId: "receipt-1" },
    { documentNumber: "CN-001" }
  );
  assert.equal(result.success, true);
});

test("RFC8785 canonicalization sorts keys", () => {
  assert.equal(canonicalizeJson({ z: 1, a: 2, m: 3 }), "{\"a\":2,\"m\":3,\"z\":1}");
});

test("verification XML hash ignores formatting whitespace", () => {
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

test("sdk wires services together", () => {
  const sdk = new CheqiSDK({ environment: "https://sandbox.api.cheqi.io" }, {
    matchCustomer() {},
    generateReceiptTemplate() {},
    sendEncryptedReceipts() {}
  });
  assert.ok(sdk.receiptService);
  assert.ok(sdk.creditNoteService);
  assert.equal(typeof sdk.getReceiptService, "function");
});

test("sdk builder mirrors java style", () => {
  const sdk = CheqiSDK.builder()
    .apiEndpoint("https://sandbox.api.cheqi.io")
    .apiKey("sk_test_123")
    .timeoutSeconds(10)
    .maxRetries(2)
    .build();
  assert.equal(sdk.getConfig().apiEndpoint, "https://sandbox.api.cheqi.io");
  assert.equal(sdk.getConfig().apiKey, "sk_test_123");
});

test("model builders mirror java builder style", () => {
  const identificationDetails = IdentificationDetails.builder()
    .paymentType("CARD_PAYMENT")
    .cardDetails(
      CardDetails.builder()
        .paymentAccountReference("PAR-123")
        .cardProvider("VISA")
        .build()
    )
    .recipientEmail("customer@example.com")
    .build();

  const receiptRequest = ReceiptTemplateRequest.builder()
    .documentNumber("INV-001")
    .currency("EUR")
    .totalAmount("12.10")
    .addProduct(
      Product.builder()
        .name("Coffee")
        .quantity(1)
        .baseQuantity(1)
        .unitCode("C62")
        .unitPrice("10.00")
        .subtotal("10.00")
        .total("12.10")
        .build()
    )
    .build();

  assert.equal(identificationDetails.getRecipientEmail(), "customer@example.com");
  assert.equal(receiptRequest.documentNumber, "INV-001");
  assert.equal(receiptRequest.products.length, 1);
});

test("company model builder works with validation services", () => {
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

test("backend purchase receipt entity subset builders work", () => {
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
    id,
    "2026-03-16",
    supplier,
    "EUR",
    monetaryTotal,
    [line]
  ).paymentMeans([paymentMeans]).verificationNonce("nonce-1").build();

  assert.equal(receipt.id.getValue(), "INV-001");
  assert.equal(receipt.documentCurrencyCode, "EUR");
  assert.equal(receipt.purchaseReceiptLines.length, 1);
  assert.equal(receipt.paymentMeans.length, 1);
});

test("company service applies java validation rules", () => {
  const sdk = new CheqiSDK({ environment: "https://sandbox.api.cheqi.io" }, {
    provisionCompany() { throw new Error("should not reach"); }
  });
  assert.throws(
    () => sdk.getCompanyService().provisionCompany({ companyName: "Cheqi" }, "admin@example.com"),
    /companyEmail is required/
  );
});

test("store service requires access token for management calls", () => {
  const sdk = new CheqiSDK({ environment: "https://sandbox.api.cheqi.io" }, {
    createStore() { throw new Error("should not reach"); }
  });
  assert.throws(
    () => sdk.getStoreService().createStore("company-1", { storeName: "Main", address: { streetName: "A", cityName: "B", postalZone: "1234", countryIsoCode: "NL" } }),
    /Access token cannot be null or empty/
  );
});
