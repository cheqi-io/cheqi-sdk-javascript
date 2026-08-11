# Cheqi JavaScript SDK

JavaScript/TypeScript SDK for resolving receipt recipients and issuing end-to-end encrypted Cheqi receipts and credit notes. Its v2.1 contract and behavior align with the Cheqi Java SDK.

## Requirements

- Node.js 20 or newer
- An RSA key pair for recipient-side envelope decryption

## Installation

```bash
npm install @cheqi/sdk
```

## Initialize the SDK

```ts
import { CheqiSDK, Environment } from "@cheqi/sdk";

const sdk = new CheqiSDK({
  apiEndpoint: Environment.SANDBOX,
  apiKey: "sk_..."
});
```

Standard API environments are `Environment.SANDBOX`, `Environment.TEST`, and `Environment.PRODUCTION`. For a custom deployment, pass its URL as `apiEndpoint` and set `receiptDownloadBaseUrl` when download fallback is enabled.

A Fetch-compatible transport can be injected for proxying, tracing, or tests with the `fetch` option.

## Receipt issuance

`ReceiptService.issueReceipt(...)` now performs the definitive zero-knowledge receipt flow:

1. Resolve the delivery route from `IdentificationDetails`.
2. Serialize the issuer-supplied `ReceiptPayload` without calculating or changing values.
3. Encrypt the same payload independently for every matched owner device.
4. Submit an `EncryptedReceiptEnvelope` containing ciphertext only.
5. Return a `ReceiptResult` describing acceptance or a required fallback action.

```ts
import {
  CheqiSDK,
  Environment,
  PaymentType,
  UnitCode,
  createReceiptPayload,
  type IdentificationDetails
} from "@cheqi/sdk";

const sdk = new CheqiSDK({
  apiEndpoint: Environment.SANDBOX,
  apiKey: "sk_..."
});

const identificationDetails = {
  paymentType: PaymentType.CARD_PAYMENT,
  cardDetails: {
    paymentAccountReference: "PAR123456789",
    cardProvider: "VISA",
    lastFourDigits: "4242"
  }
} satisfies IdentificationDetails;

const receiptPayload = createReceiptPayload({
  documentNumber: "POS-2026-0001",
  issueDate: new Date(),
  currency: "EUR",
  receiptSubtotal: "10.00",
  totalBeforeTax: "10.00",
  totalTaxAmount: "2.10",
  totalAmount: "12.10",
  taxesApplied: true,
  paymentDetails: {
    paymentMeansCode: "48",
    description: "Card payment",
    cardProvider: "VISA",
    cardLastFour: "4242",
    merchantId: "MID-123",
    paymentTerminalId: "TID-456"
  },
  products: [{
    name: "Coffee beans",
    brandName: "Cheqi Coffee",
    identifier: "SKU-COFFEE-001",
    quantity: 1,
    baseQuantity: 1,
    unitCode: UnitCode.C62,
    unitPrice: "10.00",
    subtotal: "10.00",
    total: "12.10",
    taxes: [{ rate: 21, type: "VAT", taxableAmount: "10.00", amount: "2.10" }]
  }],
  taxes: [{
    rate: 21,
    type: "VAT",
    taxableAmount: "10.00",
    amount: "2.10",
    label: "VAT 21%"
  }]
});

const result = await sdk.receiptService.issueReceipt(identificationDetails, receiptPayload);

if (result.cheqiReceiptId) {
  console.log(result.cheqiReceiptId, result.deliveryRouteType);
} else if (result.emailReceiptRequired) {
  // Generate and submit the permitted email-fallback receipt explicitly.
} else if (result.downloadEnvelopeRequired) {
  // Generate the final ReceiptEnvelope locally, then complete the fallback.
}
```

For OAuth, pass the access token as the third argument. To associate a store and use OAuth, pass both explicitly:

```ts
await sdk.receiptService.issueReceipt(identificationDetails, receiptPayload, accessToken);
await sdk.receiptService.issueReceipt(identificationDetails, receiptPayload, storeId, accessToken);
```

`ReceiptPayload` is definitive. Supply `taxesApplied`, totals, line values, payment presentation, and jurisdictional data yourself. The SDK does not infer, calculate, or reconcile them.

## Delivery routes and download fallback

- `DIGITAL`: encrypted once per owner device and submitted immediately.
- `DOWNLOAD_FALLBACK`: completed automatically when local payment context is available, otherwise `isDownloadEnvelopeRequired()` is returned.
- `EMAIL_FALLBACK`: `isEmailReceiptRequired()` is returned; `issueReceipt` does not send email automatically.

To create an encrypted download without recipient matching:

```ts
const result = await sdk.receiptService.issueDownloadReceipt(
  { paymentType: PaymentType.CASH },
  receiptPayload,
  accessToken
);
console.log(result.downloadUrl);
```

The content key stays in the URL fragment and is never uploaded to Cheqi. Anyone with the complete URL can decrypt the receipt.

To finish a fallback that requires a caller-generated envelope:

```ts
const completed = await sdk.receiptService.completeDownloadFallback(
  result,
  receiptEnvelope,
  templateHash,
  accessToken
);
```

## Lower-level operations

```ts
const resolution = await sdk.matchingService.matchCustomer(identificationDetails, accessToken);

const delivery = sdk.encryptionService.encryptReceiptForRecipient(
  receiptPayloadJson,
  resolution.recipients[0]
);

const response = await sdk.receiptService.submitEncryptedReceipt({
  matchId: resolution.matchId,
  deviceDeliveries: [delivery]
}, accessToken);
```

The caller must use the selected route and preserve identical definitive plaintext across device encryptions.

## Credit notes

Credit notes use the same per-device model and a separate generated envelope:

```ts
const result = await sdk.creditNoteService.issueCreditNote(
  identificationDetails,
  parentCheqiReceiptId,
  definitiveCreditNotePayload,
  accessToken
);
```

Customer return requests are separate from merchant-issued credit notes. Decrypt, deserialize, and validate polling or webhook requests in one call:

```ts
const request = sdk.decryptionService.decryptCreditNoteInitiationRequest(
  webhook.data.creditNoteInitiationRequest,
  privateKeyBase64
);
```

The validation checks product IDs, positive return quantities, reason codes, notes, refund preference, and bank-account requirements. The merchant remains responsible for eligibility, remaining quantities, accepted outcomes, taxes, and the definitive refund.

## Receipt and webhook decryption

`decryptReceipt` accepts either an `EncryptedReceiptDeliveryResponse` from polling or a `WebhookReceiptEnvelope` from `data.encryptedReceipt` / `data.encryptedCreditNote`:

```ts
const envelope = sdk.decryptionService.decryptReceipt(
  webhook.data.encryptedReceipt,
  privateKeyBase64
);
```

The plaintext is already a complete `ReceiptEnvelope`; no backend-context merge step is required.

## Store management

Store operations require an OAuth token with the relevant store permissions:

```ts
const store = await sdk.storeService.createStore(companyId, createStoreRequest, accessToken);
const stores = await sdk.storeService.getStores(companyId, accessToken);
const activeStores = await sdk.storeService.getActiveStores(companyId, accessToken);
```

## Generated models

The root package exports typed model interfaces, validation factories, and enums. Every OpenAPI-generated model, enum, and serializer is also available under `Generated`:

```ts
import { Generated } from "@cheqi/sdk";

const route = Generated.RecipientResolutionResponseDeliveryRouteTypeEnum.DIGITAL;
```

## Development

```bash
npm test
npm run typecheck
make generate
```
