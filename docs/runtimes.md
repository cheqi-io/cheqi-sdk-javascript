# Runtime support and entry points

`@cheqi/sdk` supports trusted Node.js 20+ backends, modern browsers, POS/UI extensions, worker runtimes, Deno, and Bun. The shared protocol uses Fetch, Web Crypto, typed arrays, text encoding, URLs, and abort signals. A runtime must provide these standard APIs.

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
  accessTokenProvider: async () => getShortLivedToken()
});

await issuer.issueReceipt(identificationDetails, receiptPayload);
```

The issuer entry point exports receipt payload helpers and avoids importing decryption, private-key handling, XML verification, and store administration. The token provider runs for each HTTP request. Keep long-lived credentials out of browser bundles. Callers can pass an `accessToken` per receipt operation when they already hold a scoped token.

## Other entry points

| Import | Purpose |
| --- | --- |
| `@cheqi/sdk` | Full SDK |
| `@cheqi/sdk/issuer` | Matching, receipt issuance, encrypted submission and fallback |
| `@cheqi/sdk/crypto` | Web Crypto encryption and decryption |
| `@cheqi/sdk/verification` | JSON and XML canonicalization and async hashes |
| `@cheqi/sdk/models` | Models and value factories |
| `@cheqi/sdk/download` | Encrypted download links |

The built-package consumer fixture checks Node and Chromium. The issuer bundle from that fixture is 42,829 bytes raw and 12,997 bytes gzip with esbuild minification. It has no Node built-ins, Buffer shim, or crypto shim. The 25 KB gzip target is met. Deno, Bun, and Cloudflare Workers are supported through the same standard APIs; this repository does not yet run those runtimes in CI.
