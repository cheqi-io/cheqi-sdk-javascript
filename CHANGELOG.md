# Changelog

## 3.0.0

- Use shared Fetch and Web Crypto code for Node.js 20+ and portable runtimes; test Node and Chromium in CI.
- Preserve the full root SDK, including API-key and OAuth authentication, receipt and credit-note workflows, decryption, verification, download receipts, and stores.
- Add `issuer`, `crypto`, `models`, and `verification` subpath exports and token-provider authentication.
- Make low-level cryptography, hashing, and envelope generation asynchronous. See [the v3 migration guide](docs/migration-v3.md).
- Add v2 encrypted interoperability fixtures, an installed Node consumer fixture, a Chromium browser fixture, and issuer bundle analysis.
- Allow an injected `crypto` provider across all crypto paths and report missing methods or unavailable algorithms with `CryptoUnavailableError`.
- Generate UUIDv4 values with the configured `getRandomValues()` implementation; no `randomUUID()` global is required.
- Fix native browser Fetch invocation and cover default transport issuance in Chromium.
- Generate SDK version metadata during prebuild and check it against package.json before packaging.
- Use AbortController/timer timeouts without requiring AbortSignal.timeout, with cleanup after response-body reading.
- Publish structural crypto/transport types that compile without DOM/Node typings, retain URL-safe Base64 key decoding, and add default export conditions.
- Resolve token providers per attempt, classify provider failures as authentication errors, and allow one bounded 401 refresh for eligible operations.
- Document React Native/Hermes native crypto adapters and polyfill requirements without claiming native CI verification.
