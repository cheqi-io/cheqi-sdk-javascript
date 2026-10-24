# Runtime support and entry points

`@cheqi/sdk` is tested on Node.js 20+ and Chromium. Its portable issuer is intended for POS/UI extensions and other JavaScript runtimes that provide the required standard APIs. Shopify POS device verification is a separate requirement; see [POS verification](pos-verification.md). Deno, Bun, and Cloudflare Workers are not exercised in CI.

The shared protocol uses Fetch, Web Crypto, typed arrays, `TextEncoder`/`TextDecoder`, `atob`/`btoa`, URL, timers, and `AbortSignal.timeout`. There is no dependency on `window`, `document`, Node built-ins, `Buffer`, or `require`. The `fetch` and `crypto` configuration options accept compatible implementations without modifying globals.

## Trusted backend

```ts
import { CheqiSDK, Environment } from "@cheqi/sdk";

const sdk = new CheqiSDK({
  apiEndpoint: Environment.PRODUCTION,
  apiKey: process.env.CHEQI_API_KEY!
});

await sdk.receiptService.issueReceipt(identificationDetails, receiptPayload);
```

The root SDK includes matching, issuance, download receipts, decryption, verification, credit notes, and store APIs. API keys are suitable for trusted servers. OAuth access tokens remain available on individual operations. The `fetch` option accepts a custom Fetch-compatible transport, and `apiClient` accepts a full custom client.

## Browser, POS, and worker

```ts
import { createCheqiIssuer, Environment } from "@cheqi/sdk/issuer";

const issuer = createCheqiIssuer({
  apiEndpoint: Environment.PRODUCTION,
  accessTokenProvider: async () => getShortLivedToken(),
  crypto: platformCrypto,
  fetch: platformFetch
});

await issuer.issueReceipt(identificationDetails, receiptPayload);
```

The issuer entry point exports receipt payload helpers and avoids importing decryption, private-key handling, XML verification, and store administration. The token provider runs for each HTTP request. Keep long-lived credentials out of browser bundles. Callers can pass an `accessToken` per receipt operation when they already hold a scoped token.

Omit `crypto` and `fetch` to use their global implementations. A `CryptoProvider` needs `subtle` and `getRandomValues`; `randomUUID` is not needed. One configured provider supplies receipt and credit-note encryption, recipient decryption, JSON/XML hashes, download links, download encryption/decryption, and UUIDv4 randomness. The standalone crypto services accept the provider in their constructors; download functions and `sha256Hex` accept it as their last optional argument.

Missing crypto methods and unavailable AES-256-GCM, RSA-OAEP/SHA-256, or SHA-256 algorithms throw `CryptoUnavailableError` with `errorCode: "CONFIGURATION_ERROR"`. Its `capability` names the failing operation and its message explains how to supply an implementation. Invalid keys and modified ciphertext remain encryption/decryption errors. The SDK never substitutes insecure randomness, uploads plaintext on crypto failure, or falls back to a Node implementation. Provider validation is lazy, so non-crypto backend APIs remain usable independently.

## Other entry points

| Import | Purpose |
| --- | --- |
| `@cheqi/sdk` | Full SDK |
| `@cheqi/sdk/issuer` | Matching, receipt issuance, encrypted submission and fallback |
| `@cheqi/sdk/crypto` | Web Crypto encryption and decryption |
| `@cheqi/sdk/verification` | JSON and XML canonicalization and async hashes |
| `@cheqi/sdk/models` | Models and value factories |
| `@cheqi/sdk/download` | Encrypted download links |

The installed-package consumer fixture checks Node and Chromium, including Node-to-Chromium and Chromium-to-Node decryption using the legacy protocol. The issuer fixture is approximately 15 KB gzip with esbuild minification, below the enforced 25 KB target. It contains no Node built-ins, `Buffer` shim, `require`, or crypto shim. The separate device diagnostic bundle includes public test private keys and is never part of the published SDK or production issuer bundle.
