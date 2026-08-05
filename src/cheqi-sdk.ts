import { CheqiSDKConfig } from "./config.js";
import { DefaultCheqiApiClient } from "./http/client.js";
import type { Logger } from "./logger.js";
import type { CheqiSDKOptions } from "./types.js";
import { CreditNoteService } from "./services/credit-note.js";
import { DecryptionService } from "./services/decryption.js";
import { DownloadService } from "./download/index.js";
import { EncryptionService } from "./services/encryption.js";
import { MatchingService } from "./services/matching.js";
import { ReceiptService } from "./services/receipt.js";
import { StoreService } from "./services/store.js";
import { VerificationService } from "./services/verification.js";

/**
 * Fluent builder for constructing a {@link CheqiSDK} instance.
 *
 * @example
 * ```ts
 * const sdk = CheqiSDK.builder()
 *   .apiEndpoint("https://sandbox.api.cheqi.io")
 *   .apiKey("sk_test_abc123")
 *   .build();
 * ```
 */
export class CheqiSDKBuilder {
  private readonly options: CheqiSDKOptions = {};

  /** Set the API endpoint (e.g. one of the {@link Environment} constants). */
  apiEndpoint(apiEndpoint: string): this {
    this.options.environment = apiEndpoint;
    return this;
  }

  /** Set a custom API endpoint URL. Takes precedence over {@link apiEndpoint}. */
  customApiEndpoint(customApiEndpoint: string): this {
    this.options.customApiEndpoint = customApiEndpoint;
    return this;
  }

  /** Set the customer-facing receipt origin for a custom API endpoint. */
  receiptDownloadBaseUrl(receiptDownloadBaseUrl: string): this {
    this.options.receiptDownloadBaseUrl = receiptDownloadBaseUrl;
    return this;
  }

  /** Set the API key (typically starts with `sk_live_` or `sk_test_`). */
  apiKey(apiKey: string): this {
    this.options.apiKey = apiKey;
    return this;
  }

  /** Set the RSA private key (base64-encoded PKCS#8 DER) for decryption. */
  privateKey(privateKey: string): this {
    this.options.privateKey = privateKey;
    return this;
  }

  /** HTTP request timeout in seconds (default 30, max recommended 300). */
  timeoutSeconds(timeoutSeconds: number): this {
    this.options.timeoutSeconds = timeoutSeconds;
    return this;
  }

  /** Maximum number of retry attempts for transient failures (default 3). */
  maxRetries(maxRetries: number): this {
    this.options.maxRetries = maxRetries;
    return this;
  }

  /** Supply a custom logger (console, pino, winston, etc.). */
  logger(logger: Logger): this {
    this.options.logger = logger;
    return this;
  }

  /** Build and return a configured {@link CheqiSDK} instance. */
  build(): CheqiSDK {
    return new CheqiSDK(this.options);
  }
}

/**
 * Main entry point for the Cheqi SDK.
 *
 * Provides access to definitive receipt and credit-note issuance, customer
 * matching, encryption/decryption, encrypted downloads, and store management.
 *
 * @example
 * ```ts
 * const sdk = CheqiSDK.builder()
 *   .apiEndpoint(Environment.SANDBOX)
 *   .apiKey("sk_test_abc123")
 *   .build();
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
  readonly apiClient: DefaultCheqiApiClient;
  readonly matchingService: MatchingService;
  readonly receiptService: ReceiptService;
  readonly storeService: StoreService;
  readonly creditNoteService: CreditNoteService;

  /** Create a new {@link CheqiSDKBuilder}. */
  static builder(): CheqiSDKBuilder {
    return new CheqiSDKBuilder();
  }

  constructor(options: CheqiSDKOptions = {}, apiClient: DefaultCheqiApiClient | null = null) {
    this.config = new CheqiSDKConfig(options);
    this.verificationService = new VerificationService();
    this.decryptionService = new DecryptionService();
    this.downloadService = new DownloadService();
    this.encryptionService = new EncryptionService();
    this.apiClient = apiClient ?? new DefaultCheqiApiClient(this.config);
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

  getConfig(): CheqiSDKConfig { return this.config; }
  getApiClient(): DefaultCheqiApiClient { return this.apiClient; }
  getEncryptionService(): EncryptionService { return this.encryptionService; }
  getDecryptionService(): DecryptionService { return this.decryptionService; }
  getDownloadService(): DownloadService { return this.downloadService; }
  getMatchingService(): MatchingService { return this.matchingService; }
  getReceiptService(): ReceiptService { return this.receiptService; }
  getCreditNoteService(): CreditNoteService { return this.creditNoteService; }
  getStoreService(): StoreService { return this.storeService; }
  getVerificationService(): VerificationService { return this.verificationService; }
}
