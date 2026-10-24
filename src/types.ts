export type Nullable<T> = T | null;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export type {
  AddressDTO,
  Barcode,
  BarcodeType,
  BuyerType,
  CardDetails,
  Charge,
  CheqiReceipt,
  ClientReceiptDownloadRequest,
  ClientReceiptDownloadResponse,
  CompanyCreationRequest,
  CreateStoreRequest,
  CreditNoteContextEnvelope,
  CreditNoteInitiationRequest,
  Discount,
  EncryptedCreditNoteEnvelope,
  EncryptedCreditNoteInitiationRequest,
  EncryptedCreditNoteInitiationRequestResponse,
  EncryptedReceiptDeliveryResponse,
  EncryptedReceiptEnvelope,
  EncryptedReceiptPayload,
  FiscalizationData,
  IdentificationDetails,
  Identifier,
  JurisdictionalData,
  MatchedRecipient,
  MatchStatusResponse,
  PaymentAccountDetails,
  PaymentDetails,
  Period,
  Product,
  ReceiptEnvelope,
  ReceiptEnvelopeDocument,
  ReceiptFormat,
  ReceiptPayload,
  ReceiptSubmissionResponse,
  RecipientResolutionResponse,
  RefundBankAccount,
  RefundPreference,
  ReturnLineItem,
  ReturnReasonCode,
  SellingParty,
  ReceivingParty,
  StoreDTO,
  Tax,
  UpdateStoreRequest,
  WebhookCreditNoteInitiationRequest,
  WebhookReceiptEnvelope
} from "./models/generated/index.js";

import type { RequestOptions } from "./http/request-options.js";
export type { RequestOptions, ReceiptIssueOptions } from "./http/request-options.js";

export interface CheqiSDKOptions {
  /** Cheqi API base URL, usually one of the Environment constants. */
  apiEndpoint: string;
  receiptDownloadBaseUrl?: string;
  apiKey?: Nullable<string>;
  /** OAuth or short-lived token, resolved before each API request. */
  accessTokenProvider?: () => string | Promise<string>;
  privateKey?: Nullable<string>;
  timeoutSeconds?: number;
  maxRetries?: number;
  logger?: import("./logger.js").Logger;
  /** Custom Fetch-compatible transport, useful for instrumentation and testing. */
  fetch?: FetchLike;
  /** Fully custom API client. When set, `fetch` is ignored. */
  apiClient?: CheqiApiClient;
}

/** Internal options for one HTTP call made by {@link CheqiApiClient} implementations. */
export interface HttpCallOptions {
  body?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
  options?: RequestOptions | null;
  /** Set to false for calls that carry their own credentials, such as the token request. */
  authenticate?: boolean;
  operation: string;
  /** Override whether transient failures may be retried for this operation. */
  retryable?: boolean;
  /** Expected successful response shape. Defaults to a non-null JSON value. */
  responseType?: "json" | "list" | "void";
}

export type FetchLike = typeof fetch;

/**
 * HTTP boundary used by the handwritten SDK services.
 * Every call takes optional {@link RequestOptions} as its last argument.
 */
export interface CheqiApiClient {
  requestAccessToken(
    request: import("./models/generated/index.js").ClientCredentialsTokenRequest,
    options?: RequestOptions | null
  ): Promise<import("./models/generated/index.js").OAuthTokenExchangeResponse>;
  getMatch(
    matchId: string,
    options?: RequestOptions | null
  ): Promise<import("./models/generated/index.js").MatchStatusResponse>;
  matchCustomer(
    request: import("./models/generated/index.js").IdentificationDetails,
    options?: RequestOptions | null
  ): Promise<import("./models/generated/index.js").RecipientResolutionResponse>;
  submitEncryptedReceipt(
    request: import("./models/generated/index.js").EncryptedReceiptEnvelope,
    options?: RequestOptions | null
  ): Promise<import("./models/generated/index.js").ReceiptSubmissionResponse>;
  submitEncryptedCreditNote(
    request: import("./models/generated/index.js").EncryptedCreditNoteEnvelope,
    options?: RequestOptions | null
  ): Promise<import("./models/generated/index.js").ReceiptSubmissionResponse>;
  uploadEncryptedDownloadReceipt(
    request: import("./models/generated/index.js").ClientReceiptDownloadRequest,
    options?: RequestOptions | null
  ): Promise<import("./models/generated/index.js").ClientReceiptDownloadResponse>;
  sendReceiptViaEmail(
    customerEmail: string,
    receipt: import("./models/generated/index.js").CheqiReceipt,
    options?: RequestOptions | null
  ): Promise<void>;
  createStore(
    companyId: string,
    request: import("./models/generated/index.js").CreateStoreRequest,
    options?: RequestOptions | null
  ): Promise<import("./models/generated/index.js").StoreDTO>;
  inviteUsers(companyId: string, emails: string[], resendPending?: boolean, options?: RequestOptions | null): Promise<import("./models/generated/index.js").InviteEmployeesResponse>;
  listReceiptDestinations(options?: RequestOptions | null): Promise<import("./models/generated/index.js").DestinationResponse[]>;
  registerReceiptDestination(request: import("./models/generated/index.js").RegisterRequest, options?: RequestOptions | null): Promise<import("./models/generated/index.js").RegisterResponse>;
  getPendingReceipts(destinationId: string, options?: RequestOptions | null): Promise<import("./models/generated/index.js").WebhookReceiptEnvelope[]>;
  acknowledgeReceipts(destinationId: string, receiptIds: string[], options?: RequestOptions | null): Promise<void>;
  deactivateReceiptDestination(destinationId: string, options?: RequestOptions | null): Promise<void>;
  updateWebhookSubscriptionUrl(subscriptionId: string, notificationUrl: string, options?: RequestOptions | null): Promise<import("./models/generated/index.js").WebhookDTO>;
  getStores(
    companyId: string,
    activeOnly?: boolean,
    options?: RequestOptions | null
  ): Promise<import("./models/generated/index.js").StoreDTO[]>;
  getStore(
    companyId: string,
    storeId: string,
    options?: RequestOptions | null
  ): Promise<import("./models/generated/index.js").StoreDTO>;
  updateStore(
    companyId: string,
    storeId: string,
    request: import("./models/generated/index.js").UpdateStoreRequest,
    options?: RequestOptions | null
  ): Promise<import("./models/generated/index.js").StoreDTO>;
  deleteStore(companyId: string, storeId: string, options?: RequestOptions | null): Promise<void>;
  activateStore(companyId: string, storeId: string, options?: RequestOptions | null): Promise<void>;
  deactivateStore(companyId: string, storeId: string, options?: RequestOptions | null): Promise<void>;
}
