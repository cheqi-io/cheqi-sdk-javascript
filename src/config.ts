import type { Logger } from "./logger.js";
import { ConsoleLogger } from "./logger.js";
import type { CheqiSDKOptions, Nullable } from "./types.js";

/** Well-known API environment base URLs. */
export const Environment = {
  SANDBOX: "https://sandbox.api.cheqi.io",
  TEST: "https://test.api.cheqi.io",
  PRODUCTION: "https://api.cheqi.io"
} as const;

export const ReceiptEnvironment = {
  SANDBOX: "https://sandbox.receipt.cheqi.io",
  TEST: "https://test.receipt.cheqi.io",
  PRODUCTION: "https://receipt.cheqi.io"
} as const;

const MAX_TIMEOUT_SECONDS = 300;
const MAX_RETRIES = 10;

/**
 * Validated, immutable configuration for the Cheqi SDK.
 *
 * Constructed from {@link CheqiSDKOptions} with sensible defaults and
 * range-checked values.
 */
export class CheqiSDKConfig {
  readonly apiEndpoint: string;
  readonly environment: Nullable<string>;
  readonly apiKey: Nullable<string>;
  readonly crypto: import("./runtime-crypto.js").CryptoProvider | undefined;
  readonly accessTokenProvider: (() => string | Promise<string>) | null;
  readonly receiptDownloadBaseUrl: Nullable<string>;
  readonly privateKey: Nullable<string>;
  readonly timeoutSeconds: number;
  readonly maxRetries: number;
  readonly logger: Logger;

  constructor(options: CheqiSDKOptions) {
    const {
      apiEndpoint,
      receiptDownloadBaseUrl,
      apiKey = null,
      accessTokenProvider = null,
      privateKey = null,
      timeoutSeconds = 30,
      maxRetries = 3,
      logger = new ConsoleLogger()
    } = options;

    this.logger = logger;

    // --- endpoint ---
    this.apiEndpoint = apiEndpoint ?? "";
    if (!this.apiEndpoint) {
      throw new Error("'apiEndpoint' is required");
    }
    this.environment = isKnownEnvironment(apiEndpoint) ? apiEndpoint : null;
    this.receiptDownloadBaseUrl = receiptDownloadBaseUrl ?? receiptBaseUrlForEnvironment(
      this.environment ?? undefined
    );

    // --- timeout ---
    if (timeoutSeconds <= 0) {
      throw new Error(`Timeout must be positive, got: ${timeoutSeconds}`);
    }
    if (timeoutSeconds > MAX_TIMEOUT_SECONDS) {
      this.logger.warn(`Timeout ${timeoutSeconds}s exceeds recommended maximum of ${MAX_TIMEOUT_SECONDS}s`);
    }
    this.timeoutSeconds = timeoutSeconds;

    // --- retries ---
    if (maxRetries < 0) {
      throw new Error(`Max retries cannot be negative, got: ${maxRetries}`);
    }
    if (maxRetries > MAX_RETRIES) {
      this.logger.warn(`Max retries ${maxRetries} exceeds recommended maximum of ${MAX_RETRIES}`);
    }
    this.maxRetries = maxRetries;

    // --- api key ---
    if (!apiKey && !accessTokenProvider) {
      this.logger.warn("No authentication configured. API calls will fail unless access tokens are provided explicitly.");
    }
    this.apiKey = apiKey;
    this.crypto = options.crypto;
    this.accessTokenProvider = accessTokenProvider;

    // --- private key ---
    if (!privateKey) {
      this.logger.info("No private key configured — decryption features will not be available");
    }
    this.privateKey = privateKey;

    this.logger.info(`SDK configured: endpoint=${this.apiEndpoint}, timeout=${this.timeoutSeconds}s, maxRetries=${this.maxRetries}`);
  }

}

function isKnownEnvironment(value: string): boolean {
  return value === Environment.PRODUCTION ||
    value === Environment.SANDBOX ||
    value === Environment.TEST;
}

function receiptBaseUrlForEnvironment(environment?: string): string | null {
  if (environment === Environment.PRODUCTION) return ReceiptEnvironment.PRODUCTION;
  if (environment === Environment.SANDBOX) return ReceiptEnvironment.SANDBOX;
  if (environment === Environment.TEST) return ReceiptEnvironment.TEST;
  return null;
}
