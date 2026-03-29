import type { Logger } from "./logger.js";
import { ConsoleLogger } from "./logger.js";
import type { CheqiSDKOptions, Nullable } from "./types.js";

/** Well-known API environment base URLs. */
export const Environment = {
  SANDBOX: "https://sandbox.api.cheqi.io",
  TEST: "https://test.api.cheqi.io",
  PRODUCTION: "https://api.cheqi.io"
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
  readonly apiKey: Nullable<string>;
  readonly privateKey: Nullable<string>;
  readonly timeoutSeconds: number;
  readonly maxRetries: number;
  readonly logger: Logger;

  constructor(options: CheqiSDKOptions = {}) {
    const {
      environment,
      customApiEndpoint,
      apiKey = null,
      privateKey = null,
      timeoutSeconds = 30,
      maxRetries = 3,
      logger = new ConsoleLogger()
    } = options;

    this.logger = logger;

    // --- endpoint ---
    this.apiEndpoint = customApiEndpoint ?? environment ?? "";
    if (!this.apiEndpoint) {
      throw new Error("Either 'environment' or 'customApiEndpoint' must be provided");
    }

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
    if (apiKey && !isValidApiKeyFormat(apiKey)) {
      this.logger.warn("API key does not match expected format (sk_live_* or sk_test_*)");
    }
    this.apiKey = apiKey;

    // --- private key ---
    if (!privateKey) {
      this.logger.info("No private key configured — decryption features will not be available");
    }
    this.privateKey = privateKey;

    this.logger.info(`SDK configured: endpoint=${this.apiEndpoint}, timeout=${this.timeoutSeconds}s, maxRetries=${this.maxRetries}`);
  }
}

function isValidApiKeyFormat(key: string): boolean {
  return key.startsWith("sk_live_") || key.startsWith("sk_test_");
}
