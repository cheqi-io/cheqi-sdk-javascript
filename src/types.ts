export type Nullable<T> = T | null;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export type PaymentType = "CARD_PAYMENT" | "DIRECT_DEBIT" | "CASH";
export type ReceiptFormat = "CHEQI" | "UBL_XML";
export type ReceiverType = "WEBHOOK" | "DEVICE" | "CLIENT_APPLICATION" | "COMPANY";
export type RecipientEntityType = "BUSINESS" | "CONSUMER";
export type BarcodeType = "QR_CODE" | "EAN_13" | "EAN_8" | "CODE_128" | "UPC_A" | "DATA_MATRIX";

export interface CardDetails {
  paymentAccountNumber?: string;
  paymentAccountReference?: string;
  cardProvider?: string;
  payment_account_number?: string;
  payment_account_reference?: string;
}

export interface PaymentAccountDetails {
  identifier?: string;
  identifierType?: string;
}

export interface IdentificationDetails extends Record<string, unknown> {
  paymentType?: PaymentType;
  cardDetails?: CardDetails;
  paymentAccountDetails?: PaymentAccountDetails;
  paymentIds?: string[];
  recipientEmail?: string;
  cheqiReceiptId?: string;
  pairingCode?: string;
  recipient_email?: string;
  cheqi_receipt_id?: string;
  pairing_code?: string;
  payment_account_details?: PaymentAccountDetails;
  card_details?: CardDetails;
}

export interface Recipient extends Record<string, unknown> {
  id?: string;
  receiverType?: ReceiverType;
  publicKey?: string;
  keyAlgorithm?: string;
  acceptedFormats?: ReceiptFormat[];
  receiver_type?: ReceiverType;
  public_key?: string;
  accepted_formats?: ReceiptFormat[];
}

export interface RecipientResolutionResponse extends Record<string, unknown> {
  customerFound: boolean;
  matchId?: string;
  recipients?: Recipient[];
  expiresAt?: string;
  buyerCountryCode?: string;
  recipientEntityType?: RecipientEntityType;
}

export interface NotificationDisplayCode {
  type: BarcodeType;
  data: string;
}

export interface EncryptedReceiptRequestDto extends Record<string, unknown> {
  recipientId?: string;
  receiptId?: string;
  receiverType?: ReceiverType;
  encryptedReceipt?: string;
  encryptedSymmetricKey?: string;
  finalHash?: string;
  publicKey?: string;
  supplierPartyId?: string;
  receiptFormats?: ReceiptFormat[];
  notificationDisplayCode?: NotificationDisplayCode;
}

export interface EncryptedReceipt extends EncryptedReceiptRequestDto {
  encryptedCustomerDetails?: string;
  encryptedCustomerAesKey?: string;
  encrypted_receipt?: string;
  encrypted_symmetric_key?: string;
  encrypted_customer_details?: string;
  encrypted_customer_aes_key?: string;
}

export interface EncryptedCreditNote extends Record<string, unknown> {
  recipientId?: string;
  receiverType?: ReceiverType;
  publicKey?: string;
  encryptedCreditNote?: string;
  encryptedSymmetricKey?: string;
  receiptFormats?: ReceiptFormat[];
}

export interface EncryptedCreditNoteInitiationRequest extends Record<string, unknown> {
  cheqiReceiptId?: string;
  publicKey?: string;
  encryptedCreditNoteInitiationRequest?: string;
  encryptedSymmetricKey?: string;
  encryptedCreditNote?: string;
  encrypted_credit_note_initiation_request?: string;
  encrypted_symmetric_key?: string;
  encrypted_credit_note?: string;
}

export interface ReceiptTemplateRequest extends Record<string, unknown> {
  childCompanyId?: string;
  documentNumber?: string;
  issueDate?: string | Date;
  currency?: string;
  receiptSubtotal?: number | string;
  totalBeforeTax?: number | string;
  totalTaxAmount?: number | string;
  totalAmount?: number | string;
  products?: unknown[];
  discounts?: unknown[];
  charges?: unknown[];
  taxes?: unknown[];
  transactionDate?: string | Date;
  purchaseDate?: string | Date;
  period?: unknown;
  barcodes?: unknown[];
  note?: string;
  buyerCountryCode?: string;
  recipientEntityType?: RecipientEntityType;
  taxesApplied?: boolean;
}

export interface ReceiptTemplateResponse extends Record<string, unknown> {
  ubl?: string;
  cheqi?: Record<string, unknown>;
  vatMetadata?: Record<string, unknown>;
}

export interface CreditNoteTemplateRequest extends Record<string, unknown> {}

export interface CreditNoteTemplateGenerationRequest {
  creditNoteTemplateRequest: CreditNoteTemplateRequest;
  receiptFormats?: ReceiptFormat[];
}

export interface CreditNoteTemplateResponse extends Record<string, unknown> {
  ubl?: string;
  cheqi?: Record<string, unknown>;
  vatMetadata?: Record<string, unknown>;
}

export interface CompanyAddress extends Record<string, unknown> {
  streetName?: string;
  additionalStreetName?: string;
  addressLine?: string;
  region?: string;
  cityName?: string;
  postalZone?: string;
  countryIsoCode?: string;
  street_name?: string;
  city_name?: string;
  postal_zone?: string;
  country_iso_code?: string;
}

export interface Company extends Record<string, unknown> {
  companyName?: string;
  companyLegalName?: string;
  chamberOfCommerceNumber?: string;
  taxNumber?: string;
  companyEmail?: string;
  phoneNumber?: string;
  website?: string;
  returnDays?: number;
  companyReceiptText?: string;
  companyLogoUrl?: string;
  address?: CompanyAddress;
  company_name?: string;
  company_email?: string;
}

export interface CreateStoreRequest extends Record<string, unknown> {
  storeName?: string;
  storeCode?: string;
  address?: CompanyAddress;
  phoneNumber?: string;
  email?: string;
  openingHours?: string;
  store_name?: string;
}

export interface CheqiSDKOptions {
  environment?: string;
  customApiEndpoint?: string;
  apiKey?: Nullable<string>;
  privateKey?: Nullable<string>;
  timeoutSeconds?: number;
  maxRetries?: number;
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
    request: ReceiptTemplateRequest,
    receiptFormats?: ReceiptFormat[],
    accessToken?: string | null
  ): Promise<ReceiptTemplateResponse>;
  generateCreditNoteTemplate(
    request: CreditNoteTemplateGenerationRequest,
    accessToken?: string | null
  ): Promise<CreditNoteTemplateResponse>;
  matchCustomer(
    request: IdentificationDetails,
    accessToken?: string | null
  ): Promise<RecipientResolutionResponse>;
  sendEncryptedReceipts(
    matchId: string,
    encryptedReceipts: EncryptedReceiptRequestDto[],
    templateHash: string,
    accessToken?: string | null
  ): Promise<Record<string, unknown>>;
  sendEncryptedCreditNotes(
    matchId: string,
    parentCheqiReceiptId: string,
    encryptedCreditNotes: EncryptedCreditNote[],
    templateHash: string,
    accessToken?: string | null
  ): Promise<Record<string, unknown>>;
  sendReceiptViaEmail(
    customerEmail: string,
    receipt: Record<string, unknown> | string,
    accessToken?: string | null
  ): Promise<void>;
  provisionCompany(request: { company: Company; adminEmail: string }): Promise<Record<string, unknown>>;
  createStore(companyId: string, request: CreateStoreRequest, accessToken?: string | null): Promise<Record<string, unknown>>;
  getStores(companyId: string, activeOnly?: boolean, accessToken?: string | null): Promise<Record<string, unknown>>;
  getStore(companyId: string, storeId: string, accessToken?: string | null): Promise<Record<string, unknown>>;
  updateStore(companyId: string, storeId: string, request: CreateStoreRequest, accessToken?: string | null): Promise<Record<string, unknown>>;
  deleteStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void>;
  activateStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void>;
  deactivateStore(companyId: string, storeId: string, accessToken?: string | null): Promise<void>;
}
