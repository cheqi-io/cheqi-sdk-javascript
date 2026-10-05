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

/** Options shared by receipt issuance, recovery, and credit-note issuance. */
export interface ReceiptIssueOptions {
  storeId?: string | null;
  accessToken?: string | null;
}

export interface CheqiSDKOptions {
  /** Cheqi API base URL, usually one of the Environment constants. */
  apiEndpoint: string;
  receiptDownloadBaseUrl?: string;
  apiKey?: Nullable<string>;
  privateKey?: Nullable<string>;
  timeoutSeconds?: number;
  maxRetries?: number;
  logger?: import("./logger.js").Logger;
  /** Custom Fetch-compatible transport, useful for instrumentation and testing. */
  fetch?: FetchLike;
  /** Fully custom API client. When set, `fetch` is ignored. */
  apiClient?: CheqiApiClient;
}

export interface RequestOptions {
  body?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
  accessToken?: string | null;
  operation: string;
  /** Override whether transient failures may be retried for this operation. */
  retryable?: boolean;
  /** Expected successful response shape. Defaults to a non-null JSON value. */
  responseType?: "json" | "list" | "void";
}

export type FetchLike = typeof fetch;

/** HTTP boundary used by the handwritten SDK services. */
export interface CheqiApiClient {
  getMatch(
    matchId: string,
    accessToken?: string | null
  ): Promise<import("./models/generated/index.js").MatchStatusResponse>;
  matchCustomer(
    request: import("./models/generated/index.js").IdentificationDetails,
    accessToken?: string | null
  ): Promise<import("./models/generated/index.js").RecipientResolutionResponse>;
  submitEncryptedReceipt(
    request: import("./models/generated/index.js").EncryptedReceiptEnvelope,
    accessToken?: string | null
  ): Promise<import("./models/generated/index.js").ReceiptSubmissionResponse>;
  submitEncryptedCreditNote(
    request: import("./models/generated/index.js").EncryptedCreditNoteEnvelope,
    accessToken?: string | null
  ): Promise<import("./models/generated/index.js").ReceiptSubmissionResponse>;
  uploadEncryptedDownloadReceipt(
    request: import("./models/generated/index.js").ClientReceiptDownloadRequest,
    accessToken?: string | null
  ): Promise<import("./models/generated/index.js").ClientReceiptDownloadResponse>;
  sendReceiptViaEmail(
    customerEmail: string,
    receipt: import("./models/generated/index.js").CheqiReceipt,
    accessToken?: string | null
  ): Promise<void>;
  createStore(
    companyId: string,
    request: import("./models/generated/index.js").CreateStoreRequest,
    accessToken?: string | null
  ): Promise<import("./models/generated/index.js").StoreDTO>;
  inviteUsers(companyId: string, emails: string[], accessToken?: string | null): Promise<void>;
  getStores(
    companyId: string,
    activeOnly?: boolean,
    accessToken?: string | null
  ): Promise<import("./models/generated/index.js").StoreDTO[]>;
  getStore(
    companyId: string,
    storeId: string,
    accessToken?: string | null
  ): Promise<import("./models/generated/index.js").StoreDTO>;
  updateStore(
    companyId: string,
    storeId: string,
    request: import("./models/generated/index.js").UpdateStoreRequest,
    accessToken?: string | null
  ): Promise<import("./models/generated/index.js").StoreDTO>;
  deleteStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void>;
  activateStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void>;
  deactivateStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void>;
}
