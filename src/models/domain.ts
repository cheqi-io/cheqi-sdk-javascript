import type {
  Barcode as BarcodeShape,
  BarcodeType,
  CardDetails as CardDetailsShape,
  Charge as ChargeShape,
  CreditNoteInitiationRequest as CreditNoteInitiationRequestShape,
  Discount as DiscountShape,
  FiscalizationData as FiscalizationDataShape,
  FiscalizationStatus,
  IdentificationDetails as IdentificationDetailsShape,
  Identifier as IdentifierShape,
  JurisdictionalData as JurisdictionalDataShape,
  JurisdictionField as JurisdictionFieldShape,
  JurisdictionLegalText as JurisdictionLegalTextShape,
  PaymentAccountDetails as PaymentAccountDetailsShape,
  PaymentDetails as PaymentDetailsShape,
  PaymentType,
  Period as PeriodShape,
  Product as ProductShape,
  ReceiptPayload as ReceiptPayloadShape,
  RefundBankAccount as RefundBankAccountShape,
  RefundPreference,
  ReturnLineItem as ReturnLineItemShape,
  ReturnReasonCode,
  Tax as TaxShape,
  TaxCategoryCode,
  UnitCode
} from "./generated/index.js";

class BuilderBase<T> {
  protected values: Partial<T> = {};
  from(value: Partial<T>): this { Object.assign(this.values, value); return this; }
}

export class CardDetails implements CardDetailsShape {
  paymentAccountReference!: string;
  cardProvider?: CardDetailsShape["cardProvider"];
  lastFourDigits?: string;

  constructor(init: Partial<CardDetailsShape> = {}) { Object.assign(this, init); }
  static builder(): CardDetailsBuilder { return new CardDetailsBuilder(); }
}

export class CardDetailsBuilder extends BuilderBase<CardDetailsShape> {
  paymentAccountReference(value: string): this { this.values.paymentAccountReference = value; return this; }
  cardProvider(value: CardDetailsShape["cardProvider"]): this { this.values.cardProvider = value; return this; }
  lastFourDigits(value: string): this { this.values.lastFourDigits = value; return this; }
  build(): CardDetails {
    requireValue(this.values.paymentAccountReference, "paymentAccountReference");
    return new CardDetails(this.values);
  }
}

export class PaymentAccountDetails implements PaymentAccountDetailsShape {
  identifier!: string;
  accountIdentifierType!: PaymentAccountDetailsShape["accountIdentifierType"];
  bic?: string;
  bankName?: string;
  accountHolderName?: string;
  constructor(init: Partial<PaymentAccountDetailsShape> = {}) { Object.assign(this, init); }
  static builder(): PaymentAccountDetailsBuilder { return new PaymentAccountDetailsBuilder(); }
}

export class PaymentAccountDetailsBuilder extends BuilderBase<PaymentAccountDetailsShape> {
  identifier(value: string): this { this.values.identifier = value; return this; }
  accountIdentifierType(value: PaymentAccountDetailsShape["accountIdentifierType"]): this { this.values.accountIdentifierType = value; return this; }
  bic(value: string): this { this.values.bic = value; return this; }
  bankName(value: string): this { this.values.bankName = value; return this; }
  accountHolderName(value: string): this { this.values.accountHolderName = value; return this; }
  build(): PaymentAccountDetails { return new PaymentAccountDetails(this.values); }
}

export class IdentificationDetails implements IdentificationDetailsShape {
  paymentType?: PaymentType;
  cardDetails?: CardDetailsShape;
  paymentAccountDetails?: PaymentAccountDetailsShape;
  paymentIds?: string[];
  recipientEmail?: string;
  cheqiReceiptId?: string;
  pairingCode?: string;

  constructor(init: Partial<IdentificationDetailsShape> = {}) { Object.assign(this, init); }
  static builder(): IdentificationDetailsBuilder { return new IdentificationDetailsBuilder(); }
}

export class IdentificationDetailsBuilder extends BuilderBase<IdentificationDetailsShape> {
  paymentType(value: PaymentType): this { this.values.paymentType = value; return this; }
  cardDetails(value: CardDetailsShape): this { this.values.cardDetails = value; return this; }
  paymentAccountDetails(value: PaymentAccountDetailsShape): this { this.values.paymentAccountDetails = value; return this; }
  paymentIds(value: string[]): this { this.values.paymentIds = [...value]; return this; }
  recipientEmail(value: string): this { this.values.recipientEmail = value; return this; }
  cheqiReceiptId(value: string): this { this.values.cheqiReceiptId = value; return this; }
  pairingCode(value: string): this { this.values.pairingCode = value; return this; }
  build(): IdentificationDetails { return new IdentificationDetails(this.values); }
}

export class Identifier implements IdentifierShape {
  type!: string;
  value!: string;
  constructor(init: Partial<IdentifierShape> = {}) { Object.assign(this, init); }
  static builder(): IdentifierBuilder { return new IdentifierBuilder(); }
}

export class IdentifierBuilder extends BuilderBase<IdentifierShape> {
  type(value: string): this { this.values.type = value; return this; }
  value(value: string): this { this.values.value = value; return this; }
  build(): Identifier {
    requireValue(this.values.type, "type");
    requireValue(this.values.value, "value");
    return new Identifier(this.values);
  }
}

export class Period implements PeriodShape {
  startDate!: Date;
  endDate!: Date;
  description?: string;
  constructor(init: Partial<PeriodShape> = {}) { Object.assign(this, init); }
  static builder(): PeriodBuilder { return new PeriodBuilder(); }
}

export class PeriodBuilder extends BuilderBase<PeriodShape> {
  startDate(value: Date): this { this.values.startDate = value; return this; }
  endDate(value: Date): this { this.values.endDate = value; return this; }
  description(value: string): this { this.values.description = value; return this; }
  build(): Period {
    requireValue(this.values.startDate, "startDate");
    requireValue(this.values.endDate, "endDate");
    return new Period(this.values);
  }
}

export class Barcode implements BarcodeShape {
  type!: BarcodeType;
  data!: string;
  label?: string;
  constructor(init: Partial<BarcodeShape> = {}) { Object.assign(this, init); }
  static builder(): BarcodeBuilder { return new BarcodeBuilder(); }
  static of(type: BarcodeType, data: string, label?: string): Barcode { return new Barcode({ type, data, label }); }
  static qrCode(data: string, label?: string): Barcode { return Barcode.of("QR_CODE", data, label); }
}

export class BarcodeBuilder extends BuilderBase<BarcodeShape> {
  type(value: BarcodeType): this { this.values.type = value; return this; }
  data(value: string): this { this.values.data = value; return this; }
  label(value: string): this { this.values.label = value; return this; }
  build(): Barcode {
    requireValue(this.values.type, "Barcode type");
    requireValue(this.values.data, "Barcode data");
    return new Barcode(this.values);
  }
}

export class Tax implements TaxShape {
  rate!: number;
  type!: string;
  taxableAmount!: number;
  amount?: number;
  label?: string;
  category?: TaxCategoryCode;
  exemptionReasonCode?: string;
  exemptionReason?: string;
  constructor(init: Partial<TaxShape> = {}) { Object.assign(this, init); }
  static builder(): TaxBuilder { return new TaxBuilder(); }
}

export class TaxBuilder extends BuilderBase<TaxShape> {
  rate(value: number): this { this.values.rate = value; return this; }
  type(value: string): this { this.values.type = value; return this; }
  taxableAmount(value: number | string): this { this.values.taxableAmount = Number(value); return this; }
  amount(value: number | string): this { this.values.amount = Number(value); return this; }
  label(value: string): this { this.values.label = value; return this; }
  category(value: TaxCategoryCode): this { this.values.category = value; return this; }
  exemptionReasonCode(value: string): this { this.values.exemptionReasonCode = value; return this; }
  exemptionReason(value: string): this { this.values.exemptionReason = value; return this; }
  build(): Tax {
    requireValue(this.values.rate, "Tax rate");
    requireValue(this.values.type, "Tax type");
    requireValue(this.values.taxableAmount, "Tax taxableAmount");
    return new Tax(this.values);
  }
}

export class Discount implements DiscountShape {
  amount!: number;
  percentage?: number;
  label?: string;
  constructor(init: Partial<DiscountShape> = {}) { Object.assign(this, init); }
  static builder(): DiscountBuilder { return new DiscountBuilder(); }
  static of(amount: number | string, label?: string, percentage?: number): Discount {
    return new Discount({ amount: Number(amount), label, percentage });
  }
}

export class DiscountBuilder extends BuilderBase<DiscountShape> {
  amount(value: number | string): this { this.values.amount = Number(value); return this; }
  percentage(value: number): this { this.values.percentage = value; return this; }
  label(value: string): this { this.values.label = value; return this; }
  build(): Discount {
    requireValue(this.values.amount, "Discount amount");
    return new Discount(this.values);
  }
}

export class Charge implements ChargeShape {
  amount!: number;
  percentage?: number;
  label?: string;
  constructor(init: Partial<ChargeShape> = {}) { Object.assign(this, init); }
  static builder(): ChargeBuilder { return new ChargeBuilder(); }
  static of(amount: number | string, label?: string, percentage?: number): Charge {
    return new Charge({ amount: Number(amount), label, percentage });
  }
}

export class ChargeBuilder extends BuilderBase<ChargeShape> {
  amount(value: number | string): this { this.values.amount = Number(value); return this; }
  percentage(value: number): this { this.values.percentage = value; return this; }
  label(value: string): this { this.values.label = value; return this; }
  build(): Charge {
    requireValue(this.values.amount, "Charge amount");
    return new Charge(this.values);
  }
}

export class Product implements ProductShape {
  name!: string;
  identifier!: string;
  quantity!: number;
  unitCode!: UnitCode;
  unitPrice!: number;
  taxes!: TaxShape[];
  subtotal!: number;
  total!: number;
  brandName?: string;
  description?: string;
  baseQuantity?: number;
  period?: PeriodShape;
  discounts?: DiscountShape[];
  charges?: ChargeShape[];
  barcodes?: BarcodeShape[];

  constructor(init: Partial<ProductShape> = {}) { Object.assign(this, init); }
  static builder(): ProductBuilder { return new ProductBuilder(); }
}

export class ProductBuilder extends BuilderBase<ProductShape> {
  private taxItems: TaxShape[] = [];
  private discountItems: DiscountShape[] = [];
  private chargeItems: ChargeShape[] = [];
  private barcodeItems: BarcodeShape[] = [];

  from(value: Partial<ProductShape>): this {
    super.from(value);
    this.taxItems = [...(value.taxes ?? [])];
    this.discountItems = [...(value.discounts ?? [])];
    this.chargeItems = [...(value.charges ?? [])];
    this.barcodeItems = [...(value.barcodes ?? [])];
    return this;
  }
  name(value: string): this { this.values.name = value; return this; }
  identifier(value: string): this { this.values.identifier = value; return this; }
  description(value: string): this { this.values.description = value; return this; }
  brandName(value: string): this { this.values.brandName = value; return this; }
  quantity(value: number): this { this.values.quantity = value; return this; }
  baseQuantity(value: number): this { this.values.baseQuantity = value; return this; }
  unitCode(value: UnitCode): this { this.values.unitCode = value; return this; }
  unitPrice(value: number | string): this { this.values.unitPrice = Number(value); return this; }
  subtotal(value: number | string): this { this.values.subtotal = Number(value); return this; }
  total(value: number | string): this { this.values.total = Number(value); return this; }
  period(value: PeriodShape): this { this.values.period = value; return this; }
  taxes(values: TaxShape[]): this { this.taxItems = [...values]; return this; }
  addTax(value: TaxShape): this;
  addTax(rate: number, type: string, taxableAmount: number | string, amount: number | string): this;
  addTax(valueOrRate: TaxShape | number, type?: string, taxableAmount?: number | string, amount?: number | string): this {
    this.taxItems.push(typeof valueOrRate === "number"
      ? Tax.builder().rate(valueOrRate).type(type!).taxableAmount(taxableAmount!).amount(amount!).build()
      : valueOrRate);
    return this;
  }
  discounts(values: DiscountShape[]): this { this.discountItems = [...values]; return this; }
  addDiscount(value: DiscountShape): this;
  addDiscount(amount: number | string, label: string, percentage?: number): this;
  addDiscount(valueOrAmount: DiscountShape | number | string, label?: string, percentage?: number): this {
    this.discountItems.push(typeof valueOrAmount === "object" ? valueOrAmount : Discount.of(valueOrAmount, label, percentage));
    return this;
  }
  charges(values: ChargeShape[]): this { this.chargeItems = [...values]; return this; }
  addCharge(value: ChargeShape): this;
  addCharge(amount: number | string, label: string, percentage?: number): this;
  addCharge(valueOrAmount: ChargeShape | number | string, label?: string, percentage?: number): this {
    this.chargeItems.push(typeof valueOrAmount === "object" ? valueOrAmount : Charge.of(valueOrAmount, label, percentage));
    return this;
  }
  barcodes(values: BarcodeShape[]): this { this.barcodeItems = [...values]; return this; }
  addBarcode(value: BarcodeShape): this { this.barcodeItems.push(value); return this; }
  addQrCode(data: string, label?: string): this { this.barcodeItems.push(Barcode.qrCode(data, label)); return this; }
  build(): Product {
    for (const field of ["name", "identifier", "quantity", "unitCode", "unitPrice", "subtotal", "total"] as const) {
      requireValue(this.values[field], `Product ${field}`);
    }
    return new Product({
      ...this.values,
      taxes: this.taxItems,
      discounts: this.discountItems.length ? this.discountItems : undefined,
      charges: this.chargeItems.length ? this.chargeItems : undefined,
      barcodes: this.barcodeItems.length ? this.barcodeItems : undefined
    });
  }
}

export class PaymentDetails implements PaymentDetailsShape {
  paymentMeansCode?: string;
  description?: string;
  cardProvider?: string;
  cardLastFour?: string;
  accountIdentifier?: string;
  accountIdentifierType?: string;
  merchantId?: string;
  paymentTerminalId?: string;
  constructor(init: Partial<PaymentDetailsShape> = {}) { Object.assign(this, init); }
  static builder(): PaymentDetailsBuilder { return new PaymentDetailsBuilder(); }
}

export class PaymentDetailsBuilder extends BuilderBase<PaymentDetailsShape> {
  paymentMeansCode(value: string): this { this.values.paymentMeansCode = value; return this; }
  description(value: string): this { this.values.description = value; return this; }
  cardProvider(value: string): this { this.values.cardProvider = value; return this; }
  cardLastFour(value: string): this { this.values.cardLastFour = value; return this; }
  accountIdentifier(value: string): this { this.values.accountIdentifier = value; return this; }
  accountIdentifierType(value: string): this { this.values.accountIdentifierType = value; return this; }
  merchantId(value: string): this { this.values.merchantId = value; return this; }
  paymentTerminalId(value: string): this { this.values.paymentTerminalId = value; return this; }
  build(): PaymentDetails { return new PaymentDetails(this.values); }
}

export class JurisdictionField implements JurisdictionFieldShape {
  code!: string;
  value!: string;
  label?: string;
  constructor(init: Partial<JurisdictionFieldShape> = {}) { Object.assign(this, init); }
  static of(code: string, value: string, label?: string): JurisdictionField {
    return new JurisdictionField({ code, value, label });
  }
}

export class JurisdictionLegalText implements JurisdictionLegalTextShape {
  code!: string;
  text!: string;
  languageCode?: string;
  displayRole?: JurisdictionLegalTextShape["displayRole"];
  constructor(init: Partial<JurisdictionLegalTextShape> = {}) { Object.assign(this, init); }
  static of(code: string, text: string, languageCode?: string): JurisdictionLegalText {
    return new JurisdictionLegalText({ code, text, languageCode });
  }
}

export class FiscalizationData implements FiscalizationDataShape {
  system!: string;
  status!: FiscalizationStatus;
  fiscalDocumentNumber?: string;
  fiscalDeviceId?: string;
  cashRegisterId?: string;
  businessPremiseId?: string;
  operatorId?: string;
  transactionId?: string;
  sequenceNumber?: string;
  authorityReference?: string;
  softwareId?: string;
  verificationCode?: string;
  signature?: string;
  signatureAlgorithm?: string;
  verificationUrl?: string;
  timestamp?: Date;
  additionalFields?: JurisdictionFieldShape[];

  constructor(init: Partial<FiscalizationDataShape> = {}) { Object.assign(this, init); }
  static of(system: string, status: FiscalizationStatus): FiscalizationData {
    requireValue(system, "system");
    requireValue(status, "status");
    return new FiscalizationData({ system, status });
  }
  addField(code: string, value: string, label?: string): this {
    this.additionalFields = [...(this.additionalFields ?? []), JurisdictionField.of(code, value, label)];
    return this;
  }
}

export class JurisdictionalData implements JurisdictionalDataShape {
  countryCode?: string;
  regime?: string;
  regimeVersion?: string;
  fiscalization?: FiscalizationDataShape;
  legalTexts?: JurisdictionLegalTextShape[];
  additionalFields?: JurisdictionFieldShape[];
  constructor(init: Partial<JurisdictionalDataShape> = {}) { Object.assign(this, init); }
  static builder(): JurisdictionalDataBuilder { return new JurisdictionalDataBuilder(); }
}

export class JurisdictionalDataBuilder extends BuilderBase<JurisdictionalDataShape> {
  private legalTextItems: JurisdictionLegalTextShape[] = [];
  private fieldItems: JurisdictionFieldShape[] = [];
  countryCode(value: string): this { this.values.countryCode = value; return this; }
  regime(value: string): this { this.values.regime = value; return this; }
  regimeVersion(value: string): this { this.values.regimeVersion = value; return this; }
  fiscalization(value: FiscalizationDataShape): this { this.values.fiscalization = value; return this; }
  addLegalText(value: JurisdictionLegalTextShape): this;
  addLegalText(code: string, text: string, languageCode?: string): this;
  addLegalText(valueOrCode: JurisdictionLegalTextShape | string, text?: string, languageCode?: string): this {
    this.legalTextItems.push(typeof valueOrCode === "string"
      ? JurisdictionLegalText.of(valueOrCode, text!, languageCode)
      : valueOrCode);
    return this;
  }
  addField(value: JurisdictionFieldShape): this;
  addField(code: string, value: string, label?: string): this;
  addField(valueOrCode: JurisdictionFieldShape | string, value?: string, label?: string): this {
    this.fieldItems.push(typeof valueOrCode === "string"
      ? JurisdictionField.of(valueOrCode, value!, label)
      : valueOrCode);
    return this;
  }
  build(): JurisdictionalData {
    return new JurisdictionalData({
      ...this.values,
      legalTexts: optionalArray(this.legalTextItems),
      additionalFields: optionalArray(this.fieldItems)
    });
  }
}

export class ReceiptPayload implements ReceiptPayloadShape {
  documentNumber!: string;
  issueDate!: Date;
  currency!: string;
  receiptSubtotal!: number;
  totalBeforeTax!: number;
  totalTaxAmount!: number;
  totalAmount!: number;
  taxesApplied!: boolean;
  products!: ProductShape[];
  identifiers?: IdentifierShape[];
  discounts?: DiscountShape[];
  charges?: ChargeShape[];
  taxes?: TaxShape[];
  transactionDate?: Date;
  purchaseDate?: Date;
  period?: PeriodShape;
  barcodes?: BarcodeShape[];
  paymentDetails?: PaymentDetailsShape;
  jurisdictionalData?: ReceiptPayloadShape["jurisdictionalData"];

  constructor(init: Partial<ReceiptPayloadShape> = {}) { Object.assign(this, init); }
  static builder(): ReceiptPayloadBuilder { return new ReceiptPayloadBuilder(); }
}

export class ReceiptPayloadBuilder extends BuilderBase<ReceiptPayloadShape> {
  private productItems: ProductShape[] = [];
  private identifierItems: IdentifierShape[] = [];
  private discountItems: DiscountShape[] = [];
  private chargeItems: ChargeShape[] = [];
  private taxItems: TaxShape[] = [];
  private barcodeItems: BarcodeShape[] = [];

  documentNumber(value: string): this { this.values.documentNumber = value; return this; }
  issueDate(value: Date): this { this.values.issueDate = value; return this; }
  currency(value: string): this { this.values.currency = value; return this; }
  receiptSubtotal(value: number | string): this { this.values.receiptSubtotal = Number(value); return this; }
  totalBeforeTax(value: number | string): this { this.values.totalBeforeTax = Number(value); return this; }
  totalTaxAmount(value: number | string): this { this.values.totalTaxAmount = Number(value); return this; }
  totalAmount(value: number | string): this { this.values.totalAmount = Number(value); return this; }
  taxesApplied(value: boolean): this { this.values.taxesApplied = value; return this; }
  transactionDate(value: Date): this { this.values.transactionDate = value; return this; }
  purchaseDate(value: Date): this { this.values.purchaseDate = value; return this; }
  period(value: PeriodShape): this { this.values.period = value; return this; }
  paymentDetails(value: PaymentDetailsShape): this { this.values.paymentDetails = value; return this; }
  jurisdictionalData(value: NonNullable<ReceiptPayloadShape["jurisdictionalData"]>): this { this.values.jurisdictionalData = value; return this; }
  products(values: ProductShape[]): this { this.productItems = [...values]; return this; }
  addProduct(value: ProductShape): this { this.productItems.push(value); return this; }
  identifiers(values: IdentifierShape[]): this { this.identifierItems = [...values]; return this; }
  addIdentifier(value: IdentifierShape): this { this.identifierItems.push(value); return this; }
  discounts(values: DiscountShape[]): this { this.discountItems = [...values]; return this; }
  addDiscount(value: DiscountShape): this { this.discountItems.push(value); return this; }
  charges(values: ChargeShape[]): this { this.chargeItems = [...values]; return this; }
  addCharge(value: ChargeShape): this { this.chargeItems.push(value); return this; }
  taxes(values: TaxShape[]): this { this.taxItems = [...values]; return this; }
  addTax(value: TaxShape): this { this.taxItems.push(value); return this; }
  barcodes(values: BarcodeShape[]): this { this.barcodeItems = [...values]; return this; }
  addBarcode(value: BarcodeShape): this { this.barcodeItems.push(value); return this; }
  addQrCode(data: string, label?: string): this { this.barcodeItems.push(Barcode.qrCode(data, label)); return this; }
  build(): ReceiptPayload {
    for (const field of [
      "documentNumber", "issueDate", "currency", "receiptSubtotal", "totalBeforeTax",
      "totalTaxAmount", "totalAmount", "taxesApplied"
    ] as const) requireValue(this.values[field], field);
    if (!this.productItems.length) throw new TypeError("products must contain at least one item");
    return new ReceiptPayload({
      ...this.values,
      products: this.productItems,
      identifiers: optionalArray(this.identifierItems),
      discounts: optionalArray(this.discountItems),
      charges: optionalArray(this.chargeItems),
      taxes: optionalArray(this.taxItems),
      barcodes: optionalArray(this.barcodeItems)
    });
  }
}

export class RefundBankAccount implements RefundBankAccountShape {
  iban!: string;
  bic?: string;
  accountHolder!: string;
  constructor(init?: Partial<RefundBankAccountShape>);
  constructor(iban: string, bic: string | undefined, accountHolder: string);
  constructor(
    initOrIban: Partial<RefundBankAccountShape> | string = {},
    bic?: string,
    accountHolder?: string
  ) {
    Object.assign(this, typeof initOrIban === "string"
      ? { iban: initOrIban, bic, accountHolder }
      : initOrIban);
  }
}

export class ReturnLineItem implements ReturnLineItemShape {
  productId!: string;
  quantity!: number;
  reasonCode!: ReturnReasonCode;
  reasonDescription?: string;
  constructor(init?: Partial<ReturnLineItemShape>);
  constructor(productId: string, quantity: number, reasonCode: ReturnReasonCode, reasonDescription?: string);
  constructor(
    initOrProductId: Partial<ReturnLineItemShape> | string = {},
    quantity?: number,
    reasonCode?: ReturnReasonCode,
    reasonDescription?: string
  ) {
    Object.assign(this, typeof initOrProductId === "string"
      ? { productId: initOrProductId, quantity, reasonCode, reasonDescription }
      : initOrProductId);
  }
}

export class CreditNoteInitiationRequest implements CreditNoteInitiationRequestShape {
  cheqiReceiptId!: string;
  receiptId!: string;
  customerNote?: string;
  lineItems!: ReturnLineItemShape[];
  refundPreference!: RefundPreference;
  refundBankAccount?: RefundBankAccountShape;
  constructor(init: Partial<CreditNoteInitiationRequestShape> = {}) { Object.assign(this, init); }
  static builder(): CreditNoteInitiationRequestBuilder { return new CreditNoteInitiationRequestBuilder(); }
}

export class CreditNoteInitiationRequestBuilder extends BuilderBase<CreditNoteInitiationRequestShape> {
  cheqiReceiptId(value: string): this { this.values.cheqiReceiptId = value; return this; }
  receiptId(value: string): this { this.values.receiptId = value; return this; }
  customerNote(value: string): this { this.values.customerNote = value; return this; }
  lineItems(value: ReturnLineItemShape[]): this { this.values.lineItems = [...value]; return this; }
  refundPreference(value: RefundPreference): this { this.values.refundPreference = value; return this; }
  refundBankAccount(value: RefundBankAccountShape): this { this.values.refundBankAccount = value; return this; }
  build(): CreditNoteInitiationRequest {
    const request = new CreditNoteInitiationRequest(this.values);
    validateInitiationRequest(request);
    return request;
  }
}

function optionalArray<T>(values: T[]): T[] | undefined { return values.length ? values : undefined; }

function requireValue(value: unknown, name: string): void {
  if (value == null || (typeof value === "string" && !value.trim())) {
    throw new TypeError(`${name} is required`);
  }
}

function validateInitiationRequest(request: CreditNoteInitiationRequestShape): void {
  requireValue(request.cheqiReceiptId, "cheqiReceiptId");
  requireValue(request.receiptId, "receiptId");
  if (request.customerNote != null && request.customerNote.length > 1000) {
    throw new TypeError("customerNote must be at most 1000 characters");
  }
  if (!request.lineItems?.length) throw new TypeError("At least one return line item is required");
  for (const lineItem of request.lineItems) {
    requireValue(lineItem.productId, "lineItems.productId");
    if (lineItem.productId.length > 255) throw new TypeError("lineItems.productId must be at most 255 characters");
    if (lineItem.quantity == null || lineItem.quantity <= 0) throw new TypeError("lineItems.quantity must be greater than zero");
    requireValue(lineItem.reasonCode, "lineItems.reasonCode");
    if (lineItem.reasonDescription != null && lineItem.reasonDescription.length > 1000) {
      throw new TypeError("lineItems.reasonDescription must be at most 1000 characters");
    }
  }
  requireValue(request.refundPreference, "refundPreference");
  if (request.refundPreference === "BANK_TRANSFER") {
    if (!request.refundBankAccount) throw new TypeError("refundBankAccount is required for BANK_TRANSFER");
    requireValue(request.refundBankAccount.iban, "refundBankAccount.iban");
    requireValue(request.refundBankAccount.accountHolder, "refundBankAccount.accountHolder");
  } else if (request.refundBankAccount) {
    throw new TypeError("refundBankAccount is only allowed for BANK_TRANSFER");
  }
}
