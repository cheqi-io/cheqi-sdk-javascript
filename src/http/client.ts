import { CheqiSDKConfig } from "../config.js";
import { CheqiApiError, ErrorCodes, SubmissionInProgressError } from "../errors.js";
import type { Logger } from "../logger.js";
import { NoopLogger } from "../logger.js";
import type {
  CheqiApiClient,
  CheqiReceipt,
  ClientReceiptDownloadRequest,
  ClientReceiptDownloadResponse,
  CreateStoreRequest,
  EncryptedCreditNoteEnvelope,
  EncryptedReceiptEnvelope,
  FetchLike,
  HttpCallOptions,
  IdentificationDetails,
  ReceiptSubmissionResponse,
  RecipientResolutionResponse,
  RequestOptions,
  StoreDTO,
  UpdateStoreRequest
} from "../types.js";
import { normalizeValue, serializeJson } from "../utils.js";
import { ClientReceiptDownloadResponseFromJSON } from "../models/generated/ClientReceiptDownloadResponse.js";
import { RecipientResolutionResponseFromJSON } from "../models/generated/RecipientResolutionResponse.js";
import { ReceiptSubmissionResponseFromJSON } from "../models/generated/ReceiptSubmissionResponse.js";
import { MatchStatusResponseFromJSON } from "../models/generated/MatchStatusResponse.js";
import type { MatchStatusResponse } from "../models/generated/MatchStatusResponse.js";
import { StoreDTOFromJSON } from "../models/generated/StoreDTO.js";
import { DestinationResponseFromJSON } from "../models/generated/DestinationResponse.js";
import { InviteEmployeesResponseFromJSON } from "../models/generated/InviteEmployeesResponse.js";
import { RegisterResponseFromJSON } from "../models/generated/RegisterResponse.js";
import { WebhookDTOFromJSON } from "../models/generated/WebhookDTO.js";
import { WebhookReceiptEnvelopeFromJSON } from "../models/generated/WebhookReceiptEnvelope.js";
import { ClientCredentialsTokenRequestToJSON } from "../models/generated/ClientCredentialsTokenRequest.js";
import type { ClientCredentialsTokenRequest } from "../models/generated/ClientCredentialsTokenRequest.js";
import { OAuthTokenExchangeResponseFromJSON } from "../models/generated/OAuthTokenExchangeResponse.js";
import type { OAuthTokenExchangeResponse } from "../models/generated/OAuthTokenExchangeResponse.js";
import { validateRequestOptions } from "./request-options.js";
import type { DestinationResponse, InviteEmployeesResponse, RegisterRequest, RegisterResponse, WebhookDTO, WebhookReceiptEnvelope } from "../models/generated/index.js";
import { Endpoints } from "./endpoints.js";
import { RetryHandler } from "./retry.js";

import { SDK_VERSION } from "../version.js";
import type { FetchResponse } from "../transport.js";

function mapErrorCode(status: number) {
  if (status === 400) return ErrorCodes.INVALID_REQUEST;
  if (status === 401) return ErrorCodes.AUTHENTICATION_FAILED;
  if (status === 403) return ErrorCodes.AUTHORIZATION_FAILED;
  if (status === 408) return ErrorCodes.TIMEOUT_ERROR;
  if (status === 429) return ErrorCodes.RATE_LIMIT_EXCEEDED;
  if (status >= 500) return ErrorCodes.SERVER_ERROR;
  return ErrorCodes.UNKNOWN_ERROR;
}

/**
 * Builds a clean error message from an HTTP error response, parsing the backend
 * JSON body for a `message` / `error` / `error_description` field and applying
 * friendly messages for auth failures. Mirrors the Java SDK `ResponseHandler`.
 */
function buildErrorMessage(operation: string, status: number, responseText: string): string {
  if (status === 401) {
    return `${operation} failed: authentication failed — check your API key, access token, or accessTokenProvider`;
  }
  if (status === 403) {
    return `${operation} failed: access forbidden — insufficient permissions`;
  }

  let detail = responseText;
  if (responseText) {
    try {
      const parsed = JSON.parse(responseText) as Record<string, unknown>;
      const message = parsed.message ?? parsed.error ?? parsed.error_description;
      if (typeof message === "string" && message.trim() !== "") {
        detail = message;
      }
    } catch {
      // Body is not JSON — fall back to the raw text.
    }
  }

  return `${operation} failed with status ${status}: ${detail}`;
}

/**
 * Default HTTP implementation of {@link CheqiApiClient}.
 *
 * Uses the global `fetch` (or an injected implementation) with automatic
 * retry, bearer-token auth, and structured logging.
 */
export class DefaultCheqiApiClient implements CheqiApiClient {
  private readonly retryHandler: RetryHandler;
  private readonly userAgent: string;
  private readonly logger: Logger;

  constructor(
    private readonly config: CheqiSDKConfig,
    private readonly fetchImpl: FetchLike = (input, init) => globalThis.fetch(input, init)
  ) {
    if (!config) {
      throw new Error("CheqiSDKConfig is required");
    }
    this.logger = config.logger ?? new NoopLogger();
    this.retryHandler = new RetryHandler({ maxRetries: config.maxRetries, logger: this.logger });
    this.userAgent = `CheqiSDK-TypeScript/${SDK_VERSION}`;
  }

  async requestAccessToken(
    request: ClientCredentialsTokenRequest,
    options?: RequestOptions | null
  ): Promise<OAuthTokenExchangeResponse> {
    if (!request?.client_id?.trim() || !request.client_secret?.trim() || !request.grant_id?.trim()) {
      throw new CheqiApiError("Token request requires client_id, client_secret and grant_id", {
        errorCode: ErrorCodes.INVALID_REQUEST, httpStatusCode: 400
      });
    }
    // The generated serializer keeps the snake_case OAuth field names; client credentials
    // travel in the body, so this call carries no bearer credential.
    const body = JSON.stringify(ClientCredentialsTokenRequestToJSON({ grant_type: "client_credentials", ...request }));
    const token = OAuthTokenExchangeResponseFromJSON(await this.request("POST", Endpoints.OAUTH_TOKEN_ENDPOINT, {
      body, options, authenticate: false, operation: "requestAccessToken", retryable: false
    }));
    if (!token.access_token?.trim()) {
      throw new CheqiApiError("Token response did not include an access token", { errorCode: ErrorCodes.INVALID_RESPONSE });
    }
    return token;
  }

  async getMatch(matchId: string, options?: RequestOptions | null): Promise<MatchStatusResponse> {
    if (!matchId?.trim()) {
      throw new CheqiApiError("matchId is required", {
        errorCode: ErrorCodes.INVALID_REQUEST, httpStatusCode: 400
      });
    }
    return MatchStatusResponseFromJSON(await this.request("GET", Endpoints.MATCH_STATUS_ENDPOINT(matchId), {
      options, operation: "getMatch"
    }));
  }

  async matchCustomer(
    request: IdentificationDetails,
    options?: RequestOptions | null
  ): Promise<RecipientResolutionResponse> {
    return RecipientResolutionResponseFromJSON(await this.request("POST", Endpoints.CUSTOMER_MATCH_ENDPOINT, {
      body: normalizeValue(request),
      options,
      operation: "matchCustomer"
    }));
  }

  async submitEncryptedReceipt(
    envelope: EncryptedReceiptEnvelope,
    options?: RequestOptions | null
  ): Promise<ReceiptSubmissionResponse> {
    if (!envelope?.matchId?.trim() || !envelope.deviceDeliveries?.length) {
      throw new CheqiApiError("Encrypted receipt envelope requires matchId and deviceDeliveries", {
        errorCode: ErrorCodes.INVALID_REQUEST,
        httpStatusCode: 400
      });
    }
    return this.submission("POST", Endpoints.ENCRYPTED_RECEIPT_ENDPOINT, {
      body: normalizeValue(envelope),
      options,
      operation: "submitEncryptedReceipt"
    });
  }

  async uploadEncryptedDownloadReceipt(
    request: ClientReceiptDownloadRequest,
    options?: RequestOptions | null
  ): Promise<ClientReceiptDownloadResponse> {
    if (!request?.downloadId || !/^[A-Za-z0-9_-]{22,64}$/.test(request.downloadId)) {
      throw new CheqiApiError("downloadId must be 22-64 base64url characters", {
        errorCode: ErrorCodes.INVALID_REQUEST,
        httpStatusCode: 400
      });
    }
    if (!request.ciphertext?.trim()) {
      throw new CheqiApiError("ciphertext is required", {
        errorCode: ErrorCodes.INVALID_REQUEST,
        httpStatusCode: 400
      });
    }
    return ClientReceiptDownloadResponseFromJSON(await this.request("POST", Endpoints.CLIENT_RECEIPT_DOWNLOAD_ENDPOINT, {
      body: normalizeValue(request),
      options,
      operation: "uploadEncryptedDownloadReceipt",
      retryable: true
    }));
  }

  async submitEncryptedCreditNote(
    envelope: EncryptedCreditNoteEnvelope,
    options?: RequestOptions | null
  ): Promise<ReceiptSubmissionResponse> {
    if (
      !envelope?.matchId?.trim() ||
      !envelope.parentCheqiReceiptId?.trim() ||
      !envelope.deviceDeliveries?.length
    ) {
      throw new CheqiApiError(
        "Encrypted credit-note envelope requires matchId, parentCheqiReceiptId, and deviceDeliveries",
        { errorCode: ErrorCodes.INVALID_REQUEST, httpStatusCode: 400 }
      );
    }
    return this.submission("POST", Endpoints.ENCRYPTED_CREDIT_NOTE_ENDPOINT, {
      body: normalizeValue(envelope),
      options,
      operation: "submitEncryptedCreditNote"
    });
  }

  async sendReceiptViaEmail(
    customerEmail: string,
    receipt: CheqiReceipt,
    options?: RequestOptions | null
  ): Promise<void> {
    await this.request("POST", Endpoints.EMAIL_RECEIPT_ENDPOINT, {
      body: {
        customerEmail,
        cheqiReceipt: normalizeValue(receipt)
      },
      options,
      operation: "sendReceiptViaEmail",
      responseType: "void"
    });
  }

  async createStore(companyId: string, request: CreateStoreRequest, options?: RequestOptions | null): Promise<StoreDTO> {
    return StoreDTOFromJSON(await this.request("POST", Endpoints.COMPANY_STORES_ENDPOINT(companyId), {
      body: normalizeValue(request),
      options,
      operation: "createStore"
    }));
  }

  async inviteUsers(companyId: string, emails: string[], resendPending?: boolean, options?: RequestOptions | null): Promise<InviteEmployeesResponse> {
    return InviteEmployeesResponseFromJSON(await this.request("POST", Endpoints.COMPANY_INVITE_EMPLOYEES_ENDPOINT(companyId), {
      body: { emails, resendPending },
      options,
      operation: "inviteEmployees"
    }));
  }

  async listReceiptDestinations(options?: RequestOptions | null): Promise<DestinationResponse[]> {
    const result = await this.request("GET", Endpoints.RECEIPT_DESTINATIONS_ENDPOINT, {
      options, operation: "listReceiptDestinations", responseType: "list"
    });
    return (result as unknown[]).map(DestinationResponseFromJSON);
  }

  async registerReceiptDestination(request: RegisterRequest, options?: RequestOptions | null): Promise<RegisterResponse> {
    return RegisterResponseFromJSON(await this.request("POST", Endpoints.RECEIPT_DESTINATIONS_ENDPOINT, {
      body: normalizeValue(request), options, operation: "registerReceiptDestination"
    }));
  }

  async getPendingReceipts(destinationId: string, options?: RequestOptions | null): Promise<WebhookReceiptEnvelope[]> {
    const result = await this.request("GET", Endpoints.RECEIPT_DESTINATION_QUEUE_ENDPOINT(destinationId), {
      options, operation: "getPendingReceipts", responseType: "list"
    });
    return (result as unknown[]).map(WebhookReceiptEnvelopeFromJSON);
  }

  async acknowledgeReceipts(destinationId: string, receiptIds: string[], options?: RequestOptions | null): Promise<void> {
    await this.request("POST", Endpoints.RECEIPT_DESTINATION_ACKNOWLEDGE_ENDPOINT(destinationId), {
      body: { receiptIds }, options, operation: "acknowledgeReceipts", responseType: "void"
    });
  }

  async deactivateReceiptDestination(destinationId: string, options?: RequestOptions | null): Promise<void> {
    await this.request("DELETE", Endpoints.RECEIPT_DESTINATION_ENDPOINT(destinationId), {
      options, operation: "deactivateReceiptDestination", responseType: "void"
    });
  }

  async updateWebhookSubscriptionUrl(subscriptionId: string, notificationUrl: string, options?: RequestOptions | null): Promise<WebhookDTO> {
    return WebhookDTOFromJSON(await this.request("PATCH", Endpoints.WEBHOOK_SUBSCRIPTION_ENDPOINT(subscriptionId), {
      body: { notificationUrl }, options, operation: "updateWebhookSubscriptionUrl"
    }));
  }

  async getStores(companyId: string, activeOnly?: boolean, options?: RequestOptions | null): Promise<StoreDTO[]> {
    const stores = await this.request("GET", Endpoints.COMPANY_STORES_ENDPOINT(companyId), {
      // `activeOnly=false` means no filter; the API parameter itself is named `active`.
      params: { active: activeOnly ? true : undefined },
      options,
      operation: "getStores",
      responseType: "list"
    });
    return (stores as unknown[]).map(StoreDTOFromJSON);
  }

  async getStore(companyId: string, storeId: string, options?: RequestOptions | null): Promise<StoreDTO> {
    return StoreDTOFromJSON(await this.request("GET", Endpoints.COMPANY_STORE_ENDPOINT(companyId, storeId), {
      options,
      operation: "getStore"
    }));
  }

  async updateStore(companyId: string, storeId: string, request: UpdateStoreRequest, options?: RequestOptions | null): Promise<StoreDTO> {
    return StoreDTOFromJSON(await this.request("PUT", Endpoints.COMPANY_STORE_ENDPOINT(companyId, storeId), {
      body: normalizeValue(request),
      options,
      operation: "updateStore"
    }));
  }

  async deleteStore(companyId: string, storeId: string, options?: RequestOptions | null): Promise<void> {
    await this.request("DELETE", Endpoints.COMPANY_STORE_ENDPOINT(companyId, storeId), {
      options,
      operation: "deleteStore",
      responseType: "void"
    });
  }

  async activateStore(companyId: string, storeId: string, options?: RequestOptions | null): Promise<void> {
    await this.request("PATCH", Endpoints.COMPANY_STORE_ACTIVATE_ENDPOINT(companyId, storeId), {
      options,
      operation: "activateStore",
      responseType: "void"
    });
  }

  async deactivateStore(companyId: string, storeId: string, options?: RequestOptions | null): Promise<void> {
    await this.request("PATCH", Endpoints.COMPANY_STORE_DEACTIVATE_ENDPOINT(companyId, storeId), {
      options,
      operation: "deactivateStore",
      responseType: "void"
    });
  }

  private async submission(method: string, path: string, call: HttpCallOptions): Promise<ReceiptSubmissionResponse> {
    const body = await this.request(method, path, call);
    if (body?.state === "IN_PROGRESS") {
      const seconds = Number.isInteger(body.retryAfterSeconds) ? body.retryAfterSeconds : 2;
      throw new SubmissionInProgressError(Math.max(1, seconds));
    }
    if (typeof body !== "object" || Array.isArray(body) ||
        typeof body.cheqiReceiptId !== "string" || !body.cheqiReceiptId.trim() ||
        typeof body.matchId !== "string" || !body.matchId.trim()) {
      throw new CheqiApiError("Invalid receipt submission response", { errorCode: ErrorCodes.INVALID_RESPONSE });
    }
    return ReceiptSubmissionResponseFromJSON(body);
  }

  // ---------- internals ----------

  /** Uses per-call credentials, the token provider, then the configured API key. */
  private async headers(options: RequestOptions, authenticate: boolean): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": this.userAgent
    };
    if (!authenticate) return headers;
    let token = options.accessToken ?? this.config.apiKey;
    if (options.accessToken == null && this.config.accessTokenProvider) {
      try {
        token = await this.config.accessTokenProvider();
      } catch (cause) {
        throw new CheqiApiError("accessTokenProvider failed to supply credentials", {
          errorCode: ErrorCodes.AUTHENTICATION_FAILED, httpStatusCode: 401, cause
        });
      }
    }
    if (typeof token !== "string" || !token.trim()) {
      throw new CheqiApiError("No credentials for this call: pass { accessToken } or configure accessTokenProvider or apiKey", {
        errorCode: ErrorCodes.AUTHENTICATION_FAILED,
        httpStatusCode: 401
      });
    }
    return { Authorization: `Bearer ${token}`, ...headers };
  }

  private async request(
    method: string,
    path: string,
    { body, params, options, authenticate = true, operation, retryable, responseType = "json" }: HttpCallOptions
  ): Promise<any> {
    const callOptions = validateRequestOptions(options);
    const url = resolveEndpoint(this.config.apiEndpoint, path);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    this.logger.debug(`${operation} ${method} ${url.pathname}`);

    const timeoutMs = (callOptions.timeoutSeconds ?? this.config.timeoutSeconds) * 1000;
    let cancelTimeout: () => void = () => {};
    let timedOut = false;
    let previousController: AbortController | undefined;
    try {
      const response = await this.retryHandler.executeWithRetry(
        async () => {
          cancelTimeout();
          previousController?.abort();
          const headers = await this.headers(callOptions, authenticate);
          const controller = new AbortController();
          previousController = controller;
          timedOut = false;
          const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
          cancelTimeout = () => clearTimeout(timer);
          try {
            const fetchImpl = this.fetchImpl;
            return await fetchImpl(url.toString(), {
              method, headers,
              body: body === undefined ? undefined : typeof body === "string" ? body : serializeJson(body),
              signal: controller.signal
            });
          } catch (error) {
            cancelTimeout();
            throw error;
          }
        },
        operation,
        retryable ?? isIdempotentMethod(method),
        callOptions.maxRetries,
        authenticate && callOptions.accessToken == null && this.config.accessTokenProvider != null
      );

      if (response.status >= 400) {
        const responseText = await readResponseText(response);
        const correlationId = response.headers.get("x-correlation-id");
        this.logger.error(
          `${operation} failed: status=${response.status}, correlationId=${correlationId ?? "none"}`
        );
        throw new CheqiApiError(buildErrorMessage(operation, response.status, responseText), {
          errorCode: mapErrorCode(response.status),
          httpStatusCode: response.status,
          correlationId
        });
      }

      this.logger.debug(`${operation} completed: status=${response.status}`);

      if (responseType === "void") return undefined;

      const text = await readResponseText(response);
      if (!text) {
        if (responseType === "list") return [];
        throw invalidResponseError(operation, response, "an empty response");
      }
      try {
        const parsed = JSON.parse(text);
        if (parsed == null) throw invalidResponseError(operation, response, "a null JSON response");
        if (responseType === "list" && !Array.isArray(parsed)) {
          throw invalidResponseError(operation, response, "JSON that is not an array");
        }
        return parsed;
      } catch (error) {
        if (error instanceof CheqiApiError) throw error;
        throw new CheqiApiError(`${operation} returned an invalid (non-JSON) response`, {
          errorCode: ErrorCodes.INVALID_RESPONSE,
          httpStatusCode: response.status,
          correlationId: response.headers.get("x-correlation-id"),
          cause: error
        });
      }
    } catch (cause) {
      if (timedOut && (!(cause instanceof CheqiApiError) || cause.httpStatusCode === 0)) {
        throw new CheqiApiError(`${operation} timed out`, { errorCode: ErrorCodes.TIMEOUT_ERROR, cause });
      }
      throw cause;
    } finally {
      cancelTimeout();
    }
  }
}

async function readResponseText(response: FetchResponse): Promise<string> {
  try {
    return await response.text();
  } catch (cause) {
    throw new CheqiApiError("API response could not be read", {
      errorCode: response.status >= 400 ? mapErrorCode(response.status) : ErrorCodes.NETWORK_ERROR,
      httpStatusCode: response.status >= 400 ? response.status : 0,
      correlationId: response.headers.get("x-correlation-id"),
      cause
    });
  }
}

function invalidResponseError(
  operation: string,
  response: FetchResponse,
  detail: string
): CheqiApiError {
  return new CheqiApiError(`${operation} returned ${detail}`, {
    errorCode: ErrorCodes.INVALID_RESPONSE,
    httpStatusCode: response.status,
    correlationId: response.headers.get("x-correlation-id")
  });
}

function resolveEndpoint(apiEndpoint: string, path: string): URL {
  const normalizedBase = apiEndpoint.endsWith("/") ? apiEndpoint : `${apiEndpoint}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase);
}

function isIdempotentMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "PUT" || method === "DELETE";
}
