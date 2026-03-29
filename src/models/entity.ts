type EntityComponent = Record<string, unknown>;

class EntityBuilderBase<T> {
  protected values: Record<string, unknown> = {};

  from(value: Partial<T>): this {
    Object.assign(this.values, value);
    return this;
  }
}

export class Identifier {
  value: string;
  schemeAgencyID?: string;
  schemeAgencyName?: string;
  schemeDataURI?: string;
  schemeID?: string;
  schemeName?: string;
  schemeURI?: string;
  schemeVersionID?: string;

  constructor(value: string, init: Partial<Identifier> = {}) {
    this.value = value;
    Object.assign(this, init);
  }

  static builder(value: string): IdentifierBuilder {
    return new IdentifierBuilder(value);
  }

  getValue(): string { return this.value; }
}

export class IdentifierBuilder extends EntityBuilderBase<Identifier> {
  constructor(private readonly value: string) {
    super();
  }

  schemeAgencyID(value: string): this { this.values.schemeAgencyID = value; return this; }
  schemeAgencyName(value: string): this { this.values.schemeAgencyName = value; return this; }
  schemeDataURI(value: string): this { this.values.schemeDataURI = value; return this; }
  schemeID(value: string): this { this.values.schemeID = value; return this; }
  schemeName(value: string): this { this.values.schemeName = value; return this; }
  schemeURI(value: string): this { this.values.schemeURI = value; return this; }
  schemeVersionID(value: string): this { this.values.schemeVersionID = value; return this; }

  build(): Identifier {
    return new Identifier(this.value, this.values as Partial<Identifier>);
  }
}

export class Party {
  endpointID?: Identifier;
  partyIdentification?: EntityComponent[];
  partyName?: EntityComponent;
  postalAddress: EntityComponent;
  partyTaxScheme?: EntityComponent[];
  partyLegalEntity: EntityComponent[];
  contact?: EntityComponent;

  constructor(partyLegalEntity: EntityComponent[], postalAddress: EntityComponent, init: Partial<Party> = {}) {
    this.partyLegalEntity = partyLegalEntity;
    this.postalAddress = postalAddress;
    Object.assign(this, init);
  }

  static builder(partyLegalEntity: EntityComponent | EntityComponent[], postalAddress: EntityComponent): PartyBuilder {
    return new PartyBuilder(partyLegalEntity, postalAddress);
  }

  getEndpointID(): Identifier | undefined { return this.endpointID; }
  getPartyIdentification(): EntityComponent[] | undefined { return this.partyIdentification; }
  getPartyName(): EntityComponent | undefined { return this.partyName; }
  getPostalAddress(): EntityComponent { return this.postalAddress; }
  getPartyTaxScheme(): EntityComponent[] | undefined { return this.partyTaxScheme; }
  getPartyLegalEntity(): EntityComponent | undefined { return this.partyLegalEntity[0]; }
  getPartyLegalEntities(): EntityComponent[] { return this.partyLegalEntity; }
  getContact(): EntityComponent | undefined { return this.contact; }
}

export class PartyBuilder extends EntityBuilderBase<Party> {
  private readonly partyLegalEntity: EntityComponent[];
  private readonly postalAddress: EntityComponent;

  constructor(partyLegalEntity: EntityComponent | EntityComponent[], postalAddress: EntityComponent) {
    super();
    const legalEntities = Array.isArray(partyLegalEntity) ? partyLegalEntity.filter(Boolean) : [partyLegalEntity];
    if (legalEntities.length === 0 || !postalAddress) {
      throw new Error("At least one PartyLegalEntity and PostalAddress are required");
    }
    this.partyLegalEntity = legalEntities;
    this.postalAddress = postalAddress;
  }

  endpointID(value: Identifier): this { this.values.endpointID = value; return this; }
  partyIdentification(value: EntityComponent[]): this { this.values.partyIdentification = value; return this; }
  partyName(value: EntityComponent): this { this.values.partyName = value; return this; }
  partyTaxScheme(value: EntityComponent[]): this {
    if (value.length > 2) throw new Error("Cannot add more than 2 PartyTaxScheme objects");
    this.values.partyTaxScheme = value;
    return this;
  }
  contact(value: EntityComponent): this { this.values.contact = value; return this; }

  build(): Party {
    return new Party(this.partyLegalEntity, this.postalAddress, this.values as Partial<Party>);
  }
}

export class PaymentMeans {
  id?: Identifier;
  paymentMeansCode: EntityComponent;
  paymentMeansDescription?: string[];
  paymentID?: Identifier[];
  paymentDueDate?: string;
  paymentChannelCode?: EntityComponent;
  instructionID?: Identifier;
  instructionNote?: string[];
  chargeBearerCode?: EntityComponent;
  serviceLevelCode?: EntityComponent;
  cardAccount?: EntityComponent[];
  payerFinancialAccount?: EntityComponent;
  payeeFinancialAccount?: EntityComponent;
  creditAccount?: EntityComponent;
  paymentMandate?: EntityComponent;
  tradeFinancing?: EntityComponent;
  remittanceDocumentDistribution?: EntityComponent;

  constructor(paymentMeansCode: EntityComponent, init: Partial<PaymentMeans> = {}) {
    this.paymentMeansCode = paymentMeansCode;
    Object.assign(this, init);
  }

  static builder(paymentMeansCode: EntityComponent): PaymentMeansBuilder {
    return new PaymentMeansBuilder(paymentMeansCode);
  }
}

export class PaymentMeansBuilder extends EntityBuilderBase<PaymentMeans> {
  constructor(private readonly paymentMeansCode: EntityComponent) {
    super();
  }

  id(value: Identifier): this { this.values.id = value; return this; }
  paymentMeansDescription(value: string[]): this { this.values.paymentMeansDescription = value; return this; }
  paymentID(value: Identifier[]): this { this.values.paymentID = value; return this; }
  paymentDueDate(value: string): this { this.values.paymentDueDate = value; return this; }
  paymentChannelCode(value: EntityComponent): this { this.values.paymentChannelCode = value; return this; }
  instructionID(value: Identifier): this { this.values.instructionID = value; return this; }
  instructionNote(value: string[]): this { this.values.instructionNote = value; return this; }
  chargeBearerCode(value: EntityComponent): this { this.values.chargeBearerCode = value; return this; }
  serviceLevelCode(value: EntityComponent): this { this.values.serviceLevelCode = value; return this; }
  cardAccount(value: EntityComponent[]): this { this.values.cardAccount = value; return this; }
  payerFinancialAccount(value: EntityComponent): this { this.values.payerFinancialAccount = value; return this; }
  payeeFinancialAccount(value: EntityComponent): this { this.values.payeeFinancialAccount = value; return this; }
  creditAccount(value: EntityComponent): this { this.values.creditAccount = value; return this; }
  paymentMandate(value: EntityComponent): this { this.values.paymentMandate = value; return this; }
  tradeFinancing(value: EntityComponent): this { this.values.tradeFinancing = value; return this; }
  remittanceDocumentDistribution(value: EntityComponent): this { this.values.remittanceDocumentDistribution = value; return this; }

  build(): PaymentMeans {
    return new PaymentMeans(this.paymentMeansCode, this.values as Partial<PaymentMeans>);
  }
}

export class TaxTotal {
  taxAmount: EntityComponent;
  calculationSequenceNumeric?: number;
  roundingAmount?: EntityComponent;
  taxEvidenceIndicator?: boolean;
  taxIncludedIndicator?: boolean;
  taxSubtotals?: EntityComponent[];

  constructor(taxAmount: EntityComponent, init: Partial<TaxTotal> = {}) {
    this.taxAmount = taxAmount;
    Object.assign(this, init);
  }

  static builder(taxAmount: EntityComponent): TaxTotalBuilder {
    return new TaxTotalBuilder(taxAmount);
  }
}

export class TaxTotalBuilder extends EntityBuilderBase<TaxTotal> {
  private subtotalItems: EntityComponent[] = [];

  constructor(private readonly taxAmount: EntityComponent) {
    super();
  }

  calculationSequenceNumeric(value: number): this { this.values.calculationSequenceNumeric = value; return this; }
  roundingAmount(value: EntityComponent): this { this.values.roundingAmount = value; return this; }
  taxEvidenceIndicator(value: boolean): this { this.values.taxEvidenceIndicator = value; return this; }
  taxIncludedIndicator(value: boolean): this { this.values.taxIncludedIndicator = value; return this; }
  addTaxSubtotal(value: EntityComponent): this { this.subtotalItems.push(value); return this; }
  taxSubtotals(value: EntityComponent[]): this { this.subtotalItems = value; return this; }

  build(): TaxTotal {
    return new TaxTotal(this.taxAmount, {
      ...(this.values as Partial<TaxTotal>),
      taxSubtotals: this.subtotalItems
    });
  }
}

export class MonetaryTotal {
  lineExtensionAmount: EntityComponent;
  taxExclusiveAmount: EntityComponent;
  taxInclusiveAmount: EntityComponent;
  allowanceTotalAmount?: EntityComponent;
  allowanceTotalTaxInclusiveAmount?: EntityComponent;
  chargeTotalAmount?: EntityComponent;
  chargeTotalTaxInclusiveAmount?: EntityComponent;
  withholdingTaxTotalAmount?: EntityComponent;
  prepaidAmount?: EntityComponent;
  payableRoundingAmount?: EntityComponent;
  payableAmount: EntityComponent;
  payableAlternativeAmount?: EntityComponent;

  constructor(
    lineExtensionAmount: EntityComponent,
    taxExclusiveAmount: EntityComponent,
    taxInclusiveAmount: EntityComponent,
    payableAmount: EntityComponent,
    init: Partial<MonetaryTotal> = {}
  ) {
    this.lineExtensionAmount = lineExtensionAmount;
    this.taxExclusiveAmount = taxExclusiveAmount;
    this.taxInclusiveAmount = taxInclusiveAmount;
    this.payableAmount = payableAmount;
    Object.assign(this, init);
  }

  static builder(
    lineExtensionAmount: EntityComponent,
    taxExclusiveAmount: EntityComponent,
    taxInclusiveAmount: EntityComponent,
    payableAmount: EntityComponent
  ): MonetaryTotalBuilder {
    return new MonetaryTotalBuilder(lineExtensionAmount, taxExclusiveAmount, taxInclusiveAmount, payableAmount);
  }
}

export class MonetaryTotalBuilder extends EntityBuilderBase<MonetaryTotal> {
  constructor(
    private readonly lineExtensionAmount: EntityComponent,
    private readonly taxExclusiveAmount: EntityComponent,
    private readonly taxInclusiveAmount: EntityComponent,
    private readonly payableAmount: EntityComponent
  ) {
    super();
  }

  allowanceTotalAmount(value: EntityComponent): this { this.values.allowanceTotalAmount = value; return this; }
  allowanceTotalTaxInclusiveAmount(value: EntityComponent): this { this.values.allowanceTotalTaxInclusiveAmount = value; return this; }
  chargeTotalAmount(value: EntityComponent): this { this.values.chargeTotalAmount = value; return this; }
  chargeTotalTaxInclusiveAmount(value: EntityComponent): this { this.values.chargeTotalTaxInclusiveAmount = value; return this; }
  withholdingTaxTotalAmount(value: EntityComponent): this { this.values.withholdingTaxTotalAmount = value; return this; }
  prepaidAmount(value: EntityComponent): this { this.values.prepaidAmount = value; return this; }
  payableRoundingAmount(value: EntityComponent): this { this.values.payableRoundingAmount = value; return this; }
  payableAlternativeAmount(value: EntityComponent): this { this.values.payableAlternativeAmount = value; return this; }

  build(): MonetaryTotal {
    return new MonetaryTotal(
      this.lineExtensionAmount,
      this.taxExclusiveAmount,
      this.taxInclusiveAmount,
      this.payableAmount,
      this.values as Partial<MonetaryTotal>
    );
  }
}

export class PurchaseReceiptLine {
  id: Identifier;
  item: EntityComponent;
  uuid?: string;
  note?: string[];
  quantity?: EntityComponent;
  lineExtensionAmount?: EntityComponent;
  taxInclusiveLineExtensionAmount?: EntityComponent;
  purchaseLinePeriod?: EntityComponent;
  purchaseReference?: EntityComponent;
  allowanceCharges?: EntityComponent[];
  taxTotals?: TaxTotal[];
  price?: EntityComponent;

  constructor(id: Identifier, item: EntityComponent, init: Partial<PurchaseReceiptLine> = {}) {
    this.id = id;
    this.item = item;
    Object.assign(this, init);
  }

  static builder(id: Identifier, item: EntityComponent): PurchaseReceiptLineBuilder {
    return new PurchaseReceiptLineBuilder(id, item);
  }
}

export class PurchaseReceiptLineBuilder extends EntityBuilderBase<PurchaseReceiptLine> {
  constructor(private readonly id: Identifier, private readonly item: EntityComponent) {
    super();
    if (!id) throw new Error("ID is mandatory and cannot be null");
    if (!item) throw new Error("Item is mandatory and cannot be null");
  }

  uuid(value: string): this { this.values.uuid = value; return this; }
  note(value: string[]): this { this.values.note = value; return this; }
  quantity(value: EntityComponent): this { this.values.quantity = value; return this; }
  lineExtensionAmount(value: EntityComponent): this { this.values.lineExtensionAmount = value; return this; }
  taxInclusiveLineExtensionAmount(value: EntityComponent): this { this.values.taxInclusiveLineExtensionAmount = value; return this; }
  purchaseLinePeriod(value: EntityComponent): this { this.values.purchaseLinePeriod = value; return this; }
  purchaseReference(value: EntityComponent): this { this.values.purchaseReference = value; return this; }
  allowanceCharges(value: EntityComponent[]): this { this.values.allowanceCharges = value; return this; }
  taxTotals(value: TaxTotal[]): this { this.values.taxTotals = value; return this; }
  price(value: EntityComponent): this { this.values.price = value; return this; }

  build(): PurchaseReceiptLine {
    return new PurchaseReceiptLine(this.id, this.item, this.values as Partial<PurchaseReceiptLine>);
  }
}

export class PurchaseReceipt {
  id: Identifier;
  issueDate: string;
  issueTime?: string;
  purchaseDate?: string;
  purchaseTime?: string;
  note?: string;
  documentCurrencyCode: string;
  accountingSupplierParty: Party;
  accountingCustomerParty?: Party;
  paymentMeans?: PaymentMeans[];
  taxTotals?: TaxTotal[];
  legalMonetaryTotal: MonetaryTotal;
  purchaseReceiptLines: PurchaseReceiptLine[];
  receiptUuid?: string;

  constructor(
    id: Identifier,
    issueDate: string,
    accountingSupplierParty: Party,
    documentCurrencyCode: string,
    legalMonetaryTotal: MonetaryTotal,
    purchaseReceiptLines: PurchaseReceiptLine[],
    init: Partial<PurchaseReceipt> = {}
  ) {
    this.id = id;
    this.issueDate = issueDate;
    this.accountingSupplierParty = accountingSupplierParty;
    this.documentCurrencyCode = documentCurrencyCode;
    this.legalMonetaryTotal = legalMonetaryTotal;
    this.purchaseReceiptLines = purchaseReceiptLines;
    Object.assign(this, init);
  }

  static builder(
    id: Identifier,
    issueDate: string,
    accountingSupplierParty: Party,
    documentCurrencyCode: string,
    legalMonetaryTotal: MonetaryTotal,
    purchaseReceiptLines: PurchaseReceiptLine[]
  ): PurchaseReceiptBuilder {
    return new PurchaseReceiptBuilder(
      id,
      issueDate,
      accountingSupplierParty,
      documentCurrencyCode,
      legalMonetaryTotal,
      purchaseReceiptLines
    );
  }
}

export class PurchaseReceiptBuilder extends EntityBuilderBase<PurchaseReceipt> {
  constructor(
    private readonly id: Identifier,
    private readonly issueDate: string,
    private readonly accountingSupplierParty: Party,
    private readonly initialDocumentCurrencyCode: string,
    private readonly legalMonetaryTotal: MonetaryTotal,
    private readonly purchaseReceiptLines: PurchaseReceiptLine[]
  ) {
    super();
  }

  issueTime(value: string): this { this.values.issueTime = value; return this; }
  purchaseDate(value: string): this { this.values.purchaseDate = value; return this; }
  purchaseTime(value: string): this { this.values.purchaseTime = value; return this; }
  note(value: string): this { this.values.note = value; return this; }
  documentCurrencyCode(value: string): this { this.values.documentCurrencyCode = value; return this; }
  accountingCustomerParty(value: Party): this { this.values.accountingCustomerParty = value; return this; }
  paymentMeans(value: PaymentMeans[]): this { this.values.paymentMeans = value; return this; }
  taxTotals(value: TaxTotal[]): this { this.values.taxTotals = value; return this; }
  receiptUuid(value: string): this { this.values.receiptUuid = value; return this; }

  build(): PurchaseReceipt {
    return new PurchaseReceipt(
      this.id,
      this.issueDate,
      this.accountingSupplierParty,
      (this.values.documentCurrencyCode as string | undefined) ?? this.initialDocumentCurrencyCode,
      this.legalMonetaryTotal,
      this.purchaseReceiptLines,
      this.values as Partial<PurchaseReceipt>
    );
  }
}
