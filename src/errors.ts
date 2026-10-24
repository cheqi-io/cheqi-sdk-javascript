export const ErrorCodes = {
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_REQUEST: "INVALID_REQUEST",
  AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED",
  AUTHORIZATION_FAILED: "AUTHORIZATION_FAILED",
  INVALID_ACCESS_TOKEN: "INVALID_ACCESS_TOKEN",
  INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",
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
  INVALID_RESPONSE: "INVALID_RESPONSE",
  SUBMISSION_IN_PROGRESS: "SUBMISSION_IN_PROGRESS",
  KEY_GENERATION_ERROR: "KEY_GENERATION_ERROR",
  RECEIPT_GENERATION_ERROR: "RECEIPT_GENERATION_ERROR",
  TEMPLATE_PROCESSING_ERROR: "TEMPLATE_PROCESSING_ERROR",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
  INVALID_FIELD_VALUE: "INVALID_FIELD_VALUE",
  INVALID_CURRENCY_CODE: "INVALID_CURRENCY_CODE",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  INVALID_DATE_FORMAT: "INVALID_DATE_FORMAT"
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
    return this.httpStatusCode === 401 ||
      this.errorCode === ErrorCodes.AUTHENTICATION_FAILED ||
      this.errorCode === ErrorCodes.INVALID_ACCESS_TOKEN;
  }

  isAuthorizationError(): boolean {
    return this.httpStatusCode === 403 ||
      this.errorCode === ErrorCodes.AUTHORIZATION_FAILED ||
      this.errorCode === ErrorCodes.INSUFFICIENT_PERMISSIONS;
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

/** A submission is already running; recover using the original match id. */
export class SubmissionInProgressError extends CheqiApiError {
  constructor(readonly retryAfterSeconds: number = 2) {
    super("Receipt submission is in progress", {
      errorCode: ErrorCodes.SUBMISSION_IN_PROGRESS,
      httpStatusCode: 202
    });
  }

  override get isRetryable(): boolean { return true; }
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

/** The runtime or configured provider cannot perform a required crypto operation. */
export class CryptoUnavailableError extends CheqiSDKError {
  constructor(readonly capability: string, options: Pick<CheqiErrorOptions, "cause"> = {}) {
    super(`Required cryptography is unavailable: ${capability}. ` +
      "Use a runtime with Web Crypto support or pass a compatible implementation as the crypto option.",
    { ...options, errorCode: ErrorCodes.CONFIGURATION_ERROR });
    this.name = "CryptoUnavailableError";
  }
}

export class ReceiptProcessingError extends CheqiSDKError {}

export class CreditNoteProcessingError extends CheqiSDKError {}
