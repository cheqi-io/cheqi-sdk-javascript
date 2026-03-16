export interface ReceiptResultInit {
  success: boolean;
  deliveryMethod?: string | null;
  customerFound?: boolean;
  receiptCount?: number;
  response?: unknown;
  templateContent?: string | null;
  message?: string | null;
  customerEmail?: string | null;
}

export class ReceiptResult {
  readonly success: boolean;
  readonly deliveryMethod: string | null;
  readonly customerFound: boolean;
  readonly receiptCount: number;
  readonly response: unknown;
  readonly templateContent: string | null;
  readonly message: string | null;
  readonly customerEmail: string | null;

  constructor(init: ReceiptResultInit) {
    this.success = init.success;
    this.deliveryMethod = init.deliveryMethod ?? null;
    this.customerFound = init.customerFound ?? false;
    this.receiptCount = init.receiptCount ?? 0;
    this.response = init.response ?? null;
    this.templateContent = init.templateContent ?? null;
    this.message = init.message ?? null;
    this.customerEmail = init.customerEmail ?? null;
  }

  static deliveredToApp(response: Record<string, unknown>, templateContent: string): ReceiptResult {
    const receiptCount =
      (Array.isArray(response.createdReceipts) ? response.createdReceipts.length : undefined) ??
      (typeof response.receiptCount === "number" ? response.receiptCount : 0);

    return new ReceiptResult({
      success: true,
      deliveryMethod: "APP",
      customerFound: true,
      receiptCount,
      response,
      templateContent
    });
  }

  static deliveredViaEmail(customerEmail: string): ReceiptResult {
    return new ReceiptResult({
      success: true,
      deliveryMethod: "EMAIL",
      customerFound: false,
      customerEmail
    });
  }

  static customerNotFound(): ReceiptResult {
    return new ReceiptResult({
      success: false,
      customerFound: false,
      message: "Customer not found"
    });
  }

  isSuccess(): boolean {
    return this.success;
  }

  isCustomerNotFound(): boolean {
    return !this.customerFound;
  }

  getReceiptCount(): number {
    return this.receiptCount;
  }

  getMessage(): string | null {
    return this.message;
  }
}

export interface CreditNoteResultInit {
  success: boolean;
  customerFound?: boolean;
  creditNoteCount?: number;
  response?: unknown;
  templateContent?: string | null;
  message?: string | null;
}

export class CreditNoteResult {
  readonly success: boolean;
  readonly customerFound: boolean;
  readonly creditNoteCount: number;
  readonly response: unknown;
  readonly templateContent: string | null;
  readonly message: string | null;

  constructor(init: CreditNoteResultInit) {
    this.success = init.success;
    this.customerFound = init.customerFound ?? false;
    this.creditNoteCount = init.creditNoteCount ?? 0;
    this.response = init.response ?? null;
    this.templateContent = init.templateContent ?? null;
    this.message = init.message ?? null;
  }

  static deliveredToApp(response: Record<string, unknown>, templateContent: string): CreditNoteResult {
    const creditNoteCount =
      (Array.isArray(response.createdCreditNotes) ? response.createdCreditNotes.length : undefined) ??
      (typeof response.creditNoteCount === "number" ? response.creditNoteCount : 0);

    return new CreditNoteResult({
      success: true,
      customerFound: true,
      creditNoteCount,
      response,
      templateContent
    });
  }

  static customerNotFound(): CreditNoteResult {
    return new CreditNoteResult({
      success: false,
      customerFound: false,
      message: "Customer not found"
    });
  }

  isSuccess(): boolean {
    return this.success;
  }

  isCustomerNotFound(): boolean {
    return !this.customerFound;
  }

  getCreditNoteCount(): number {
    return this.creditNoteCount;
  }

  getMessage(): string | null {
    return this.message;
  }
}
