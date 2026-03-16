import type {
  BarcodeType,
  Company as CompanyShape,
  CompanyAddress as CompanyAddressShape,
  CreateStoreRequest as CreateStoreRequestShape,
  IdentificationDetails as IdentificationDetailsShape,
  NotificationDisplayCode as NotificationDisplayCodeShape,
  PaymentAccountDetails as PaymentAccountDetailsShape,
  PaymentType,
  Recipient as RecipientShape,
  RecipientEntityType,
  RecipientResolutionResponse as RecipientResolutionResponseShape,
  ReceiptFormat,
  ReceiptTemplateRequest as ReceiptTemplateRequestShape,
  ReceiptTemplateResponse as ReceiptTemplateResponseShape,
  ReceiverType
} from "../types.js";

type Optional<T> = T | null | undefined;

class BuilderBase<T> {
  protected values: any = {};

  from(value: Partial<T>): this {
    Object.assign(this.values, value);
    return this;
  }
}

export class CardDetails {
  paymentAccountNumber?: string;
  paymentAccountReference?: string;
  cardProvider?: string;

  constructor(init: Partial<CardDetails> = {}) {
    Object.assign(this, init);
  }

  static builder(): CardDetailsBuilder {
    return new CardDetailsBuilder();
  }
}

export class CardDetailsBuilder extends BuilderBase<CardDetails> {
  paymentAccountNumber(value: string): this { this.values.paymentAccountNumber = value; return this; }
  paymentAccountReference(value: string): this { this.values.paymentAccountReference = value; return this; }
  cardProvider(value: string): this { this.values.cardProvider = value; return this; }
  build(): CardDetails { return new CardDetails(this.values); }
}

export class PaymentAccountDetails {
  identifier?: string;
  identifierType?: string;

  constructor(init: Partial<PaymentAccountDetailsShape> = {}) {
    Object.assign(this, init);
  }

  static builder(): PaymentAccountDetailsBuilder {
    return new PaymentAccountDetailsBuilder();
  }
}

export class PaymentAccountDetailsBuilder extends BuilderBase<PaymentAccountDetails> {
  identifier(value: string): this { this.values.identifier = value; return this; }
  identifierType(value: string): this { this.values.identifierType = value; return this; }
  build(): PaymentAccountDetails { return new PaymentAccountDetails(this.values); }
}

export class IdentificationDetails implements IdentificationDetailsShape {
  paymentType?: PaymentType;
  cardDetails?: CardDetails;
  paymentAccountDetails?: PaymentAccountDetails;
  paymentIds?: string[];
  recipientEmail?: string;
  cheqiReceiptId?: string;
  pairingCode?: string;

  [key: string]: unknown;

  constructor(init: Partial<IdentificationDetailsShape> = {}) {
    Object.assign(this, init);
  }

  static builder(): IdentificationDetailsBuilder {
    return new IdentificationDetailsBuilder();
  }

  getPaymentType(): Optional<PaymentType> { return this.paymentType; }
  getCardDetails(): Optional<CardDetails> { return this.cardDetails; }
  getPaymentAccountDetails(): Optional<PaymentAccountDetails> { return this.paymentAccountDetails; }
  getPaymentIds(): Optional<string[]> { return this.paymentIds; }
  getRecipientEmail(): Optional<string> { return this.recipientEmail; }
  getCheqiReceiptId(): Optional<string> { return this.cheqiReceiptId; }
  getPairingCode(): Optional<string> { return this.pairingCode; }
}

export class IdentificationDetailsBuilder extends BuilderBase<IdentificationDetails> {
  paymentType(value: PaymentType): this { this.values.paymentType = value; return this; }
  cardDetails(value: CardDetails): this { this.values.cardDetails = value; return this; }
  paymentAccountDetails(value: PaymentAccountDetails): this { this.values.paymentAccountDetails = value; return this; }
  paymentIds(value: string[]): this { this.values.paymentIds = value; return this; }
  recipientEmail(value: string): this { this.values.recipientEmail = value; return this; }
  cheqiReceiptId(value: string): this { this.values.cheqiReceiptId = value; return this; }
  pairingCode(value: string): this { this.values.pairingCode = value; return this; }
  build(): IdentificationDetails { return new IdentificationDetails(this.values); }
}

export class Recipient implements RecipientShape {
  id?: string;
  receiverType?: ReceiverType;
  publicKey?: string;
  keyAlgorithm?: string;
  acceptedFormats?: ReceiptFormat[];
  keyCreatedAt?: string | Date;

  [key: string]: unknown;

  constructor(init: Partial<RecipientShape> & { keyCreatedAt?: string | Date } = {}) {
    Object.assign(this, init);
  }

  static builder(): RecipientBuilder {
    return new RecipientBuilder();
  }

  getId(): Optional<string> { return this.id; }
  getReceiverType(): Optional<ReceiverType> { return this.receiverType; }
  getPublicKey(): Optional<string> { return this.publicKey; }
  getKeyAlgorithm(): Optional<string> { return this.keyAlgorithm; }
  getAcceptedFormats(): Optional<ReceiptFormat[]> { return this.acceptedFormats; }
}

export class RecipientBuilder extends BuilderBase<Recipient> {
  id(value: string): this { this.values.id = value; return this; }
  receiverType(value: ReceiverType): this { this.values.receiverType = value; return this; }
  publicKey(value: string): this { this.values.publicKey = value; return this; }
  keyAlgorithm(value: string): this { this.values.keyAlgorithm = value; return this; }
  acceptedFormats(value: ReceiptFormat[]): this { this.values.acceptedFormats = value; return this; }
  build(): Recipient { return new Recipient(this.values); }
}

export class RecipientResolutionResponse implements RecipientResolutionResponseShape {
  customerFound: boolean;
  matchId?: string;
  recipients?: Recipient[];
  expiresAt?: string;
  instructions?: string;
  buyerCountryCode?: string;
  recipientEntityType?: RecipientEntityType;

  [key: string]: unknown;

  constructor(init: Partial<RecipientResolutionResponseShape> & { customerFound?: boolean; instructions?: string } = {}) {
    this.customerFound = init.customerFound ?? false;
    this.matchId = init.matchId;
    this.recipients = init.recipients as Recipient[] | undefined;
    this.expiresAt = init.expiresAt;
    this.instructions = init.instructions ?? "Use this anonymous identifier when submitting encrypted receipts. Encrypt receipts using the provided device public keys.";
    this.buyerCountryCode = init.buyerCountryCode;
    this.recipientEntityType = init.recipientEntityType;
  }

  static builder(): RecipientResolutionResponseBuilder {
    return new RecipientResolutionResponseBuilder();
  }

  isCustomerFound(): boolean { return this.customerFound; }
  getMatchId(): Optional<string> { return this.matchId; }
  getRecipients(): Optional<Recipient[]> { return this.recipients; }
  getBuyerCountryCode(): Optional<string> { return this.buyerCountryCode; }
  getRecipientEntityType(): Optional<RecipientEntityType> { return this.recipientEntityType; }
}

export class RecipientResolutionResponseBuilder extends BuilderBase<RecipientResolutionResponse> {
  customerFound(value: boolean): this { (this.values as Partial<RecipientResolutionResponseShape>).customerFound = value; return this; }
  matchId(value: string): this { this.values.matchId = value; return this; }
  recipients(value: Recipient[]): this { this.values.recipients = value; return this; }
  expiresAt(value: string): this { (this.values as any).expiresAt = value; return this; }
  instructions(value: string): this { (this.values as any).instructions = value; return this; }
  buyerCountryCode(value: string): this { this.values.buyerCountryCode = value; return this; }
  recipientEntityType(value: RecipientEntityType): this { this.values.recipientEntityType = value; return this; }
  build(): RecipientResolutionResponse { return new RecipientResolutionResponse(this.values as any); }
}

export class NotificationDisplayCode implements NotificationDisplayCodeShape {
  type: BarcodeType;
  data: string;

  constructor(init: NotificationDisplayCodeShape) {
    this.type = init.type;
    this.data = init.data;
  }

  static builder(): NotificationDisplayCodeBuilder {
    return new NotificationDisplayCodeBuilder();
  }
}

export class NotificationDisplayCodeBuilder extends BuilderBase<NotificationDisplayCode> {
  type(value: BarcodeType): this { (this.values as any).type = value; return this; }
  data(value: string): this { (this.values as any).data = value; return this; }
  build(): NotificationDisplayCode { return new NotificationDisplayCode(this.values as NotificationDisplayCodeShape); }
}

export class Identifier {
  type?: string;
  value?: string;

  constructor(init: Partial<Identifier> = {}) {
    Object.assign(this, init);
  }

  static builder(): IdentifierBuilder {
    return new IdentifierBuilder();
  }
}

export class IdentifierBuilder extends BuilderBase<Identifier> {
  type(value: string): this { this.values.type = value; return this; }
  value(value: string): this { this.values.value = value; return this; }
  build(): Identifier { return new Identifier(this.values); }
}

export class Period {
  startDate?: string | Date;
  endDate?: string | Date;
  description?: string;

  constructor(init: Partial<Period> = {}) {
    Object.assign(this, init);
  }

  static builder(): PeriodBuilder {
    return new PeriodBuilder();
  }
}

export class PeriodBuilder extends BuilderBase<Period> {
  startDate(value: string | Date): this { this.values.startDate = value; return this; }
  endDate(value: string | Date): this { this.values.endDate = value; return this; }
  description(value: string): this { this.values.description = value; return this; }
  build(): Period { return new Period(this.values); }
}

export class Barcode {
  type?: BarcodeType;
  data?: string;
  label?: string;

  constructor(init: Partial<Barcode> = {}) {
    Object.assign(this, init);
  }

  static builder(): BarcodeBuilder {
    return new BarcodeBuilder();
  }
}

export class BarcodeBuilder extends BuilderBase<Barcode> {
  type(value: BarcodeType): this { this.values.type = value; return this; }
  data(value: string): this { this.values.data = value; return this; }
  label(value: string): this { this.values.label = value; return this; }
  build(): Barcode { return new Barcode(this.values); }
}

export class Tax {
  rate?: number;
  type?: string;
  taxableAmount?: string | number;
  amount?: string | number;
  label?: string;

  constructor(init: Partial<Tax> = {}) {
    Object.assign(this, init);
  }

  static builder(): TaxBuilder {
    return new TaxBuilder();
  }
}

export class TaxBuilder extends BuilderBase<Tax> {
  rate(value: number): this { this.values.rate = value; return this; }
  type(value: string): this { this.values.type = value; return this; }
  taxableAmount(value: string | number): this { this.values.taxableAmount = value; return this; }
  amount(value: string | number): this { this.values.amount = value; return this; }
  label(value: string): this { this.values.label = value; return this; }
  build(): Tax { return new Tax(this.values); }
}

export class Discount {
  amount?: string | number;
  percentage?: number;
  label?: string;

  constructor(init: Partial<Discount> = {}) {
    Object.assign(this, init);
  }

  static builder(): DiscountBuilder {
    return new DiscountBuilder();
  }
}

export class DiscountBuilder extends BuilderBase<Discount> {
  amount(value: string | number): this { this.values.amount = value; return this; }
  percentage(value: number): this { this.values.percentage = value; return this; }
  label(value: string): this { this.values.label = value; return this; }
  build(): Discount { return new Discount(this.values); }
}

export class Charge {
  amount?: string | number;
  percentage?: number;
  label?: string;

  constructor(init: Partial<Charge> = {}) {
    Object.assign(this, init);
  }

  static builder(): ChargeBuilder {
    return new ChargeBuilder();
  }
}

export class ChargeBuilder extends BuilderBase<Charge> {
  amount(value: string | number): this { this.values.amount = value; return this; }
  percentage(value: number): this { this.values.percentage = value; return this; }
  label(value: string): this { this.values.label = value; return this; }
  build(): Charge { return new Charge(this.values); }
}

export class Product {
  name?: string;
  identifier?: string;
  description?: string;
  brandName?: string;
  quantity?: number;
  baseQuantity?: number;
  unitCode?: string;
  unitPrice?: string | number;
  discounts?: Discount[];
  charges?: Charge[];
  taxes?: Tax[];
  subtotal?: string | number;
  total?: string | number;
  barcodes?: Barcode[];
  period?: Period;

  constructor(init: Partial<Product> = {}) {
    Object.assign(this, init);
  }

  static builder(): ProductBuilder {
    return new ProductBuilder();
  }
}

export class ProductBuilder extends BuilderBase<Product> {
  name(value: string): this { this.values.name = value; return this; }
  identifier(value: string): this { this.values.identifier = value; return this; }
  description(value: string): this { this.values.description = value; return this; }
  brandName(value: string): this { this.values.brandName = value; return this; }
  quantity(value: number): this { this.values.quantity = value; return this; }
  baseQuantity(value: number): this { this.values.baseQuantity = value; return this; }
  unitCode(value: string): this { this.values.unitCode = value; return this; }
  unitPrice(value: string | number): this { this.values.unitPrice = value; return this; }
  discounts(value: Discount[]): this { this.values.discounts = value; return this; }
  charges(value: Charge[]): this { this.values.charges = value; return this; }
  taxes(value: Tax[]): this { this.values.taxes = value; return this; }
  subtotal(value: string | number): this { this.values.subtotal = value; return this; }
  total(value: string | number): this { this.values.total = value; return this; }
  barcodes(value: Barcode[]): this { this.values.barcodes = value; return this; }
  period(value: Period): this { this.values.period = value; return this; }
  addTax(rate: number, type: string, taxableAmount: string | number, amount: string | number): this {
    const existing = this.values.taxes ?? [];
    this.values.taxes = [...existing, Tax.builder().rate(rate).type(type).taxableAmount(taxableAmount).amount(amount).build()];
    return this;
  }
  addDiscount(amount: string | number, label: string, percentage?: number): this {
    const existing = this.values.discounts ?? [];
    this.values.discounts = [...existing, Discount.builder().amount(amount).label(label).percentage(percentage ?? 0).build()];
    return this;
  }
  addCharge(amount: string | number, label: string, percentage?: number): this {
    const existing = this.values.charges ?? [];
    this.values.charges = [...existing, Charge.builder().amount(amount).label(label).percentage(percentage ?? 0).build()];
    return this;
  }
  build(): Product { return new Product(this.values); }
}

export class Address {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;

  constructor(init: Partial<Address> = {}) {
    Object.assign(this, init);
  }

  static builder(): AddressBuilder {
    return new AddressBuilder();
  }
}

export class AddressBuilder extends BuilderBase<Address> {
  street(value: string): this { this.values.street = value; return this; }
  city(value: string): this { this.values.city = value; return this; }
  state(value: string): this { this.values.state = value; return this; }
  zipCode(value: string): this { this.values.zipCode = value; return this; }
  country(value: string): this { this.values.country = value; return this; }
  build(): Address { return new Address(this.values); }
}

export class SellingParty {
  companyName?: string;
  companyLegalName?: string;
  taxNumber?: string;
  identifiers?: Identifier[];
  address?: Address;

  constructor(init: Partial<SellingParty> = {}) { Object.assign(this, init); }
  static builder(): SellingPartyBuilder { return new SellingPartyBuilder(); }
}

export class SellingPartyBuilder extends BuilderBase<SellingParty> {
  companyName(value: string): this { this.values.companyName = value; return this; }
  companyLegalName(value: string): this { this.values.companyLegalName = value; return this; }
  taxNumber(value: string): this { this.values.taxNumber = value; return this; }
  identifiers(value: Identifier[]): this { this.values.identifiers = value; return this; }
  address(value: Address): this { this.values.address = value; return this; }
  build(): SellingParty { return new SellingParty(this.values); }
}

export class ReceivingParty {
  companyLegalName?: string;
  taxNumber?: string;
  consumerName?: string;
  email?: string;
  phone?: string;
  address?: Address;

  constructor(init: Partial<ReceivingParty> = {}) { Object.assign(this, init); }
  static builder(): ReceivingPartyBuilder { return new ReceivingPartyBuilder(); }
}

export class ReceivingPartyBuilder extends BuilderBase<ReceivingParty> {
  companyLegalName(value: string): this { this.values.companyLegalName = value; return this; }
  taxNumber(value: string): this { this.values.taxNumber = value; return this; }
  consumerName(value: string): this { this.values.consumerName = value; return this; }
  email(value: string): this { this.values.email = value; return this; }
  phone(value: string): this { this.values.phone = value; return this; }
  address(value: Address): this { this.values.address = value; return this; }
  build(): ReceivingParty { return new ReceivingParty(this.values); }
}

export class PaymentInfo {
  paymentType?: string;
  paymentAccountReference?: string;
  cardIssuer?: string;
  cardBrand?: string;
  lastFourDigits?: string;
  paymentIds?: string[];

  constructor(init: Partial<PaymentInfo> = {}) { Object.assign(this, init); }
  static builder(): PaymentInfoBuilder { return new PaymentInfoBuilder(); }
}

export class PaymentInfoBuilder extends BuilderBase<PaymentInfo> {
  paymentType(value: string): this { this.values.paymentType = value; return this; }
  paymentAccountReference(value: string): this { this.values.paymentAccountReference = value; return this; }
  cardIssuer(value: string): this { this.values.cardIssuer = value; return this; }
  cardBrand(value: string): this { this.values.cardBrand = value; return this; }
  lastFourDigits(value: string): this { this.values.lastFourDigits = value; return this; }
  paymentIds(value: string[]): this { this.values.paymentIds = value; return this; }
  build(): PaymentInfo { return new PaymentInfo(this.values); }
}

export class CheqiReceipt {
  documentNumber?: string;
  identifiers?: Identifier[];
  issueDate?: string | Date;
  currency?: string;
  receiptSubtotal?: string | number;
  totalBeforeTax?: string | number;
  totalTaxAmount?: string | number;
  totalAmount?: string | number;
  products?: Product[];
  discounts?: Discount[];
  charges?: Charge[];
  taxes?: Tax[];
  period?: Period;
  note?: string;
  barcodes?: Barcode[];
  sellingParty?: SellingParty;
  receivingParty?: ReceivingParty;
  verificationNonce?: string;
  paymentInfo?: PaymentInfo;

  constructor(init: Partial<CheqiReceipt> = {}) { Object.assign(this, init); }
  static builder(): CheqiReceiptBuilder { return new CheqiReceiptBuilder(); }
}

export class CheqiReceiptBuilder extends BuilderBase<CheqiReceipt> {
  documentNumber(value: string): this { this.values.documentNumber = value; return this; }
  identifiers(value: Identifier[]): this { this.values.identifiers = value; return this; }
  issueDate(value: string | Date): this { this.values.issueDate = value; return this; }
  currency(value: string): this { this.values.currency = value; return this; }
  receiptSubtotal(value: string | number): this { this.values.receiptSubtotal = value; return this; }
  totalBeforeTax(value: string | number): this { this.values.totalBeforeTax = value; return this; }
  totalTaxAmount(value: string | number): this { this.values.totalTaxAmount = value; return this; }
  totalAmount(value: string | number): this { this.values.totalAmount = value; return this; }
  products(value: Product[]): this { this.values.products = value; return this; }
  discounts(value: Discount[]): this { this.values.discounts = value; return this; }
  charges(value: Charge[]): this { this.values.charges = value; return this; }
  taxes(value: Tax[]): this { this.values.taxes = value; return this; }
  period(value: Period): this { this.values.period = value; return this; }
  note(value: string): this { this.values.note = value; return this; }
  barcodes(value: Barcode[]): this { this.values.barcodes = value; return this; }
  sellingParty(value: SellingParty): this { this.values.sellingParty = value; return this; }
  receivingParty(value: ReceivingParty): this { this.values.receivingParty = value; return this; }
  verificationNonce(value: string): this { this.values.verificationNonce = value; return this; }
  paymentInfo(value: PaymentInfo): this { this.values.paymentInfo = value; return this; }
  build(): CheqiReceipt { return new CheqiReceipt(this.values); }
}

export class VatMetadata {
  supplierCountry?: string;
  buyerCountry?: string;
  crossBorder?: boolean;
  recipientEntityType?: RecipientEntityType;
  vatOnReceipt?: boolean;
  vatRegime?: string;
  taxesApplied?: boolean;

  constructor(init: Partial<VatMetadata> = {}) { Object.assign(this, init); }
  static builder(): VatMetadataBuilder { return new VatMetadataBuilder(); }
}

export class VatMetadataBuilder extends BuilderBase<VatMetadata> {
  supplierCountry(value: string): this { this.values.supplierCountry = value; return this; }
  buyerCountry(value: string): this { this.values.buyerCountry = value; return this; }
  crossBorder(value: boolean): this { this.values.crossBorder = value; return this; }
  recipientEntityType(value: RecipientEntityType): this { this.values.recipientEntityType = value; return this; }
  vatOnReceipt(value: boolean): this { this.values.vatOnReceipt = value; return this; }
  vatRegime(value: string): this { this.values.vatRegime = value; return this; }
  taxesApplied(value: boolean): this { this.values.taxesApplied = value; return this; }
  build(): VatMetadata { return new VatMetadata(this.values); }
}

export class ReceiptTemplateRequest implements ReceiptTemplateRequestShape {
  childCompanyId?: string;
  documentNumber?: string;
  identifiers?: Identifier[];
  issueDate?: string | Date;
  currency?: string;
  receiptSubtotal?: string | number;
  totalBeforeTax?: string | number;
  totalTaxAmount?: string | number;
  totalAmount?: string | number;
  products?: Product[];
  discounts?: Discount[];
  charges?: Charge[];
  taxes?: Tax[];
  transactionDate?: string | Date;
  purchaseDate?: string | Date;
  period?: Period;
  barcodes?: Barcode[];
  note?: string;
  buyerCountryCode?: string;
  recipientEntityType?: RecipientEntityType;
  taxesApplied?: boolean;

  [key: string]: unknown;

  constructor(init: Partial<ReceiptTemplateRequestShape> = {}) {
    Object.assign(this, init);
  }

  static builder(): ReceiptTemplateRequestBuilder {
    return new ReceiptTemplateRequestBuilder();
  }
}

export class ReceiptTemplateRequestBuilder extends BuilderBase<ReceiptTemplateRequest> {
  childCompanyId(value: string): this { this.values.childCompanyId = value; return this; }
  documentNumber(value: string): this { this.values.documentNumber = value; return this; }
  identifiers(value: Identifier[]): this { this.values.identifiers = value; return this; }
  issueDate(value: string | Date): this { this.values.issueDate = value; return this; }
  currency(value: string): this { this.values.currency = value; return this; }
  receiptSubtotal(value: string | number): this { this.values.receiptSubtotal = value; return this; }
  totalBeforeTax(value: string | number): this { this.values.totalBeforeTax = value; return this; }
  totalTaxAmount(value: string | number): this { this.values.totalTaxAmount = value; return this; }
  totalAmount(value: string | number): this { this.values.totalAmount = value; return this; }
  products(value: Product[]): this { this.values.products = value; return this; }
  discounts(value: Discount[]): this { this.values.discounts = value; return this; }
  charges(value: Charge[]): this { this.values.charges = value; return this; }
  taxes(value: Tax[]): this { this.values.taxes = value; return this; }
  transactionDate(value: string | Date): this { this.values.transactionDate = value; return this; }
  purchaseDate(value: string | Date): this { this.values.purchaseDate = value; return this; }
  period(value: Period): this { this.values.period = value; return this; }
  barcodes(value: Barcode[]): this { this.values.barcodes = value; return this; }
  note(value: string): this { this.values.note = value; return this; }
  buyerCountryCode(value: string): this { this.values.buyerCountryCode = value; return this; }
  recipientEntityType(value: RecipientEntityType): this { this.values.recipientEntityType = value; return this; }
  taxesApplied(value: boolean): this { this.values.taxesApplied = value; return this; }
  addProduct(product: Product): this {
    this.values.products = [...(this.values.products ?? []), product];
    return this;
  }
  addTax(tax: Tax): this {
    this.values.taxes = [...(this.values.taxes ?? []), tax];
    return this;
  }
  addDiscount(discount: Discount): this {
    this.values.discounts = [...(this.values.discounts ?? []), discount];
    return this;
  }
  addCharge(charge: Charge): this {
    this.values.charges = [...(this.values.charges ?? []), charge];
    return this;
  }
  build(): ReceiptTemplateRequest { return new ReceiptTemplateRequest(this.values); }
}

export class ReceiptTemplateResponse implements ReceiptTemplateResponseShape {
  ubl?: string;
  cheqi?: any;
  vatMetadata?: any;

  [key: string]: unknown;

  constructor(init: Partial<ReceiptTemplateResponseShape> = {}) {
    Object.assign(this, init);
  }
}

export class CompanyAddress implements CompanyAddressShape {
  streetName?: string;
  additionalStreetName?: string;
  addressLine?: string;
  region?: string;
  cityName?: string;
  postalZone?: string;
  countryIsoCode?: string;

  [key: string]: unknown;

  constructor(init: Partial<CompanyAddressShape> = {}) { Object.assign(this, init); }
  static builder(): CompanyAddressBuilder { return new CompanyAddressBuilder(); }
}

export class CompanyAddressBuilder extends BuilderBase<CompanyAddress> {
  streetName(value: string): this { this.values.streetName = value; return this; }
  additionalStreetName(value: string): this { this.values.additionalStreetName = value; return this; }
  addressLine(value: string): this { this.values.addressLine = value; return this; }
  region(value: string): this { this.values.region = value; return this; }
  cityName(value: string): this { this.values.cityName = value; return this; }
  postalZone(value: string): this { this.values.postalZone = value; return this; }
  countryIsoCode(value: string): this { this.values.countryIsoCode = value; return this; }
  build(): CompanyAddress { return new CompanyAddress(this.values); }
}

export class Company implements CompanyShape {
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

  [key: string]: unknown;

  constructor(init: Partial<CompanyShape> = {}) { Object.assign(this, init); }
  static builder(): CompanyBuilder { return new CompanyBuilder(); }
}

export class CompanyBuilder extends BuilderBase<Company> {
  companyName(value: string): this { this.values.companyName = value; return this; }
  companyLegalName(value: string): this { this.values.companyLegalName = value; return this; }
  chamberOfCommerceNumber(value: string): this { this.values.chamberOfCommerceNumber = value; return this; }
  taxNumber(value: string): this { this.values.taxNumber = value; return this; }
  companyEmail(value: string): this { this.values.companyEmail = value; return this; }
  phoneNumber(value: string): this { this.values.phoneNumber = value; return this; }
  website(value: string): this { this.values.website = value; return this; }
  returnDays(value: number): this { this.values.returnDays = value; return this; }
  companyReceiptText(value: string): this { this.values.companyReceiptText = value; return this; }
  companyLogoUrl(value: string): this { this.values.companyLogoUrl = value; return this; }
  address(value: CompanyAddress): this { this.values.address = value; return this; }
  build(): Company { return new Company(this.values); }
}

export class CreateStoreRequest implements CreateStoreRequestShape {
  storeName?: string;
  storeCode?: string;
  address?: CompanyAddress;
  phoneNumber?: string;
  email?: string;
  openingHours?: string;

  [key: string]: unknown;

  constructor(init: Partial<CreateStoreRequestShape> = {}) { Object.assign(this, init); }
  static builder(): CreateStoreRequestBuilder { return new CreateStoreRequestBuilder(); }
}

export class CreateStoreRequestBuilder extends BuilderBase<CreateStoreRequest> {
  storeName(value: string): this { this.values.storeName = value; return this; }
  storeCode(value: string): this { this.values.storeCode = value; return this; }
  address(value: CompanyAddress): this { this.values.address = value; return this; }
  phoneNumber(value: string): this { this.values.phoneNumber = value; return this; }
  email(value: string): this { this.values.email = value; return this; }
  openingHours(value: string): this { this.values.openingHours = value; return this; }
  build(): CreateStoreRequest { return new CreateStoreRequest(this.values); }
}
