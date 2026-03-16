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
