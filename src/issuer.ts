import { CheqiSDKConfig, Environment, ReceiptEnvironment } from "./config.js";
import { DefaultCheqiApiClient } from "./http/client.js";
import { EncryptionService } from "./services/encryption.js";
import { MatchingService } from "./services/matching.js";
import { ReceiptService } from "./services/receipt.js";
import type { CheqiSDKOptions } from "./types.js";

/** A small issuer facade for browser, POS, worker, and server integrations. */
export function createCheqiIssuer(options: CheqiSDKOptions): ReceiptService {
  const config = new CheqiSDKConfig(options);
  const client = options.apiClient ?? new DefaultCheqiApiClient(config, options.fetch);
  return new ReceiptService(client, new EncryptionService(), new MatchingService(client),
    config.receiptDownloadBaseUrl);
}

export { Environment, ReceiptEnvironment, EncryptionService, ReceiptService };
export { createReceiptPayload, createProduct, createTax, createIdentificationDetails } from "./models/domain.js";
export { PaymentType } from "./models/generated/PaymentType.js";
export { UnitCode } from "./models/generated/UnitCode.js";
export { ReceiptIssueState, ReceiptResult } from "./models.js";
export type { CheqiSDKOptions, ReceiptIssueOptions, IdentificationDetails, ReceiptPayload } from "./types.js";
