import type {
  AddressDTO,
  BarcodeType,
  BuyerType,
  CardDetails as CardDetailsShape,
  Charge as ChargeShape,
  CompanyDTO,
  CreateStoreRequest as CreateStoreRequestShape,
  Discount as DiscountShape,
  IdentificationDetails as IdentificationDetailsShape,
  IdentificationDetailsPaymentTypeEnum,
  Identifier as IdentifierShape,
  MatchedRecipient,
  NotificationDisplayCode as NotificationDisplayCodeShape,
  PaymentAccountDetails as PaymentAccountDetailsShape,
  Period as PeriodShape,
  Product as ProductShape,
  ReceiptFormat,
  ReceiptTemplateRequest as ReceiptTemplateRequestShape,
  ReceiptTemplateResponse as ReceiptTemplateResponseShape,
  ReceiverType,
  RecipientResolutionResponse as RecipientResolutionResponseShape,
  SellingParty as SellingPartyShape,
  ReceivingParty as ReceivingPartyShape,
  Tax as TaxShape,
  VatMetadata as VatMetadataShape,
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

  constructor(init: Partial<CardDetailsShape> = {}) {
    Object.assign(this, init);
  }

  static builder(): CardDetailsBuilder {
    return new CardDetailsBuilder();
  }
}

export class CardDetailsBuilder extends BuilderBase<CardDetailsShape> {
  paymentAccountNumber(value: string): this { this.values.paymentAccountNumber = value; return this; }
  paymentAccountReference(value: string): this { this.values.paymentAccountReference = value; return this; }
  cardProvider(value: string): this { this.values.cardProvider = value; return this; }
  build(): CardDetailsShape { return { ...this.values }; }
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

export class PaymentAccountDetailsBuilder extends BuilderBase<PaymentAccountDetailsShape> {
  identifier(value: string): this { this.values.identifier = value; return this; }
  identifierType(value: string): this { this.values.identifierType = value; return this; }
  build(): PaymentAccountDetailsShape { return { ...this.values }; }
}

export class IdentificationDetails implements IdentificationDetailsShape {
  paymentType!: IdentificationDetailsPaymentTypeEnum;
  cardDetails?: CardDetailsShape;
  paymentAccountDetails?: PaymentAccountDetailsShape;
  paymentIds?: string[];
  recipientEmail?: string;
  cheqiReceiptId?: string;
  pairingCode?: string;

  constructor(init: Partial<IdentificationDetailsShape> = {}) {
    Object.assign(this, init);
  }

  static builder(): IdentificationDetailsBuilder {
    return new IdentificationDetailsBuilder();
  }

  getPaymentType(): Optional<IdentificationDetailsPaymentTypeEnum> { return this.paymentType; }
  getCardDetails(): Optional<CardDetailsShape> { return this.cardDetails; }
  getPaymentAccountDetails(): Optional<PaymentAccountDetailsShape> { return this.paymentAccountDetails; }
  getPaymentIds(): Optional<string[]> { return this.paymentIds; }
  getRecipientEmail(): Optional<string> { return this.recipientEmail; }
  getCheqiReceiptId(): Optional<string> { return this.cheqiReceiptId; }
  getPairingCode(): Optional<string> { return this.pairingCode; }
}

export class IdentificationDetailsBuilder extends BuilderBase<IdentificationDetailsShape> {
  paymentType(value: IdentificationDetailsPaymentTypeEnum): this { this.values.paymentType = value; return this; }
  cardDetails(value: CardDetailsShape): this { this.values.cardDetails = value; return this; }
  paymentAccountDetails(value: PaymentAccountDetailsShape): this { this.values.paymentAccountDetails = value; return this; }
  paymentIds(value: string[]): this { this.values.paymentIds = value; return this; }
  recipientEmail(value: string): this { this.values.recipientEmail = value; return this; }
  cheqiReceiptId(value: string): this { this.values.cheqiReceiptId = value; return this; }
  pairingCode(value: string): this { this.values.pairingCode = value; return this; }
  build(): IdentificationDetails { return new IdentificationDetails(this.values); }
}

export class NotificationDisplayCode implements NotificationDisplayCodeShape {
  type!: BarcodeType;
  data!: string;

  constructor(init: NotificationDisplayCodeShape) {
    this.type = init.type;
    this.data = init.data;
  }

  static builder(): NotificationDisplayCodeBuilder {
    return new NotificationDisplayCodeBuilder();
  }
}

export class NotificationDisplayCodeBuilder extends BuilderBase<NotificationDisplayCodeShape> {
  type(value: BarcodeType): this { (this.values as any).type = value; return this; }
  data(value: string): this { (this.values as any).data = value; return this; }
  build(): NotificationDisplayCode { return new NotificationDisplayCode(this.values as NotificationDisplayCodeShape); }
}

export class Identifier {
  value?: string;
  type?: string;

  constructor(init: Partial<IdentifierShape> = {}) {
    Object.assign(this, init);
  }

  static builder(): IdentifierBuilder {
    return new IdentifierBuilder();
  }
}

export class IdentifierBuilder extends BuilderBase<IdentifierShape> {
  value(value: string): this { this.values.value = value; return this; }
  type(value: string): this { this.values.type = value; return this; }
  build(): IdentifierShape { return { ...this.values }; }
}

export class Period {
  startDate?: string;
  endDate?: string;
  description?: string;

  constructor(init: Partial<PeriodShape> = {}) {
    Object.assign(this, init);
  }

  static builder(): PeriodBuilder {
    return new PeriodBuilder();
  }
}

export class PeriodBuilder extends BuilderBase<PeriodShape> {
  startDate(value: string): this { this.values.startDate = value; return this; }
  endDate(value: string): this { this.values.endDate = value; return this; }
  description(value: string): this { this.values.description = value; return this; }
  build(): PeriodShape { return { ...this.values }; }
}

export class Barcode {
  type?: string;
  data?: string;
  label?: string;

  constructor(init: Partial<{ type?: string; data?: string; label?: string }> = {}) {
    Object.assign(this, init);
  }

  static builder(): BarcodeBuilder {
    return new BarcodeBuilder();
  }
}

export class BarcodeBuilder extends BuilderBase<{ type?: string; data?: string; label?: string }> {
  type(value: string): this { this.values.type = value; return this; }
  data(value: string): this { this.values.data = value; return this; }
  label(value: string): this { this.values.label = value; return this; }
  build(): { type?: string; data?: string; label?: string } { return { ...this.values }; }
}

export class Tax {
  rate?: number;
  type?: string;
  taxableAmount?: number;
  amount?: number;
  label?: string;

  constructor(init: Partial<TaxShape> = {}) {
    Object.assign(this, init);
  }

  static builder(): TaxBuilder {
    return new TaxBuilder();
  }
}

export class TaxBuilder extends BuilderBase<TaxShape> {
  rate(value: number): this { this.values.rate = value; return this; }
  type(value: string): this { this.values.type = value; return this; }
  taxableAmount(value: number): this { this.values.taxableAmount = value; return this; }
  amount(value: number): this { this.values.amount = value; return this; }
  label(value: string): this { this.values.label = value; return this; }
  build(): TaxShape { return { ...this.values }; }
}

export class Discount {
  amount?: number;
  percentage?: number;
  label?: string;

  constructor(init: Partial<DiscountShape> = {}) {
    Object.assign(this, init);
  }

  static builder(): DiscountBuilder {
    return new DiscountBuilder();
  }
}

export class DiscountBuilder extends BuilderBase<DiscountShape> {
  amount(value: number): this { this.values.amount = value; return this; }
  percentage(value: number): this { this.values.percentage = value; return this; }
  label(value: string): this { this.values.label = value; return this; }
  build(): DiscountShape { return { ...this.values }; }
}

export class Charge {
  amount?: number;
  percentage?: number;
  label?: string;

  constructor(init: Partial<ChargeShape> = {}) {
    Object.assign(this, init);
  }

  static builder(): ChargeBuilder {
    return new ChargeBuilder();
  }
}

export class ChargeBuilder extends BuilderBase<ChargeShape> {
  amount(value: number): this { this.values.amount = value; return this; }
  percentage(value: number): this { this.values.percentage = value; return this; }
  label(value: string): this { this.values.label = value; return this; }
  build(): ChargeShape { return { ...this.values }; }
}

export class Product {
  name?: string;
  identifier?: string;
  description?: string;
  brandName?: string;
  quantity?: number;
  baseQuantity?: number;
  unitCode?: any;
  unitPrice?: number;
  discounts?: DiscountShape[];
  charges?: ChargeShape[];
  taxes?: TaxShape[];
  subtotal?: number;
  total?: number;
  barcodes?: any[];
  period?: PeriodShape;

  constructor(init: Partial<ProductShape> = {}) {
    Object.assign(this, init);
  }

  static builder(): ProductBuilder {
    return new ProductBuilder();
  }
}

export class ProductBuilder extends BuilderBase<ProductShape> {
  name(value: string): this { this.values.name = value; return this; }
  identifier(value: string): this { this.values.identifier = value; return this; }
  description(value: string): this { this.values.description = value; return this; }
  brandName(value: string): this { this.values.brandName = value; return this; }
  quantity(value: number): this { this.values.quantity = value; return this; }
  baseQuantity(value: number): this { this.values.baseQuantity = value; return this; }
  unitCode(value: string): this { this.values.unitCode = value; return this; }
  unitPrice(value: number): this { this.values.unitPrice = value; return this; }
  discounts(value: DiscountShape[]): this { this.values.discounts = value; return this; }
  charges(value: ChargeShape[]): this { this.values.charges = value; return this; }
  taxes(value: TaxShape[]): this { this.values.taxes = value; return this; }
  subtotal(value: number): this { this.values.subtotal = value; return this; }
  total(value: number): this { this.values.total = value; return this; }
  barcodes(value: any[]): this { this.values.barcodes = value; return this; }
  period(value: PeriodShape): this { this.values.period = value; return this; }
  addTax(rate: number, type: string, taxableAmount: number, amount: number): this {
    const existing = this.values.taxes ?? [];
    this.values.taxes = [...existing, Tax.builder().rate(rate).type(type).taxableAmount(taxableAmount).amount(amount).build()];
    return this;
  }
  addDiscount(amount: number, label: string, percentage?: number): this {
    const existing = this.values.discounts ?? [];
    this.values.discounts = [...existing, Discount.builder().amount(amount).label(label).percentage(percentage ?? 0).build()];
    return this;
  }
  addCharge(amount: number, label: string, percentage?: number): this {
    const existing = this.values.charges ?? [];
    this.values.charges = [...existing, Charge.builder().amount(amount).label(label).percentage(percentage ?? 0).build()];
    return this;
  }
  build(): ProductShape { return { ...this.values }; }
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

export class VatMetadata {
  supplierCountry?: string;
  buyerCountry?: string;
  crossBorder?: boolean;
  buyerType?: BuyerType;
  vatOnReceipt?: boolean;
  vatRegime?: string;
  taxesApplied?: boolean;

  constructor(init: Partial<VatMetadataShape> = {}) { Object.assign(this, init); }
  static builder(): VatMetadataBuilder { return new VatMetadataBuilder(); }
}

export class VatMetadataBuilder extends BuilderBase<VatMetadataShape> {
  supplierCountry(value: string): this { this.values.supplierCountry = value; return this; }
  buyerCountry(value: string): this { this.values.buyerCountry = value; return this; }
  crossBorder(value: boolean): this { this.values.crossBorder = value; return this; }
  buyerType(value: BuyerType): this { this.values.buyerType = value; return this; }
  vatOnReceipt(value: boolean): this { this.values.vatOnReceipt = value; return this; }
  vatRegime(value: string): this { this.values.vatRegime = value; return this; }
  taxesApplied(value: boolean): this { this.values.taxesApplied = value; return this; }
  build(): VatMetadataShape { return { ...this.values }; }
}

export class ReceiptTemplateRequest {
  childCompanyId?: string;
  documentNumber?: string;
  identifiers?: IdentifierShape[];
  issueDate?: Date;
  currency?: string;
  receiptSubtotal?: number;
  totalBeforeTax?: number;
  totalTaxAmount?: number;
  totalAmount?: number;
  products?: ProductShape[];
  discounts?: DiscountShape[];
  charges?: ChargeShape[];
  taxes?: TaxShape[];
  transactionDate?: Date;
  purchaseDate?: Date;
  period?: PeriodShape;
  barcodes?: any[];
  note?: string;

  constructor(init: Partial<ReceiptTemplateRequestShape> = {}) {
    Object.assign(this, init);
  }

  static builder(): ReceiptTemplateRequestBuilder {
    return new ReceiptTemplateRequestBuilder();
  }
}

export class ReceiptTemplateRequestBuilder extends BuilderBase<ReceiptTemplateRequestShape> {
  childCompanyId(value: string): this { this.values.childCompanyId = value; return this; }
  documentNumber(value: string): this { this.values.documentNumber = value; return this; }
  identifiers(value: IdentifierShape[]): this { this.values.identifiers = value; return this; }
  issueDate(value: Date): this { this.values.issueDate = value; return this; }
  currency(value: string): this { this.values.currency = value; return this; }
  receiptSubtotal(value: number): this { this.values.receiptSubtotal = value; return this; }
  totalBeforeTax(value: number): this { this.values.totalBeforeTax = value; return this; }
  totalTaxAmount(value: number): this { this.values.totalTaxAmount = value; return this; }
  totalAmount(value: number): this { this.values.totalAmount = value; return this; }
  products(value: ProductShape[]): this { this.values.products = value; return this; }
  discounts(value: DiscountShape[]): this { this.values.discounts = value; return this; }
  charges(value: ChargeShape[]): this { this.values.charges = value; return this; }
  taxes(value: TaxShape[]): this { this.values.taxes = value; return this; }
  transactionDate(value: Date): this { this.values.transactionDate = value; return this; }
  purchaseDate(value: Date): this { this.values.purchaseDate = value; return this; }
  period(value: PeriodShape): this { this.values.period = value; return this; }
  barcodes(value: any[]): this { this.values.barcodes = value; return this; }
  note(value: string): this { this.values.note = value; return this; }
  addProduct(product: ProductShape): this {
    this.values.products = [...(this.values.products ?? []), product];
    return this;
  }
  addTax(tax: TaxShape): this {
    this.values.taxes = [...(this.values.taxes ?? []), tax];
    return this;
  }
  addDiscount(discount: DiscountShape): this {
    this.values.discounts = [...(this.values.discounts ?? []), discount];
    return this;
  }
  addCharge(charge: ChargeShape): this {
    this.values.charges = [...(this.values.charges ?? []), charge];
    return this;
  }
  build(): ReceiptTemplateRequest { return new ReceiptTemplateRequest(this.values); }
}

export class ReceiptTemplateResponse implements Partial<ReceiptTemplateResponseShape> {
  ubl?: string;
  cheqi?: any;
  vatMetadata?: any;

  constructor(init: Partial<ReceiptTemplateResponseShape> = {}) {
    Object.assign(this, init);
  }
}

export class CompanyAddress implements Partial<AddressDTO> {
  streetName?: string;
  additionalStreetName?: string;
  addressLine?: string;
  region?: string;
  cityName?: string;
  postalZone?: string;
  countryIsoCode?: string;

  constructor(init: Partial<AddressDTO> = {}) { Object.assign(this, init); }
  static builder(): CompanyAddressBuilder { return new CompanyAddressBuilder(); }
}

export class CompanyAddressBuilder extends BuilderBase<AddressDTO> {
  streetName(value: string): this { this.values.streetName = value; return this; }
  additionalStreetName(value: string): this { this.values.additionalStreetName = value; return this; }
  addressLine(value: string): this { this.values.addressLine = value; return this; }
  region(value: string): this { this.values.region = value; return this; }
  cityName(value: string): this { this.values.cityName = value; return this; }
  postalZone(value: string): this { this.values.postalZone = value; return this; }
  countryIsoCode(value: string): this { this.values.countryIsoCode = value; return this; }
  build(): CompanyAddress { return new CompanyAddress(this.values); }
}

export class Company {
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

  constructor(init: Partial<Company> = {}) { Object.assign(this, init); }
  static builder(): CompanyBuilder { return new CompanyBuilder(); }

  toCompanyDTO(): CompanyDTO {
    // The provisioning API models tax/registration numbers as company identifiers.
    const identifiers: NonNullable<CompanyDTO["identifiers"]> = new Set();
    if (this.taxNumber) {
      identifiers.add({ identifierType: "TAX", value: this.taxNumber });
    }
    if (this.chamberOfCommerceNumber) {
      identifiers.add({ identifierType: "COMPANY_REGISTRATION", value: this.chamberOfCommerceNumber });
    }

    return {
      companyName: this.companyName ?? "",
      companyLegalName: this.companyLegalName ?? "",
      identifiers: identifiers.size > 0 ? identifiers : undefined,
      companyEmail: this.companyEmail ?? "",
      address: {
        streetName: this.address?.streetName ?? "",
        cityName: this.address?.cityName ?? "",
        postalZone: this.address?.postalZone ?? "",
        countryIsoCode: this.address?.countryIsoCode ?? "",
        additionalStreetName: this.address?.additionalStreetName,
        addressLine: this.address?.addressLine,
        region: this.address?.region,
      },
      phoneNumber: this.phoneNumber,
      website: this.website,
      returnDays: this.returnDays,
      companyReceiptText: this.companyReceiptText,
    };
  }
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

export class CreateStoreRequest {
  storeName?: string;
  storeCode?: string;
  address?: CompanyAddress;
  phoneNumber?: string;
  email?: string;
  openingHours?: string;

  constructor(init: Partial<CreateStoreRequest> = {}) { Object.assign(this, init); }
  static builder(): CreateStoreRequestBuilder { return new CreateStoreRequestBuilder(); }

  toCreateStoreRequestDTO(): CreateStoreRequestShape {
    return {
      storeName: this.storeName ?? "",
      storeCode: this.storeCode ?? "",
      addressDto: {
        streetName: this.address?.streetName ?? "",
        cityName: this.address?.cityName ?? "",
        postalZone: this.address?.postalZone ?? "",
        countryIsoCode: this.address?.countryIsoCode ?? "",
        additionalStreetName: this.address?.additionalStreetName,
        addressLine: this.address?.addressLine,
        region: this.address?.region,
      },
      phoneNumber: this.phoneNumber,
      email: this.email,
      openingHours: this.openingHours,
    };
  }
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
