# Changelog

## 3.0.0

- Use shared Fetch and Web Crypto code for Node.js 20+ and portable runtimes; test Node and Chromium in CI and provide a separate Shopify POS device verification workflow.
- Preserve the full root SDK, including API-key and OAuth authentication, receipt and credit-note workflows, decryption, verification, download receipts, and stores.
- Add `issuer`, `crypto`, `models`, and `verification` subpath exports and token-provider authentication.
- Make low-level cryptography, hashing, and envelope generation asynchronous. See [the v3 migration guide](docs/migration-v3.md).
- Add v2 encrypted interoperability fixtures, an installed Node consumer fixture, a Chromium browser fixture, and issuer bundle analysis.
- Allow an injected `crypto` provider across all crypto paths and report missing methods or unavailable algorithms with `CryptoUnavailableError`.
- Generate UUIDv4 values with the configured `getRandomValues()` implementation; no `randomUUID()` global is required.
- Add a synthetic POS sandbox diagnostic and a Node report verifier; browser results cannot be mistaken for device verification.
