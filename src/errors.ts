export const ErrorCodes = {
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_REQUEST: "INVALID_REQUEST",
  AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED",
  AUTHORIZATION_FAILED: "AUTHORIZATION_FAILED",
  CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
  CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
  RECEIPT_NOT_FOUND: "RECEIPT_NOT_FOUND",
  ENCRYPTION_ERROR: "ENCRYPTION_ERROR",
  DECRYPTION_ERROR: "DECRYPTION_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  /** @deprecated Use {@link ErrorCodes.RATE_LIMIT_EXCEEDED}. */
  RATE_LIMITED: "RATE_LIMIT_EXCEEDED",
  SERVER_ERROR: "SERVER_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
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
  readonly timestamp: Date;

  constructor(message: string, options: CheqiErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.errorCode = options.errorCode ?? ErrorCodes.UNKNOWN_ERROR;
    this.httpStatusCode = options.httpStatusCode ?? 0;
    this.correlationId = options.correlationId ?? null;
    this.timestamp = new Date();
  }

  hasHttpStatusCode(): boolean {
    return this.httpStatusCode > 0;
  }

  hasCorrelationId(): boolean {
    return this.correlationId !== null && this.correlationId !== "";
  }

  isClientError(): boolean {
    return this.httpStatusCode >= 400 && this.httpStatusCode < 500;
  }

  isServerError(): boolean {
    return this.httpStatusCode >= 500 && this.httpStatusCode < 600;
  }

  isAuthenticationError(): boolean {
    return this.httpStatusCode === 401 || this.errorCode === ErrorCodes.AUTHENTICATION_FAILED;
  }

  isAuthorizationError(): boolean {
    return this.httpStatusCode === 403 || this.errorCode === ErrorCodes.AUTHORIZATION_FAILED;
  }

  isRateLimitError(): boolean {
    return this.httpStatusCode === 429 || this.errorCode === ErrorCodes.RATE_LIMIT_EXCEEDED;
  }

  isValidationError(): boolean {
    return this.errorCode === ErrorCodes.VALIDATION_ERROR || this.errorCode === ErrorCodes.INVALID_REQUEST;
  }

  isNetworkError(): boolean {
    return this.errorCode === ErrorCodes.NETWORK_ERROR || this.errorCode === ErrorCodes.TIMEOUT_ERROR;
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
