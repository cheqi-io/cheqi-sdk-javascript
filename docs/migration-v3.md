# Migrating from v2 to v3

Version 3 moves cryptography and hashing to Web Crypto. The encrypted receipt format is unchanged: a 32-byte AES key, 12-byte GCM IV, 16-byte tag, and RSA-OAEP with SHA-256. Existing high-level `await sdk.receiptService.issueReceipt(...)` calls retain their shape.

Low-level crypto and hash operations now return promises:

```ts
// v2
const encrypted = sdk.encryptionService.encryptReceiptForRecipient(json, recipient);
const envelope = sdk.decryptionService.decryptReceipt(delivery, privateKey);
const hash = sdk.verificationService.calculateCheqiReceiptHash(json);

// v3
const encrypted = await sdk.encryptionService.encryptReceiptForRecipient(json, recipient);
const envelope = await sdk.decryptionService.decryptReceipt(delivery, privateKey);
const hash = await sdk.verificationService.calculateCheqiReceiptHash(json);
```

`generateEncryptedReceiptEnvelope`, credit-note decryption, XML hashing, and hash verification also require `await`. Canonicalization methods remain synchronous. `decodeKey` and `parseBase64Der` return `Uint8Array` instead of `Buffer`.

Backends can continue using `apiKey`. Browser and extension integrations should use `@cheqi/sdk/issuer` with a scoped `accessToken` or `accessTokenProvider`.
