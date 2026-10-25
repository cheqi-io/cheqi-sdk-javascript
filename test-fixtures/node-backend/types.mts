import { CheqiSDK, Environment, RetryHandler, type IdentificationDetailsShape, type Generated } from "@cheqi/sdk";
import { createCheqiIssuer, type ReceiptPayload, type CryptoProvider } from "@cheqi/sdk/issuer";
import { EncryptionService, DecryptionService, sha256Hex, CryptoUnavailableError } from "@cheqi/sdk/crypto";
import { VerificationService } from "@cheqi/sdk/verification";
import { DownloadService, generateDownloadLink, encryptDownloadEnvelope, decryptDownloadEnvelope } from "@cheqi/sdk/download";

declare const identification: IdentificationDetailsShape;
declare const payload: ReceiptPayload;
const crypto: CryptoProvider = { subtle: globalThis.crypto.subtle, getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
const sdk = new CheqiSDK({ apiEndpoint: Environment.PRODUCTION, apiKey: "server-secret", crypto, fetch: globalThis.fetch });
void sdk.receiptService.issueReceipt(identification, payload);
void sdk.verificationService.calculateCheqiReceiptHash(payload);
const issuer = createCheqiIssuer({ apiEndpoint: Environment.TEST, accessTokenProvider: async () => "token", crypto });
void issuer.issueReceipt(identification, payload);
void new EncryptionService(crypto);
void new DecryptionService(crypto);
void new VerificationService(crypto);
const downloads = new DownloadService(crypto);
const link = generateDownloadLink("https://receipt.example", crypto);
declare const envelope: Generated.ReceiptEnvelope;
void encryptDownloadEnvelope(envelope, link.contentKey, crypto);
void downloads.generateDownloadLink("https://receipt.example");
void decryptDownloadEnvelope("ciphertext", link.contentKey, crypto);
void sha256Hex("abc", crypto);
void new CryptoUnavailableError("SHA-256");
// Native response methods remain inferred for users of the generic retry helper.
void new RetryHandler().executeWithRetry(() => globalThis.fetch("https://example.test"), "fixture")
  .then((response) => response.json());
type Receipt = Generated.ReceiptPayload;
declare const receipt: Receipt;
void receipt;
