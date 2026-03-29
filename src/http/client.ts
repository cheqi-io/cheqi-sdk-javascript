import { CheqiSDKConfig } from "../config.js";
import { CheqiApiError, ErrorCodes } from "../errors.js";
import type { Logger } from "../logger.js";
import { NoopLogger } from "../logger.js";
import type {
  CheqiApiClient,
  CreateStoreRequest,
  CreditNoteTemplateGenerationRequest,
  CreditNoteTemplateResponse,
  EncryptedCreditNote,
  EncryptedReceiptRequest,
  FetchLike,
  IdentificationDetails,
  ProvisionCompanyRequest,
  ReceiptTemplateGenerationRequest,
  ReceiptTemplateResponse,
  RecipientResolutionResponse,
  RequestOptions
} from "../types.js";
import { normalizeValue, serializeJson } from "../utils.js";
import { Endpoints } from "./endpoints.js";
import { RetryHandler } from "./retry.js";

// read version at module load; falls back gracefully
const SDK_VERSION: string = (() => {
  try {
    // Dynamic import not needed — we just embed the constant at build time.
    return "0.1.0";
  } catch {
    return "unknown";
  }
})();

function mapErrorCode(status: number) {
  if (status === 401) return ErrorCodes.AUTHENTICATION_FAILED;
  if (status === 403) return ErrorCodes.AUTHORIZATION_FAILED;
  if (status === 404) return ErrorCodes.RECEIPT_NOT_FOUND;
  if (status === 429) return ErrorCodes.RATE_LIMITED;
  if (status >= 500) return ErrorCodes.SERVER_ERROR;
  return ErrorCodes.UNKNOWN_ERROR;
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

  async generateReceiptTemplate(
    request: ReceiptTemplateGenerationRequest,
    accessToken?: string | null
  ): Promise<ReceiptTemplateResponse> {
    return this.request("POST", Endpoints.TEMPLATE_ENDPOINT, {
      body: normalizeValue(request),
      accessToken,
      operation: "generateReceiptTemplate"
    });
  }

  async generateCreditNoteTemplate(
    request: CreditNoteTemplateGenerationRequest,
    accessToken?: string | null
  ): Promise<CreditNoteTemplateResponse> {
    return this.request("POST", Endpoints.CREDIT_NOTE_TEMPLATE_ENDPOINT, {
      body: normalizeValue(request),
      accessToken,
      operation: "generateCreditNoteTemplate"
    });
  }

  async matchCustomer(
    request: IdentificationDetails,
    accessToken?: string | null
  ): Promise<RecipientResolutionResponse> {
    return this.request("POST", Endpoints.CUSTOMER_MATCH_ENDPOINT, {
      body: normalizeValue(request),
      accessToken,
      operation: "matchCustomer"
    });
  }

  async sendEncryptedReceipts(
    matchId: string,
    encryptedReceipts: EncryptedReceiptRequest[],
    templateHash: string,
    accessToken?: string | null
  ): Promise<Record<string, unknown>> {
    return this.request("POST", Endpoints.ENCRYPTED_RECEIPT_ENDPOINT, {
      body: {
        matchId,
        encryptedReceipts: encryptedReceipts.map((receipt) => normalizeValue(receipt)),
        templateHash
      },
      accessToken,
      operation: "sendEncryptedReceipts"
    });
  }

  async sendEncryptedCreditNotes(
    matchId: string,
    parentCheqiReceiptId: string,
    encryptedCreditNotes: EncryptedCreditNote[],
    templateHash: string,
    accessToken?: string | null
  ): Promise<Record<string, unknown>> {
    return this.request("POST", Endpoints.ENCRYPTED_CREDIT_NOTE_ENDPOINT, {
      body: {
        matchId,
        parentCheqiReceiptId,
        encryptedCreditNotes: encryptedCreditNotes.map((creditNote) => normalizeValue(creditNote)),
        templateHash
      },
      accessToken,
      operation: "sendEncryptedCreditNotes"
    });
  }

  async sendReceiptViaEmail(
    customerEmail: string,
    receipt: Record<string, unknown> | string,
    accessToken?: string | null
  ): Promise<void> {
    await this.request("POST", Endpoints.EMAIL_RECEIPT_ENDPOINT, {
      body: {
        customerEmail,
        cheqiReceipt: typeof receipt === "string" ? JSON.parse(receipt) : receipt
      },
      accessToken,
      operation: "sendReceiptViaEmail"
    });
  }

  async provisionCompany(request: ProvisionCompanyRequest): Promise<Record<string, unknown>> {
    return this.request("POST", Endpoints.COMPANY_PROVISION_ENDPOINT, {
      body: normalizeValue(request),
      operation: "provisionCompany"
    });
  }

  async createStore(companyId: string, request: CreateStoreRequest, accessToken?: string | null): Promise<Record<string, unknown>> {
    return this.request("POST", Endpoints.COMPANY_STORES_ENDPOINT(companyId), {
      body: normalizeValue(request),
      accessToken,
      operation: "createStore"
    });
  }

  async getStores(companyId: string, activeOnly?: boolean, accessToken?: string | null): Promise<Record<string, unknown>> {
    return this.request("GET", Endpoints.COMPANY_STORES_ENDPOINT(companyId), {
      params: { activeOnly },
      accessToken,
      operation: "getStores"
    });
  }

  async getStore(companyId: string, storeId: string, accessToken?: string | null): Promise<Record<string, unknown>> {
    return this.request("GET", Endpoints.COMPANY_STORE_ENDPOINT(companyId, storeId), {
      accessToken,
      operation: "getStore"
    });
  }

  async updateStore(companyId: string, storeId: string, request: CreateStoreRequest, accessToken?: string | null): Promise<Record<string, unknown>> {
    return this.request("PUT", Endpoints.COMPANY_STORE_ENDPOINT(companyId, storeId), {
      body: normalizeValue(request),
      accessToken,
      operation: "updateStore"
    });
  }

  async deleteStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void> {
    await this.request("DELETE", Endpoints.COMPANY_STORE_ENDPOINT(companyId, storeId), { accessToken, operation: "deleteStore" });
  }

  async activateStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void> {
    await this.request("POST", Endpoints.COMPANY_STORE_ACTIVATE_ENDPOINT(companyId, storeId), { body: {}, accessToken, operation: "activateStore" });
  }

  async deactivateStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void> {
    await this.request("POST", Endpoints.COMPANY_STORE_DEACTIVATE_ENDPOINT(companyId, storeId), { body: {}, accessToken, operation: "deactivateStore" });
  }

  // ---------- internals ----------

  private authHeaders(accessToken?: string | null): Record<string, string> {
    const token = accessToken ?? this.config.apiKey;
    if (!token) {
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
    { body, params, accessToken, operation }: RequestOptions
  ): Promise<any> {
    const url = new URL(path, this.config.apiEndpoint);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    this.logger.debug(`${operation} ${method} ${url.pathname}`);

    const response = await this.retryHandler.executeWithRetry(
      () => this.fetchImpl(url, {
        method,
        headers: this.authHeaders(accessToken),
        body: body === undefined ? undefined : typeof body === "string" ? body : serializeJson(body),
        signal: AbortSignal.timeout(this.config.timeoutSeconds * 1000)
      }),
      operation
    );

    if (response.status >= 400) {
      const responseText = await response.text();
      const correlationId = response.headers.get("x-correlation-id");
      this.logger.error(
        `${operation} failed: status=${response.status}, correlationId=${correlationId ?? "none"}, body=${responseText.slice(0, 500)}`
      );
      throw new CheqiApiError(`${operation} failed with status ${response.status}: ${responseText}`, {
        errorCode: mapErrorCode(response.status),
        httpStatusCode: response.status,
        correlationId
      });
    }

    this.logger.debug(`${operation} completed: status=${response.status}`);

    if (response.status === 204) {
      return undefined;
    }

    const text = await response.text();
    if (!text) {
      return undefined;
    }
    return JSON.parse(text);
  }
}
