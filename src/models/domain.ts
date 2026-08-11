import type {
  Barcode,
  BarcodeType,
  CardDetails,
  Charge,
  CreditNoteInitiationRequest,
  Discount,
  FiscalizationData,
  IdentificationDetails,
  Identifier,
  JurisdictionalData,
  JurisdictionField,
  JurisdictionLegalText,
  PaymentAccountDetails,
  PaymentDetails,
  Period,
  Product,
  ReceiptPayload,
  RefundBankAccount,
  ReturnLineItem,
  Tax
} from "./generated/index.js";
import { instanceOfRefundPreference } from "./generated/RefundPreference.js";
import { instanceOfReturnReasonCode } from "./generated/ReturnReasonCode.js";

/** A decimal accepted at the JavaScript boundary and normalized to a number. */
export type DecimalInput = number | string;

export interface TaxInput extends Omit<Tax, "taxableAmount" | "amount"> {
  taxableAmount: DecimalInput;
  amount?: DecimalInput;
}

export interface DiscountInput extends Omit<Discount, "amount"> {
  amount: DecimalInput;
}

export interface ChargeInput extends Omit<Charge, "amount"> {
  amount: DecimalInput;
}

export interface ProductInput extends Omit<
  Product,
  "unitPrice" | "subtotal" | "total" | "taxes" | "discounts" | "charges"
> {
  unitPrice: DecimalInput;
  subtotal: DecimalInput;
  total: DecimalInput;
  taxes?: TaxInput[];
  discounts?: DiscountInput[];
  charges?: ChargeInput[];
}

export interface ReceiptPayloadInput extends Omit<
  ReceiptPayload,
  | "receiptSubtotal"
  | "totalBeforeTax"
  | "totalTaxAmount"
  | "totalAmount"
  | "products"
  | "discounts"
  | "charges"
  | "taxes"
> {
  receiptSubtotal: DecimalInput;
  totalBeforeTax: DecimalInput;
  totalTaxAmount: DecimalInput;
  totalAmount: DecimalInput;
  products: ProductInput[];
  discounts?: DiscountInput[];
  charges?: ChargeInput[];
  taxes?: TaxInput[];
}

export function createCardDetails(input: CardDetails): CardDetails {
  requireValue(input?.paymentAccountReference, "paymentAccountReference");
  return { ...input };
}

export function createPaymentAccountDetails(input: PaymentAccountDetails): PaymentAccountDetails {
  return { ...input };
}

export function createIdentificationDetails(input: IdentificationDetails): IdentificationDetails {
  return { ...input, paymentIds: copyArray(input.paymentIds) };
}

export function createIdentifier(input: Identifier): Identifier {
  requireValue(input?.type, "type");
  requireValue(input?.value, "value");
  return { ...input };
}

export function createPeriod(input: Period): Period {
  requireValue(input?.startDate, "startDate");
  requireValue(input?.endDate, "endDate");
  return { ...input };
}

export function createBarcode(input: Barcode): Barcode {
  requireValue(input?.type, "Barcode type");
  requireValue(input?.data, "Barcode data");
  return { ...input };
}

export function createQrCode(data: string, label?: string): Barcode {
  return createBarcode({ type: "QR_CODE" as BarcodeType, data, label });
}

export function createTax(input: TaxInput): Tax {
  requireValue(input?.rate, "Tax rate");
  requireValue(input?.type, "Tax type");
  requireValue(input?.taxableAmount, "Tax taxableAmount");
  return {
    ...input,
    taxableAmount: decimalNumber(input.taxableAmount, "Tax taxableAmount"),
    amount: input.amount == null ? undefined : decimalNumber(input.amount, "Tax amount")
  };
}

export function createDiscount(input: DiscountInput): Discount {
  requireValue(input?.amount, "Discount amount");
  return { ...input, amount: decimalNumber(input.amount, "Discount amount") };
}

export function createCharge(input: ChargeInput): Charge {
  requireValue(input?.amount, "Charge amount");
  return { ...input, amount: decimalNumber(input.amount, "Charge amount") };
}

export function createProduct(input: ProductInput): Product {
  for (const field of ["name", "identifier", "quantity", "unitCode", "unitPrice", "subtotal", "total"] as const) {
    requireValue(input?.[field], `Product ${field}`);
  }
  return {
    ...input,
    unitPrice: decimalNumber(input.unitPrice, "Product unitPrice"),
    subtotal: decimalNumber(input.subtotal, "Product subtotal"),
    total: decimalNumber(input.total, "Product total"),
    taxes: (input.taxes ?? []).map(createTax),
    discounts: input.discounts?.map(createDiscount),
    charges: input.charges?.map(createCharge),
    barcodes: copyArray(input.barcodes)
  };
}

export function createPaymentDetails(input: PaymentDetails): PaymentDetails {
  return { ...input };
}

export function createJurisdictionField(input: JurisdictionField): JurisdictionField {
  requireValue(input?.code, "code");
  requireValue(input?.value, "value");
  return { ...input };
}

export function createJurisdictionLegalText(input: JurisdictionLegalText): JurisdictionLegalText {
  requireValue(input?.code, "code");
  requireValue(input?.text, "text");
  return { ...input };
}

export function createFiscalizationData(input: FiscalizationData): FiscalizationData {
  requireValue(input?.system, "system");
  requireValue(input?.status, "status");
  return {
    ...input,
    additionalFields: input.additionalFields?.map(createJurisdictionField)
  };
}

export function createJurisdictionalData(input: JurisdictionalData): JurisdictionalData {
  return {
    ...input,
    fiscalization: input.fiscalization == null
      ? undefined
      : createFiscalizationData(input.fiscalization),
    legalTexts: input.legalTexts?.map(createJurisdictionLegalText),
    additionalFields: input.additionalFields?.map(createJurisdictionField)
  };
}

export function createReceiptPayload(input: ReceiptPayloadInput): ReceiptPayload {
  for (const field of [
    "documentNumber",
    "issueDate",
    "currency",
    "receiptSubtotal",
    "totalBeforeTax",
    "totalTaxAmount",
    "totalAmount",
    "taxesApplied"
  ] as const) {
    requireValue(input?.[field], field);
  }
  if (!input.products?.length) throw new TypeError("products must contain at least one item");

  return {
    ...input,
    receiptSubtotal: decimalNumber(input.receiptSubtotal, "receiptSubtotal"),
    totalBeforeTax: decimalNumber(input.totalBeforeTax, "totalBeforeTax"),
    totalTaxAmount: decimalNumber(input.totalTaxAmount, "totalTaxAmount"),
    totalAmount: decimalNumber(input.totalAmount, "totalAmount"),
    products: input.products.map(createProduct),
    identifiers: copyArray(input.identifiers),
    discounts: input.discounts?.map(createDiscount),
    charges: input.charges?.map(createCharge),
    taxes: input.taxes?.map(createTax),
    barcodes: copyArray(input.barcodes),
    jurisdictionalData: input.jurisdictionalData == null
      ? undefined
      : createJurisdictionalData(input.jurisdictionalData)
  };
}

export function createRefundBankAccount(input: RefundBankAccount): RefundBankAccount {
  return { ...input };
}

export function createReturnLineItem(input: ReturnLineItem): ReturnLineItem {
  return { ...input };
}

export function createCreditNoteInitiationRequest(
  input: CreditNoteInitiationRequest
): CreditNoteInitiationRequest {
  const request = {
    ...input,
    lineItems: input.lineItems?.map(createReturnLineItem),
    refundBankAccount: input.refundBankAccount == null
      ? undefined
      : createRefundBankAccount(input.refundBankAccount)
  };
  validateInitiationRequest(request);
  return request;
}

function copyArray<T>(values?: T[]): T[] | undefined {
  return values == null ? undefined : [...values];
}

function requireValue(value: unknown, name: string): void {
  if (value == null || (typeof value === "string" && !value.trim())) {
    throw new TypeError(`${name} is required`);
  }
}

function decimalNumber(value: DecimalInput, name: string): number {
  if (typeof value === "string" && !value.trim()) {
    throw new TypeError(`${name} must be a finite number`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  if (Number.isInteger(parsed) && !Number.isSafeInteger(parsed)) {
    throw new TypeError(`${name} exceeds JavaScript's safe integer range`);
  }
  return parsed;
}

function validateInitiationRequest(request: CreditNoteInitiationRequest): void {
  requireValue(request.cheqiReceiptId, "cheqiReceiptId");
  requireValue(request.receiptId, "receiptId");
  if (request.customerNote != null && request.customerNote.length > 1000) {
    throw new TypeError("customerNote must be at most 1000 characters");
  }
  if (!request.lineItems?.length) throw new TypeError("At least one return line item is required");
  for (const lineItem of request.lineItems) {
    requireValue(lineItem.productId, "lineItems.productId");
    if (lineItem.productId.length > 255) {
      throw new TypeError("lineItems.productId must be at most 255 characters");
    }
    if (lineItem.quantity == null || !Number.isFinite(lineItem.quantity) || lineItem.quantity <= 0) {
      throw new TypeError("lineItems.quantity must be greater than zero");
    }
    if (!instanceOfReturnReasonCode(lineItem.reasonCode)) {
      throw new TypeError("lineItems.reasonCode is invalid");
    }
    if (lineItem.reasonDescription != null && lineItem.reasonDescription.length > 1000) {
      throw new TypeError("lineItems.reasonDescription must be at most 1000 characters");
    }
  }
  if (!instanceOfRefundPreference(request.refundPreference)) {
    throw new TypeError("refundPreference is invalid");
  }
  if (request.refundPreference === "BANK_TRANSFER") {
    if (!request.refundBankAccount) {
      throw new TypeError("refundBankAccount is required for BANK_TRANSFER");
    }
    requireValue(request.refundBankAccount.iban, "refundBankAccount.iban");
    requireValue(request.refundBankAccount.accountHolder, "refundBankAccount.accountHolder");
  } else if (request.refundBankAccount) {
    throw new TypeError("refundBankAccount is only allowed for BANK_TRANSFER");
  }
}
