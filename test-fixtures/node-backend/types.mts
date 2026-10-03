import { CheqiSDK, Environment, type IdentificationDetailsShape, type Generated } from "@cheqi/sdk";
import { createCheqiIssuer, type ReceiptPayload } from "@cheqi/sdk/issuer";
import { EncryptionService } from "@cheqi/sdk/crypto";
import { VerificationService } from "@cheqi/sdk/verification";

declare const identification: IdentificationDetailsShape;
declare const payload: ReceiptPayload;
const sdk = new CheqiSDK({ apiEndpoint: Environment.PRODUCTION, apiKey: "server-secret" });
void sdk.receiptService.issueReceipt(identification, payload);
void sdk.verificationService.calculateCheqiReceiptHash(payload);
const issuer = createCheqiIssuer({ apiEndpoint: Environment.TEST, accessTokenProvider: async () => "token" });
void issuer.issueReceipt(identification, payload);
void new EncryptionService();
void new VerificationService();
type Receipt = Generated.ReceiptPayload;
declare const receipt: Receipt;
void receipt;
