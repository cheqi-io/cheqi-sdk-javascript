import { CheqiSDKError, ErrorCodes } from "../errors.js";

/**
 * Per-call settings that override the SDK-level configuration for a single API call.
 *
 * Pass an OAuth access token here when acting on behalf of a connected company. The SDK never
 * stores or refreshes tokens: obtain them with `sdk.oauthService.requestAccessToken(...)`, cache
 * them per Grant in your own store, and pass the current one on each call. Without an access
 * token the call uses the configured token provider or API key.
 *
 * @example
 * ```ts
 * await sdk.receiptService.issueReceipt(identificationDetails, receiptPayload, {
 *   accessToken: await tokenStore.get(grantId)
 * });
 * ```
 */
export interface RequestOptions {
  /** OAuth access token for this call. Omit to use the configured token provider or API key. */
  accessToken?: string | null;
  /** Timeout for this call in seconds. Omit to use the configured timeout. */
  timeoutSeconds?: number;
  /**
   * Maximum retries for this call. Omit to use the configured value. Only applies to
   * operations the SDK retries; encrypted submissions are never retried automatically.
   */
  maxRetries?: number;
}

/** Options for receipt and credit-note issuance: the store plus per-call settings. */
export interface ReceiptIssueOptions extends RequestOptions {
  storeId?: string | null;
}

/** Throws a validation error for malformed per-call options; returns them otherwise. */
export function validateRequestOptions(options: RequestOptions | null | undefined): RequestOptions {
  if (options == null) return {};
  if (typeof options !== "object") {
    throw invalid("Request options must be an object, e.g. { accessToken }");
  }
  if (options.accessToken != null && (typeof options.accessToken !== "string" || !options.accessToken.trim())) {
    throw invalid("accessToken cannot be empty");
  }
  if (options.timeoutSeconds != null && !(options.timeoutSeconds > 0)) {
    throw invalid("timeoutSeconds must be positive");
  }
  if (options.maxRetries != null && !(Number.isInteger(options.maxRetries) && options.maxRetries >= 0)) {
    throw invalid("maxRetries must be a non-negative integer");
  }
  return options;
}

function invalid(message: string): CheqiSDKError {
  return new CheqiSDKError(message, { errorCode: ErrorCodes.VALIDATION_ERROR, httpStatusCode: 400 });
}
