# Changelog

## 3.0.0

- Support Node.js 20+, browsers, POS extensions, workers, Deno, and Bun through shared Fetch and Web Crypto code.
- Preserve the full root SDK, including API-key and OAuth authentication, receipt and credit-note workflows, decryption, verification, download receipts, and stores.
- Add `issuer`, `crypto`, `models`, and `verification` subpath exports and token-provider authentication.
- Make low-level cryptography, hashing, and envelope generation asynchronous. See [the v3 migration guide](docs/migration-v3.md).
- Add v2 encrypted interoperability fixtures, an installed Node consumer fixture, a Chromium browser fixture, and issuer bundle analysis.
