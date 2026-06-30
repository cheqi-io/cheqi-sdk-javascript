/** Delivery outcome of a processed receipt. Mirrors the Java SDK `DeliveryStatus`. */
export const DeliveryStatus = {
  DELIVERED_DIGITAL: "DELIVERED_DIGITAL",
  DELIVERED_EMAIL: "DELIVERED_EMAIL",
  DELIVERED_DOWNLOAD: "DELIVERED_DOWNLOAD",
  CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
  FAILED: "FAILED"
} as const;

export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

export interface ReceiptResultInit {
  success: boolean;
  deliveryStatus?: DeliveryStatus | null;
  deliveryMethod?: string | null;
  customerFound?: boolean;
  receiptCount?: number;
  response?: unknown;
  templateContent?: string | null;
  message?: string | null;
  customerEmail?: string | null;
  downloadUrl?: string | null;
}

export class ReceiptResult {
  readonly success: boolean;
  readonly deliveryStatus: DeliveryStatus | null;
  readonly deliveryMethod: string | null;
  readonly customerFound: boolean;
  readonly receiptCount: number;
  readonly response: unknown;
  readonly templateContent: string | null;
  readonly message: string | null;
  readonly customerEmail: string | null;
  readonly downloadUrl: string | null;

  constructor(init: ReceiptResultInit) {
    this.success = init.success;
    this.deliveryStatus = init.deliveryStatus ?? null;
    this.deliveryMethod = init.deliveryMethod ?? null;
    this.customerFound = init.customerFound ?? false;
    this.receiptCount = init.receiptCount ?? 0;
    this.response = init.response ?? null;
    this.templateContent = init.templateContent ?? null;
    this.message = init.message ?? null;
    this.customerEmail = init.customerEmail ?? null;
    this.downloadUrl = init.downloadUrl ?? null;
  }

  static deliveredToApp(response: Record<string, unknown>, templateContent: string): ReceiptResult {
    const receiptCount =
      (Array.isArray(response.createdReceipts) ? response.createdReceipts.length : undefined) ??
      (typeof response.receiptCount === "number" ? response.receiptCount : 0);

    return new ReceiptResult({
      success: true,
      deliveryStatus: DeliveryStatus.DELIVERED_DIGITAL,
      deliveryMethod: "APP",
      customerFound: true,
      receiptCount,
      response,
      templateContent,
      message: "Receipt delivered to customer's Cheqi app"
    });
  }

  /**
   * QR-code self-service download fallback: the receipt was created and Cheqi returned a public
   * download URL. The merchant terminal renders `downloadUrl` as a QR code for the customer.
   */
  static deliveredViaDownload(response: Record<string, unknown>, templateContent: string): ReceiptResult {
    const receiptCount =
      (Array.isArray(response.createdReceipts) ? response.createdReceipts.length : undefined) ??
      (typeof response.receiptCount === "number" ? response.receiptCount : 0);

    return new ReceiptResult({
      success: true,
      deliveryStatus: DeliveryStatus.DELIVERED_DOWNLOAD,
      deliveryMethod: "DOWNLOAD",
      customerFound: true,
      receiptCount,
      response,
      templateContent,
      downloadUrl: typeof response.downloadUrl === "string" ? response.downloadUrl : null,
      message: "Receipt available for self-service download"
    });
  }

  static deliveredViaEmail(customerEmail: string): ReceiptResult {
    return new ReceiptResult({
      success: true,
      deliveryStatus: DeliveryStatus.DELIVERED_EMAIL,
      deliveryMethod: "EMAIL",
      customerFound: false,
      customerEmail,
      message: `Receipt sent via email to ${customerEmail}`
    });
  }

  static customerNotFound(): ReceiptResult {
    return new ReceiptResult({
      success: false,
      deliveryStatus: DeliveryStatus.CUSTOMER_NOT_FOUND,
      customerFound: false,
      message: "Customer not found with provided payment details"
    });
  }

  static failed(message: string): ReceiptResult {
    return new ReceiptResult({
      success: false,
      deliveryStatus: DeliveryStatus.FAILED,
      customerFound: false,
      message
    });
  }

  isSuccess(): boolean {
    return this.success;
  }

  isCustomerNotFound(): boolean {
    return this.deliveryStatus === DeliveryStatus.CUSTOMER_NOT_FOUND;
  }

  getDeliveryStatus(): DeliveryStatus | null {
    return this.deliveryStatus;
  }

  getReceiptCount(): number {
    return this.receiptCount;
  }

  getEmailAddress(): string | null {
    return this.customerEmail;
  }

  getDownloadUrl(): string | null {
    return this.downloadUrl;
  }

  getMessage(): string | null {
    return this.message;
  }
}

export interface CreditNoteResultInit {
  success: boolean;
  deliveryStatus?: DeliveryStatus | null;
  customerFound?: boolean;
  creditNoteCount?: number;
  response?: unknown;
  templateContent?: string | null;
  message?: string | null;
  emailAddress?: string | null;
}

export class CreditNoteResult {
  readonly success: boolean;
  readonly deliveryStatus: DeliveryStatus | null;
  readonly customerFound: boolean;
  readonly creditNoteCount: number;
  readonly response: unknown;
  readonly templateContent: string | null;
  readonly message: string | null;
  readonly emailAddress: string | null;

  constructor(init: CreditNoteResultInit) {
    this.success = init.success;
    this.deliveryStatus = init.deliveryStatus ?? null;
    this.customerFound = init.customerFound ?? false;
    this.creditNoteCount = init.creditNoteCount ?? 0;
    this.response = init.response ?? null;
    this.templateContent = init.templateContent ?? null;
    this.message = init.message ?? null;
    this.emailAddress = init.emailAddress ?? null;
  }

  static deliveredToApp(response: Record<string, unknown>, templateContent: string): CreditNoteResult {
    const creditNoteCount =
      (Array.isArray(response.createdCreditNotes) ? response.createdCreditNotes.length : undefined) ??
      (typeof response.creditNoteCount === "number" ? response.creditNoteCount : 0);

    return new CreditNoteResult({
      success: true,
      deliveryStatus: DeliveryStatus.DELIVERED_DIGITAL,
      customerFound: true,
      creditNoteCount,
      response,
      templateContent,
      message: "Credit note delivered to customer's Cheqi app"
    });
  }

  static deliveredViaEmail(emailAddress: string): CreditNoteResult {
    return new CreditNoteResult({
      success: true,
      deliveryStatus: DeliveryStatus.DELIVERED_EMAIL,
      customerFound: false,
      emailAddress,
      message: `Credit note sent via email to ${emailAddress}`
    });
  }

  static customerNotFound(): CreditNoteResult {
    return new CreditNoteResult({
      success: false,
      deliveryStatus: DeliveryStatus.CUSTOMER_NOT_FOUND,
      customerFound: false,
      message: "Customer not found with provided payment details"
    });
  }

  static failed(message: string): CreditNoteResult {
    return new CreditNoteResult({
      success: false,
      deliveryStatus: DeliveryStatus.FAILED,
      customerFound: false,
      message
    });
  }

  isSuccess(): boolean {
    return this.success;
  }

  isCustomerNotFound(): boolean {
    return this.deliveryStatus === DeliveryStatus.CUSTOMER_NOT_FOUND;
  }

  getDeliveryStatus(): DeliveryStatus | null {
    return this.deliveryStatus;
  }

  getCreditNoteCount(): number {
    return this.creditNoteCount;
  }

  getEmailAddress(): string | null {
    return this.emailAddress;
  }

  getMessage(): string | null {
    return this.message;
  }
}
