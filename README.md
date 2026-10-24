# Cheqi JavaScript SDK

`@cheqi/sdk` is a TypeScript-first SDK for Node.js 20+ and JavaScript runtimes with Fetch and Web Crypto. It resolves receipt recipients and issues end-to-end encrypted Cheqi receipts and credit notes. Its contract and behavior align with the Cheqi Java SDK, including receipt recovery and deferred encrypted downloads. Node and Chromium are tested in CI; Shopify POS requires [device verification](docs/pos-verification.md).

## Requirements

- Node.js 20 or newer for backend applications, or a modern browser/worker runtime with Fetch and Web Crypto
- A Cheqi API key or OAuth access token for authenticated API calls
- An RSA private key only when decrypting recipient envelopes

## Installation

```bash
npm install @cheqi/sdk
```

## Initialize the SDK

```ts
import { CheqiSDK, Environment } from "@cheqi/sdk";

const sdk = new CheqiSDK({
  apiEndpoint: Environment.SANDBOX,
  apiKey: process.env.CHEQI_API_KEY!
});
```

Standard API environments are `Environment.SANDBOX`, `Environment.TEST`, and `Environment.PRODUCTION`. For a custom deployment, pass its URL as `apiEndpoint` and set `receiptDownloadBaseUrl` when download fallback is enabled.

API keys belong in trusted backend code. A Fetch-compatible transport can be injected for proxying, tracing, or tests with the `fetch` option.

The `crypto` option accepts a Web Crypto provider with `subtle` and `getRandomValues`, and applies to every SDK crypto path. Omit it to use `globalThis.crypto`. Missing methods or unsupported algorithms throw `CryptoUnavailableError` with an actionable capability message. See [runtime requirements](docs/runtimes.md).

Custom `apiClient` implementations take `RequestOptions` as the last argument of every operation, including `getMatch(matchId, options?)` and `requestAccessToken(request, options?)`.

## Request options and OAuth

Every API method takes an optional `RequestOptions` object as its last argument. Use it to act on behalf of a connected company with its OAuth access token, or to override the timeout or retry count for one call. Authentication uses the per-call access token, then the configured `accessTokenProvider`, then `apiKey` when no provider is configured.

```ts
await sdk.storeService.getStores(companyId, undefined, { accessToken });
```

The same object can also set `timeoutSeconds` and `maxRetries` for a single call.

Company access tokens are short-lived and bound to one Grant, so an integration that serves several companies holds one token per Grant. Request one with the client-credentials grant; the request and response use the generated snake_case OAuth models:

```ts
const token = await sdk.oauthService.requestAccessToken({
  client_id: clientId,
  client_secret: clientSecret,
  grant_id: grantId,
  scope: "receipt:issue"
});
// token.access_token, token.expires_in
```

The SDK does not cache or refresh tokens. Store each token with its expiry in your own token store, request a new one before it expires, and pass the current token with `RequestOptions`.

## Browser, POS extension, and worker issuance

Use the small `@cheqi/sdk/issuer` entry point with a short-lived OAuth token. Do not ship a long-lived API key in downloadable code. The issuer uses the same matching, serialization, encryption, submission, and fallback flow as `CheqiSDK.receiptService`.

```ts
import { createCheqiIssuer, Environment } from "@cheqi/sdk/issuer";

const issuer = createCheqiIssuer({
  apiEndpoint: Environment.PRODUCTION,
  accessTokenProvider: async () => getShortLivedToken()
});

const result = await issuer.issueReceipt(identificationDetails, receiptPayload);
```

`accessTokenProvider` is called before each HTTP request. You can also pass an `accessToken` in individual receipt options. Node backends may use the same issuer entry point, while the root `CheqiSDK` remains the full backend SDK with verification, decryption, stores, credit notes, and management APIs.

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
  apiKey: process.env.CHEQI_API_KEY!
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

For OAuth and store association, pass `ReceiptIssueOptions` (`RequestOptions` plus `storeId`):

```ts
await sdk.receiptService.issueReceipt(identificationDetails, receiptPayload, {
  storeId,
  accessToken
});
```

The same options work with `resumeReceipt` and `issueCreditNote`.

`ReceiptPayload` is definitive. Supply `taxesApplied`, totals, line values, payment presentation, and jurisdictional data yourself. The SDK does not infer, calculate, or reconcile them.

## Pending submissions and recovery

Read `result.state` using the exported `ReceiptIssueState` constants:

| State | Meaning |
| --- | --- |
| `DIGITAL_SUBMITTED` | Cheqi acknowledged the digital submission; device processing may still be pending. |
| `DIGITAL_PENDING` | Submission is running or its outcome is uncertain. Recover using the original match ID. |
| `DIGITAL_EXPIRED` | The match expired before digital submission was accepted; this result is not retryable. |
| `DOWNLOAD_FALLBACK` | A download was accepted, an encrypted download is prepared for later upload, or a final envelope is required. |
| `EMAIL_FALLBACK` | The caller must complete explicit email delivery. |

`result.isAccepted()` is true only when Cheqi returns a receipt ID. `result.submission` contains the generated digital submission response. `result.retryable` and `result.retryAfterSeconds` describe recovery eligibility and a server-suggested delay.

On a matching outage, `issueReceipt` returns a locally prepared download. On an uncertain digital submission, it returns `DIGITAL_PENDING` with the original `matchId` and a prepared download. These paths do not upload the fallback during checkout. Permanent API errors still throw with their error code, HTTP status, and correlation ID.

```ts
import { ReceiptIssueState, type PreparedReceiptDownload } from "@cheqi/sdk";

if (result.preparedDownload) {
  // Persist this whole object before showing the URL or QR to the customer.
  const serialized = JSON.stringify(result.preparedDownload);
  await persistDownload(serialized); // Your integration's durable storage.
  displayDownloadUrl(result.preparedDownload.downloadUrl);
}

// Later, in your integration's worker:
const prepared: PreparedReceiptDownload = JSON.parse(serializedDownload);
await sdk.receiptService.uploadPreparedDownload(prepared, { accessToken });

if (result.state === ReceiptIssueState.DIGITAL_PENDING && result.matchId) {
  const resumed = await sdk.receiptService.resumeReceipt(result.matchId, receiptPayload, {
    storeId,
    accessToken
  });
}
```

A prepared download is a plain object pairing `downloadUrl` with the generated `ClientReceiptDownloadRequest` in `uploadRequest`. Upload retries resend its exact download ID and ciphertext. Recovery downloads contain only the definitive payload and omit the original matching identifiers. The URL includes the secret decryption key, so store it privately. Recovery performs one attempt using the original device snapshot; it never matches again or replaces the original prepared download or QR. Storage, scheduling, and retry policy belong to your integration.

To inspect a match or encrypt locally without submitting:

```ts
const match = await sdk.receiptService.getMatch(matchId, { accessToken });
// Requires a MATCHED digital snapshot; also accepts RecipientResolutionResponse.
const encrypted = await sdk.receiptService.generateEncryptedReceiptEnvelope(match, receiptPayload, storeId);
await sdk.receiptService.submitEncryptedReceipt(encrypted, { accessToken });
```

`sdk.apiClient.submitEncryptedReceipt` and `sdk.apiClient.submitEncryptedCreditNote` throw `SubmissionInProgressError` for an `IN_PROGRESS` response. It carries `retryAfterSeconds`; an HTTP 202 with a receipt ID remains an accepted submission. The service submission methods wrap this error in `CheqiSDKError.cause`. Non-idempotent submissions are never automatically retried by the HTTP client.

## Delivery routes and download fallback

- `DIGITAL`: encrypted once per owner device and submitted immediately, with recovery for uncertain outcomes.
- `DOWNLOAD_FALLBACK`: uploaded when local payment context is available; recoverable upload failures retain the prepared download. Without payment context, `isDownloadEnvelopeRequired()` is returned.
- `EMAIL_FALLBACK`: `isEmailReceiptRequired()` is returned; `issueReceipt` does not send email automatically.

To create an encrypted download without recipient matching:

```ts
const result = await sdk.receiptService.issueDownloadReceipt(
  { paymentType: PaymentType.CASH },
  receiptPayload,
  { accessToken }
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
  { accessToken }
);
```

## Lower-level operations

```ts
const resolution = await sdk.matchingService.matchCustomer(identificationDetails, { accessToken });

const delivery = await sdk.encryptionService.encryptReceiptForRecipient(
  receiptPayloadJson,
  resolution.recipients[0]
);

const response = await sdk.receiptService.submitEncryptedReceipt({
  matchId: resolution.matchId,
  deviceDeliveries: [delivery]
}, { accessToken });
```

The caller must use the selected route and preserve identical definitive plaintext across device encryptions.

## Credit notes

Credit notes use the same per-device model and a separate generated envelope:

```ts
const result = await sdk.creditNoteService.issueCreditNote(
  identificationDetails,
  parentCheqiReceiptId,
  definitiveCreditNotePayload,
  { storeId, accessToken }
);
```

Customer return requests are separate from merchant-issued credit notes. Decrypt, deserialize, and validate polling or webhook requests in one call:

```ts
const request = await sdk.decryptionService.decryptCreditNoteInitiationRequest(
  webhook.data.creditNoteInitiationRequest,
  privateKeyBase64
);
```

The validation checks product IDs, positive return quantities, reason codes, notes, refund preference, and bank-account requirements. The merchant remains responsible for eligibility, remaining quantities, accepted outcomes, taxes, and the definitive refund.

## Receipt and webhook decryption

`decryptReceipt` accepts either an `EncryptedReceiptDeliveryResponse` from polling or a `WebhookReceiptEnvelope` from `data.encryptedReceipt` / `data.encryptedCreditNote`:

```ts
const envelope = await sdk.decryptionService.decryptReceipt(
  webhook.data.encryptedReceipt,
  privateKeyBase64
);
```

The plaintext is already a complete `ReceiptEnvelope`; no backend-context merge step is required.

## Store management

Store operations require an OAuth token with the relevant store permissions:

```ts
const store = await sdk.storeService.createStore(companyId, createStoreRequest, { accessToken });
const stores = await sdk.storeService.getStores(companyId, undefined, { accessToken });
const activeStores = await sdk.storeService.getActiveStores(companyId, { accessToken });
```

## Generated models

The root package exports typed model interfaces, validation factories, and enums. Every OpenAPI-generated model, enum, and serializer is also available under `Generated`:

```ts
import { Generated } from "@cheqi/sdk";

const route = Generated.RecipientResolutionResponseDeliveryRouteTypeEnum.DIGITAL;
```

## Development

See [runtime support and entry points](docs/runtimes.md), [the v3 migration guide](docs/migration-v3.md), and the [changelog](CHANGELOG.md).

```bash
npx playwright install chromium
npm test
npm run test:node
npm run test:browser
npm run typecheck
make generate
```
