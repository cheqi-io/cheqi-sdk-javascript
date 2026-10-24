# Runtime dependency audit

| Location | Previous dependency | Role | Resolution |
| --- | --- | --- | --- |
| `services/encryption.ts` | `node:crypto`, `Buffer` | AES-GCM, RSA-OAEP, key parsing | Web Crypto and `Uint8Array`; SPKI and iOS PKCS#1 public keys remain supported. Wire format remains Base64 of IV, ciphertext, tag. |
| `services/decryption.ts` | `node:crypto`, `Buffer` | RSA unwrapping and AES-GCM | Web Crypto; PKCS#8 private keys, SHA-256 OAEP, and framing retained. |
| `utils.ts` | `node:crypto`, `Buffer` | SHA-256 and DER decoding | Web Crypto hash and shared byte helpers. |
| `services/receipt.ts` | `node:crypto` | Random receipt UUID | UUIDv4 from the configured provider's `getRandomValues()`. No `randomUUID()` requirement. Receipt serialization unchanged. |
| `runtime-crypto.ts` | Global-only crypto | Runtime capabilities | Injectable `CryptoProvider`; missing methods and unsupported algorithms produce actionable `CryptoUnavailableError` failures. |
| `http/client.ts` | `node:module` | Reading package version | Embedded SDK version; Fetch transport, timeout, retries, errors and correlation IDs preserved. |
| `download/index.ts` | Web Crypto, `atob`, `btoa` | Download encryption and Base64 | Already portable; kept the existing download wire format. |
| `xml.ts` | `@xmldom/xmldom` | XML parsing for exclusive canonicalization | Retained for full SDK verification. Excluded from issuer entry point. |
| Generated models | Fetch and standard URL APIs | Serialization and API typing | Retained. Type-only imports disappear at runtime. |
| Build/check scripts and tests | Node built-ins | Repository tooling | Remain Node-specific; they are not included in published runtime entry points. |

The only production dependency is `@xmldom/xmldom` 0.9.12 or newer, for XML verification. Development dependencies are TypeScript, Node types, YAML, esbuild, and Playwright. No Node crypto or Buffer polyfills were added. The v2 fixture was generated from version 2.3.0 before the crypto rewrite; tests check old-to-new decryption and new-to-v2 Node decryption. The dependency update also clears the current npm audit findings.
