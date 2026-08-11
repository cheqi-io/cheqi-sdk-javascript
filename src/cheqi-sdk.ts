import { CheqiSDKConfig } from "./config.js";
import { DefaultCheqiApiClient } from "./http/client.js";
import type { CheqiSDKOptions } from "./types.js";
import type { CheqiApiClient } from "./types.js";
import { CreditNoteService } from "./services/credit-note.js";
import { DecryptionService } from "./services/decryption.js";
import { DownloadService } from "./download/index.js";
import { EncryptionService } from "./services/encryption.js";
import { MatchingService } from "./services/matching.js";
import { ReceiptService } from "./services/receipt.js";
import { StoreService } from "./services/store.js";
import { VerificationService } from "./services/verification.js";

/**
 * Main entry point for the Cheqi SDK.
 *
 * Provides access to definitive receipt and credit-note issuance, customer
 * matching, encryption/decryption, encrypted downloads, and store management.
 *
 * @example
 * ```ts
 * const sdk = new CheqiSDK({
 *   apiEndpoint: Environment.SANDBOX,
 *   apiKey: "sk_test_abc123"
 * });
 *
 * const result = await sdk.receiptService.issueReceipt(
 *   identificationDetails,
 *   receiptPayload,
 *   accessToken
 * );
 * ```
 */
export class CheqiSDK {
  readonly config: CheqiSDKConfig;
  readonly verificationService: VerificationService;
  readonly decryptionService: DecryptionService;
  readonly downloadService: DownloadService;
  readonly encryptionService: EncryptionService;
  readonly apiClient: CheqiApiClient;
  readonly matchingService: MatchingService;
  readonly receiptService: ReceiptService;
  readonly storeService: StoreService;
  readonly creditNoteService: CreditNoteService;

  constructor(options: CheqiSDKOptions) {
    this.config = new CheqiSDKConfig(options);
    this.verificationService = new VerificationService();
    this.decryptionService = new DecryptionService();
    this.downloadService = new DownloadService();
    this.encryptionService = new EncryptionService();
    this.apiClient = options.apiClient ?? new DefaultCheqiApiClient(this.config, options.fetch);
    this.matchingService = new MatchingService(this.apiClient);
    this.receiptService = new ReceiptService(
      this.apiClient,
      this.encryptionService,
      this.matchingService,
      this.config.receiptDownloadBaseUrl
    );
    this.storeService = new StoreService(this.apiClient);
    this.creditNoteService = new CreditNoteService(
      this.apiClient,
      this.encryptionService,
      this.matchingService
    );
  }

}

/** Creates a configured SDK without requiring `new`. */
export function createCheqiSDK(options: CheqiSDKOptions): CheqiSDK {
  return new CheqiSDK(options);
}
