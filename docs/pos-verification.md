# Verify cryptography in Shopify POS

**Status: actual Shopify POS device verification is pending.** Node and Chromium passing does not establish POS support. Only record a supported POS/OS/API version after the checks below pass inside that device's extension sandbox and its report passes the Node verifier. Test iOS and Android separately when supporting both.

The diagnostic uses synthetic receipts, a synthetic PAR, public test keys, and an in-memory Fetch-compatible recorder. It performs no network requests, changes no orders, needs no Cheqi credentials, and never uses production receipts. Its test private keys must never be used for real data. The diagnostic and fixtures are excluded from the published npm package.

## Build the diagnostic

From this repository at the SDK commit being tested:

```sh
npm ci
npm run build:pos-check
git rev-parse HEAD
```

This produces `test-fixtures/shopify-extension/dist/crypto-check.js` (ES module) and `crypto-check.console.js` (self-contained console script). Use the full commit SHA in the report metadata.

## Run inside a device sandbox

Use a Shopify development store and the Shopify POS app on a physical device. Open the extension target being tested. Follow Shopify's [device debugging instructions](https://shopify.dev/docs/apps/build/pos/debugging) to select that extension's sandbox in Safari on iOS or Chrome on Android. An ordinary browser tab, simulator, or desktop preview is not device verification.

Paste the contents of `crypto-check.console.js` into that sandbox's console, then run:

```js
const report = await CheqiCryptoCheck.runPosCryptoCheck({
  platform: "iOS",
  deviceModel: "iPhone 16 / record OS version here",
  apiVersion: "2026-07",
  sdkRevision: "replace with the full SDK commit SHA",
  target: "pos.home.modal.render"
});
console.log(JSON.stringify(report));
```

Use the device model/OS, extension API version, platform, and target actually tested. The diagnostic reads `shopify.session.currentSession.posVersion` from the host; without it, the report is marked `non-pos` and the verifier rejects it as POS evidence. It does not log a customer receipt or access token.

Alternatively, import `runPosCryptoCheck` from the ES module into an existing development extension and call it from an action. If a new extension is needed, scaffold it with Shopify CLI; these diagnostic files are not a replacement for a CLI-generated app/extension. Do not deploy the diagnostic in production.

## Check and retain the report

Save the logged JSON as a local file and run:

```sh
npm run verify:pos-report -- /path/to/pos-crypto-report.json
```

The checks exercise SHA-256 against a known vector; RSA-OAEP/SHA-256 with SPKI and iOS PKCS#1 public keys; AES-256-GCM with a 32-byte key, 12-byte IV and 16-byte tag; Node v2 ciphertext decryption on the device; PAR resolution; unchanged local payload serialization; ciphertext-only submission; encrypted download fallback with a fragment-only key; secure UUIDv4 generation; and rejection of modified GCM tags. The verifier also decrypts device-generated SPKI and PKCS#1 ciphertext using Node's legacy crypto implementation.

Keep the report with the PR/release validation evidence and record the tested OS and POS versions, extension API version, target, SDK commit, timestamp, and outcome. A failed report must remain a failure; do not replace missing crypto with backend plaintext processing. Run again with a compatible injected provider if the host needs one, and record that provider and version with the evidence.

The installed-package Chromium test runs this same diagnostic and cross-checks its generated ciphertext in Node. It explicitly verifies that a Chromium report is rejected as Shopify POS evidence.
