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
import { Endpoints } from "./endpoints.js";
import { RetryHandler } from "./retry.js";

const SDK_VERSION = "3.0.0";

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
    return `${operation} failed: authentication failed — check your API key or access token`;
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
    private readonly fetchImpl: FetchLike = globalThis.fetch
  ) {
    if (!config) {
      throw new Error("CheqiSDKConfig is required");
    }
    this.logger = config.logger ?? new NoopLogger();
    this.retryHandler = new RetryHandler({ maxRetries: config.maxRetries, logger: this.logger });
    this.userAgent = `CheqiSDK-TypeScript/${SDK_VERSION}`;
  }

  async getMatch(matchId: string, accessToken?: string | null): Promise<MatchStatusResponse> {
    if (!matchId?.trim()) {
      throw new CheqiApiError("matchId is required", {
        errorCode: ErrorCodes.INVALID_REQUEST, httpStatusCode: 400
      });
    }
    return MatchStatusResponseFromJSON(await this.request("GET", Endpoints.MATCH_STATUS_ENDPOINT(matchId), {
      accessToken, operation: "getMatch"
    }));
  }

  async matchCustomer(
    request: IdentificationDetails,
    accessToken?: string | null
  ): Promise<RecipientResolutionResponse> {
    return RecipientResolutionResponseFromJSON(await this.request("POST", Endpoints.CUSTOMER_MATCH_ENDPOINT, {
      body: normalizeValue(request),
      accessToken,
      operation: "matchCustomer"
    }));
  }

  async submitEncryptedReceipt(
    envelope: EncryptedReceiptEnvelope,
    accessToken?: string | null
  ): Promise<ReceiptSubmissionResponse> {
    if (!envelope?.matchId?.trim() || !envelope.deviceDeliveries?.length) {
      throw new CheqiApiError("Encrypted receipt envelope requires matchId and deviceDeliveries", {
        errorCode: ErrorCodes.INVALID_REQUEST,
        httpStatusCode: 400
      });
    }
    return this.submission("POST", Endpoints.ENCRYPTED_RECEIPT_ENDPOINT, {
      body: normalizeValue(envelope),
      accessToken,
      operation: "submitEncryptedReceipt"
    });
  }

  async uploadEncryptedDownloadReceipt(
    request: ClientReceiptDownloadRequest,
    accessToken?: string | null
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
      accessToken,
      operation: "uploadEncryptedDownloadReceipt",
      retryable: true
    }));
  }

  async submitEncryptedCreditNote(
    envelope: EncryptedCreditNoteEnvelope,
    accessToken?: string | null
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
      accessToken,
      operation: "submitEncryptedCreditNote"
    });
  }

  async sendReceiptViaEmail(
    customerEmail: string,
    receipt: CheqiReceipt,
    accessToken?: string | null
  ): Promise<void> {
    await this.request("POST", Endpoints.EMAIL_RECEIPT_ENDPOINT, {
      body: {
        customerEmail,
        cheqiReceipt: normalizeValue(receipt)
      },
      accessToken,
      operation: "sendReceiptViaEmail",
      responseType: "void"
    });
  }

  async createStore(companyId: string, request: CreateStoreRequest, accessToken?: string | null): Promise<StoreDTO> {
    return StoreDTOFromJSON(await this.request("POST", Endpoints.COMPANY_STORES_ENDPOINT(companyId), {
      body: normalizeValue(request),
      accessToken,
      operation: "createStore"
    }));
  }

  async getStores(companyId: string, activeOnly?: boolean, accessToken?: string | null): Promise<StoreDTO[]> {
    const stores = await this.request("GET", Endpoints.COMPANY_STORES_ENDPOINT(companyId), {
      // `activeOnly=false` means no filter; the API parameter itself is named `active`.
      params: { active: activeOnly ? true : undefined },
      accessToken,
      operation: "getStores",
      responseType: "list"
    });
    return (stores as unknown[]).map(StoreDTOFromJSON);
  }

  async getStore(companyId: string, storeId: string, accessToken?: string | null): Promise<StoreDTO> {
    return StoreDTOFromJSON(await this.request("GET", Endpoints.COMPANY_STORE_ENDPOINT(companyId, storeId), {
      accessToken,
      operation: "getStore"
    }));
  }

  async updateStore(companyId: string, storeId: string, request: UpdateStoreRequest, accessToken?: string | null): Promise<StoreDTO> {
    return StoreDTOFromJSON(await this.request("PUT", Endpoints.COMPANY_STORE_ENDPOINT(companyId, storeId), {
      body: normalizeValue(request),
      accessToken,
      operation: "updateStore"
    }));
  }

  async deleteStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void> {
    await this.request("DELETE", Endpoints.COMPANY_STORE_ENDPOINT(companyId, storeId), {
      accessToken,
      operation: "deleteStore",
      responseType: "void"
    });
  }

  async activateStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void> {
    await this.request("PATCH", Endpoints.COMPANY_STORE_ACTIVATE_ENDPOINT(companyId, storeId), {
      accessToken,
      operation: "activateStore",
      responseType: "void"
    });
  }

  async deactivateStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void> {
    await this.request("PATCH", Endpoints.COMPANY_STORE_DEACTIVATE_ENDPOINT(companyId, storeId), {
      accessToken,
      operation: "deactivateStore",
      responseType: "void"
    });
  }

  private async submission(method: string, path: string, options: RequestOptions): Promise<ReceiptSubmissionResponse> {
    const body = await this.request(method, path, options);
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

  private async authHeaders(accessToken?: string | null): Promise<Record<string, string>> {
    const token = accessToken ?? (this.config.accessTokenProvider
      ? await this.config.accessTokenProvider() : this.config.apiKey);
    if (!token?.trim()) {
      throw new CheqiApiError("No authentication token available", {
        errorCode: ErrorCodes.AUTHENTICATION_FAILED,
        httpStatusCode: 401
      });
    }

    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": this.userAgent
    };
  }

  private async request(
    method: string,
    path: string,
    { body, params, accessToken, operation, retryable, responseType = "json" }: RequestOptions
  ): Promise<any> {
    const url = resolveEndpoint(this.config.apiEndpoint, path);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    this.logger.debug(`${operation} ${method} ${url.pathname}`);

    const headers = await this.authHeaders(accessToken);
    const response = await this.retryHandler.executeWithRetry(
      () => this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : typeof body === "string" ? body : serializeJson(body),
        signal: AbortSignal.timeout(this.config.timeoutSeconds * 1000)
      }),
      operation,
      retryable ?? isIdempotentMethod(method)
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

    if (responseType === "void") {
      return undefined;
    }

    const text = await readResponseText(response);
    if (!text) {
      if (responseType === "list") return [];
      throw invalidResponseError(operation, response, "an empty response");
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed == null) {
        throw invalidResponseError(operation, response, "a null JSON response");
      }
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
  }
}

async function readResponseText(response: Response): Promise<string> {
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
  response: Response,
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
