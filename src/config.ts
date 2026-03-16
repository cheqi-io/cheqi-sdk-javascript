import type { CheqiSDKOptions, Nullable } from "./types.js";

export const Environment = {
  SANDBOX: "https://sandbox.api.cheqi.io",
  TEST: "https://test.api.cheqi.io",
  PRODUCTION: "https://api.cheqi.io"
} as const;

export class CheqiSDKConfig {
  readonly apiEndpoint: string;
  readonly apiKey: Nullable<string>;
  readonly privateKey: Nullable<string>;
  readonly timeoutSeconds: number;
  readonly maxRetries: number;

  constructor(options: CheqiSDKOptions = {}) {
    const {
      environment,
      customApiEndpoint,
      apiKey = null,
      privateKey = null,
      timeoutSeconds = 30,
      maxRetries = 3
    } = options;

    this.apiEndpoint = customApiEndpoint ?? environment ?? "";
    if (!this.apiEndpoint) {
      throw new Error("Either 'environment' or 'customApiEndpoint' must be provided");
    }
    if (timeoutSeconds <= 0) {
      throw new Error(`Timeout must be positive, got: ${timeoutSeconds}`);
    }
    if (maxRetries < 0) {
      throw new Error(`Max retries cannot be negative, got: ${maxRetries}`);
    }

    this.apiKey = apiKey;
    this.privateKey = privateKey;
    this.timeoutSeconds = timeoutSeconds;
    this.maxRetries = maxRetries;
  }
}
