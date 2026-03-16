import { CheqiSDKConfig } from "./config.js";
import { DefaultCheqiApiClient } from "./http/client.js";
import type { CheqiSDKOptions, EncryptedReceipt } from "./types.js";
import { CompanyService } from "./services/company.js";
import { CreditNoteService } from "./services/credit-note.js";
import { DecryptionService } from "./services/decryption.js";
import { EncryptionService } from "./services/encryption.js";
import { MatchingService } from "./services/matching.js";
import { ReceiptService } from "./services/receipt.js";
import { StoreService } from "./services/store.js";
import { VerificationService } from "./services/verification.js";

export class CheqiSDKBuilder {
  private readonly options: CheqiSDKOptions = {};

  apiEndpoint(apiEndpoint: string): this {
    this.options.environment = apiEndpoint;
    return this;
  }

  customApiEndpoint(customApiEndpoint: string): this {
    this.options.customApiEndpoint = customApiEndpoint;
    return this;
  }

  apiKey(apiKey: string): this {
    this.options.apiKey = apiKey;
    return this;
  }

  privateKey(privateKey: string): this {
    this.options.privateKey = privateKey;
    return this;
  }

  timeoutSeconds(timeoutSeconds: number): this {
    this.options.timeoutSeconds = timeoutSeconds;
    return this;
  }

  maxRetries(maxRetries: number): this {
    this.options.maxRetries = maxRetries;
    return this;
  }

  build(): CheqiSDK {
    return new CheqiSDK(this.options);
  }
}

export class CheqiSDK {
  readonly config: CheqiSDKConfig;
  readonly verificationService: VerificationService;
  readonly decryptionService: DecryptionService;
  readonly encryptionService: EncryptionService;
  readonly apiClient: DefaultCheqiApiClient;
  readonly matchingService: MatchingService;
  readonly receiptService: ReceiptService;
  readonly companyService: CompanyService;
  readonly storeService: StoreService;
  readonly creditNoteService: CreditNoteService;

  static builder(): CheqiSDKBuilder {
    return new CheqiSDKBuilder();
  }

  constructor(options: CheqiSDKOptions = {}, apiClient: DefaultCheqiApiClient | null = null) {
    this.config = new CheqiSDKConfig(options);
    this.verificationService = new VerificationService();
    this.decryptionService = new DecryptionService();
    this.encryptionService = new EncryptionService();
    this.apiClient = apiClient ?? new DefaultCheqiApiClient(this.config);
    this.matchingService = new MatchingService(this.apiClient);
    this.receiptService = new ReceiptService(this.apiClient, this.encryptionService, this.matchingService);
    this.companyService = new CompanyService(this.apiClient);
    this.storeService = new StoreService(this.apiClient);
    this.creditNoteService = new CreditNoteService(
      this.apiClient,
      this.encryptionService,
      this.matchingService,
      this.decryptionService
    );
  }

  processEncryptedReceipt(encryptedReceipt: EncryptedReceipt, privateKey: string): {
    receiptContent: string;
    customerDetails: string | null;
  } {
    return this.decryptionService.decryptReceipt(encryptedReceipt, privateKey);
  }

  getConfig(): CheqiSDKConfig {
    return this.config;
  }

  getApiClient(): DefaultCheqiApiClient {
    return this.apiClient;
  }

  getEncryptionService(): EncryptionService {
    return this.encryptionService;
  }

  getDecryptionService(): DecryptionService {
    return this.decryptionService;
  }

  getMatchingService(): MatchingService {
    return this.matchingService;
  }

  getReceiptService(): ReceiptService {
    return this.receiptService;
  }

  getCreditNoteService(): CreditNoteService {
    return this.creditNoteService;
  }

  getCompanyService(): CompanyService {
    return this.companyService;
  }

  getStoreService(): StoreService {
    return this.storeService;
  }

  getVerificationService(): VerificationService {
    return this.verificationService;
  }
}
