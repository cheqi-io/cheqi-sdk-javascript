# Cheqi TypeScript SDK

TypeScript-first Cheqi SDK for encrypted receipt and credit note processing.

## Included

- SDK entrypoint with config and service wiring
- Customer matching
- Receipt processing flow: match -> template -> encrypt -> send/email fallback
- Credit note processing flow
- Hybrid RSA-OAEP + AES-256-GCM encryption/decryption
- Retry-capable HTTP client
- JSON canonical hashing and basic XML normalization hashing
- Company and store service wrappers
- Generated declarations from the TypeScript source

## Install

```bash
npm install
```

## Test

```bash
npm test
```

## Usage

```ts
import { CheqiSDK, Environment } from "@cheqi/sdk";

const sdk = CheqiSDK.builder()
  .apiEndpoint(Environment.SANDBOX)
  .apiKey("sk_test_...")
  .build();

const result = await sdk.receiptService.processCompleteReceipt(
  {
    recipientEmail: "customer@example.com"
  },
  {
    documentNumber: "INV-001",
    currency: "EUR",
    totalAmount: 12.1
  }
);
```

## Notes

- Models are plain TypeScript object shapes with automatic camelCase serialization.
- The public service structure now includes Java-style `builder()` and `get*Service()` accessors.
- The package ships `.d.ts` declarations so it can be consumed directly from TypeScript.
- The full Java model class hierarchy is still not recreated as class-per-model; the payload contract is represented as typed object shapes instead.
- XML verification currently normalizes formatting whitespace and hashes the result. If strict XML C14N compatibility is required, that part should be hardened next.
## Deferred receipt download links

The SDK provides stateless primitives for creating a customer URL before Cheqi is
reachable. It does not store receipts, start background workers, or choose a retry
schedule. Your integration owns persistence and decides where and when deferred work
runs.

```ts
import {
  buildDownloadEnvelope,
  encryptDownloadEnvelope,
  generateDownloadLink
} from "@cheqi/sdk/download";

const link = generateDownloadLink("https://receipt.cheqi.io");

// Persist the complete template request, link.downloadId, and protected
// link.contentKey using your own durable storage before exposing link.url.
await receiptJobs.create({ templateRequest, ...link });
printQr(link.url);

// Later, on compute and a schedule controlled by your integration:
const template = await sdk.receiptService.generateReceiptTemplate(templateRequest);
const envelope = buildDownloadEnvelope(template);
const ciphertext = await encryptDownloadEnvelope(envelope, link.contentKey);

// Persist the exact ciphertext before its first upload attempt. After an ambiguous
// result, every retry must reuse these bytes rather than encrypting again.
await receiptJobs.markReady(link.downloadId, ciphertext);
await sdk.receiptService.uploadClientEncryptedReceipt({
  downloadId: link.downloadId,
  ciphertext
});
```

The customer may open the URL before the receipt is uploaded. The download page reports
that the receipt is not yet available and can be visited again later. Do not implement
receipt template generation locally: call the normal template endpoint after connectivity
returns so CHEQI, UBL, seller, and VAT behavior remains canonical.
