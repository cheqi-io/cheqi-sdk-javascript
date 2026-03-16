export const ErrorCodes = {
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED",
  AUTHORIZATION_FAILED: "AUTHORIZATION_FAILED",
  CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
  RECEIPT_NOT_FOUND: "RECEIPT_NOT_FOUND",
  ENCRYPTION_ERROR: "ENCRYPTION_ERROR",
  DECRYPTION_ERROR: "DECRYPTION_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  SERVER_ERROR: "SERVER_ERROR",
  INVALID_RESPONSE: "INVALID_RESPONSE"
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface CheqiErrorOptions {
  errorCode?: ErrorCode;
  httpStatusCode?: number;
  correlationId?: string | null;
  cause?: unknown;
}

export class CheqiSDKError extends Error {
  readonly errorCode: ErrorCode;
  readonly httpStatusCode: number;
  readonly correlationId: string | null;

  constructor(message: string, options: CheqiErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.errorCode = options.errorCode ?? ErrorCodes.UNKNOWN_ERROR;
    this.httpStatusCode = options.httpStatusCode ?? 0;
    this.correlationId = options.correlationId ?? null;
  }
}

export class CheqiApiError extends CheqiSDKError {
  get isRetryable(): boolean {
    return this.httpStatusCode === 408 ||
      this.httpStatusCode === 429 ||
      (this.httpStatusCode >= 500 && this.httpStatusCode < 600);
  }
}

export class EncryptionError extends CheqiSDKError {
  constructor(message: string, options: Omit<CheqiErrorOptions, "errorCode"> = {}) {
    super(message, { ...options, errorCode: ErrorCodes.ENCRYPTION_ERROR });
  }
}

export class DecryptionError extends CheqiSDKError {
  constructor(message: string, options: Omit<CheqiErrorOptions, "errorCode"> = {}) {
    super(message, { ...options, errorCode: ErrorCodes.DECRYPTION_ERROR });
  }
}

export class ReceiptProcessingError extends CheqiSDKError {}

export class CreditNoteProcessingError extends CheqiSDKError {}
