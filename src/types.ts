export type Nullable<T> = T | null;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

// Re-export generated types so existing consumers continue to work
export type {
  AddressDTO,
  BarcodeType,
  BuyerType,
  CardDetails,
  Charge,
  CheqiCreditNote,
  CheqiReceipt,
  CompanyDTO,
  CreateStoreRequest,
  CreditNoteTemplateGenerationRequest,
  CreditNoteTemplateRequest,
  CreditNoteTemplateResponse,
  Discount,
  EncryptedCreditNote,
  EncryptedCreditNoteInitiationRequest,
  EncryptedReceiptRequest,
  EncryptedReceiptsRequest,
  IdentificationDetails,
  IdentificationDetailsPaymentTypeEnum,
  Identifier,
  MatchedRecipient,
  NotificationDisplayCode,
  PaymentAccountDetails,
  Period,
  Product,
  ProvisionCompanyRequest,
  ProvisionCompanyResponse,
  ReceiptCreatedResponse,
  ReceiptFormat,
  ReceiptTemplateGenerationRequest,
  ReceiptTemplateRequest,
  ReceiptTemplateResponse,
  ReceiverType,
  RecipientResolutionResponse,
  SellingParty,
  ReceivingParty,
  StoreDTO,
  Tax,
  VatMetadata,
} from "./models/generated/index.js";

// Custom SDK type for encrypted receipt decryption (extends generated EncryptedReceiptRequest)
export interface EncryptedReceipt {
  recipientId?: string;
  receiptId?: string;
  receiverType?: string;
  encryptedReceipt?: string;
  encryptedSymmetricKey?: string;
  finalHash?: string;
  publicKey?: string;
  supplierPartyId?: string;
  notificationDisplayCode?: { type: string; data: string };
  encryptedCustomerDetails?: string;
  encryptedCustomerAesKey?: string;
}

export interface CheqiSDKOptions {
  environment?: string;
  customApiEndpoint?: string;
  apiKey?: Nullable<string>;
  privateKey?: Nullable<string>;
  timeoutSeconds?: number;
  maxRetries?: number;
  logger?: import("./logger.js").Logger;
}

export interface RequestOptions {
  body?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
  accessToken?: string | null;
  operation: string;
}

export type FetchLike = typeof fetch;

export interface CheqiApiClient {
  generateReceiptTemplate(
    request: import("./models/generated/index.js").ReceiptTemplateGenerationRequest,
    accessToken?: string | null
  ): Promise<import("./models/generated/index.js").ReceiptTemplateResponse>;
  generateCreditNoteTemplate(
    request: import("./models/generated/index.js").CreditNoteTemplateGenerationRequest,
    accessToken?: string | null
  ): Promise<import("./models/generated/index.js").CreditNoteTemplateResponse>;
  matchCustomer(
    request: import("./models/generated/index.js").IdentificationDetails,
    accessToken?: string | null
  ): Promise<import("./models/generated/index.js").RecipientResolutionResponse>;
  sendEncryptedReceipts(
    matchId: string,
    encryptedReceipts: import("./models/generated/index.js").EncryptedReceiptRequest[],
    templateHash: string,
    accessToken?: string | null
  ): Promise<Record<string, unknown>>;
  sendEncryptedCreditNotes(
    matchId: string,
    parentCheqiReceiptId: string,
    encryptedCreditNotes: import("./models/generated/index.js").EncryptedCreditNote[],
    templateHash: string,
    accessToken?: string | null
  ): Promise<Record<string, unknown>>;
  sendReceiptViaEmail(
    customerEmail: string,
    receipt: Record<string, unknown> | string,
    accessToken?: string | null
  ): Promise<void>;
  provisionCompany(request: import("./models/generated/index.js").ProvisionCompanyRequest): Promise<Record<string, unknown>>;
  createStore(companyId: string, request: import("./models/generated/index.js").CreateStoreRequest, accessToken?: string | null): Promise<Record<string, unknown>>;
  getStores(companyId: string, activeOnly?: boolean, accessToken?: string | null): Promise<Record<string, unknown>>;
  getStore(companyId: string, storeId: string, accessToken?: string | null): Promise<Record<string, unknown>>;
  updateStore(companyId: string, storeId: string, request: import("./models/generated/index.js").CreateStoreRequest, accessToken?: string | null): Promise<Record<string, unknown>>;
  deleteStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void>;
  activateStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void>;
  deactivateStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void>;
}
