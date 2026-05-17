import { CheqiSDKError, ErrorCodes, ReceiptProcessingError } from "../errors.js";
import { ReceiptResult } from "../models.js";
import type {
  CheqiApiClient,
  EncryptedReceiptRequest,
  IdentificationDetails,
  MatchedRecipient,
  NotificationDisplayCode,
  ReceiptEnvelope,
  ReceiptFormat,
  ReceiptTemplateGenerationRequest,
  ReceiptTemplateRequest,
  ReceiptTemplateResponse,
  RecipientResolutionResponse
} from "../types.js";
import { isValidEmail, serializeJson, sha256Hex } from "../utils.js";
import { EncryptionService } from "./encryption.js";
import { MatchingService } from "./matching.js";

type ReceiptTemplateRequestWithVatContext = ReceiptTemplateRequest & {
  buyerCountryCode?: string;
  buyerType?: ReceiptTemplateGenerationRequest["buyerType"];
  taxesApplied?: boolean;
};

function uniqueFormats(recipients: MatchedRecipient[] = []): ReceiptFormat[] {
  const seen = new Set<ReceiptFormat>();
  const formats: ReceiptFormat[] = [];

  for (const recipient of recipients) {
    for (const format of recipient.acceptedFormats ?? []) {
      if (!seen.has(format)) {
        seen.add(format);
        formats.push(format);
      }
    }
  }

  return formats;
}

function routeFound(matchResponse: RecipientResolutionResponse): boolean {
  return Boolean(matchResponse.routeFound ?? (matchResponse as { customerFound?: boolean }).customerFound);
}

function matchedRecipients(matchResponse: RecipientResolutionResponse): MatchedRecipient[] {
  return matchResponse.recipients ?? matchResponse.matchedRecipients ?? [];
}

export class ReceiptService {
  constructor(
    private readonly apiClient: Pick<
      CheqiApiClient,
      "generateReceiptTemplate" | "sendEncryptedReceipts" | "sendReceiptViaEmail"
    >,
    private readonly encryptionService: EncryptionService,
    private readonly matchingService: MatchingService
  ) {}

  async processCompleteReceipt(
    identificationDetails: IdentificationDetails,
    receiptRequest: ReceiptTemplateRequest,
    accessToken: string | null = null,
    notificationDisplayCode: NotificationDisplayCode | null = null
  ): Promise<ReceiptResult> {
    this.validateProcessInputs(identificationDetails, receiptRequest);

    try {
      const matchResponse = await this.matchingService.matchCustomer(identificationDetails, accessToken);
      const recipientEmail = identificationDetails.recipientEmail;

      if (!routeFound(matchResponse) && !recipientEmail) {
        return ReceiptResult.customerNotFound();
      }

      const templateGenerationRequest = {
        receiptTemplateRequest: enrichWithVatContext(receiptRequest, matchResponse),
        formats: uniqueFormats(matchedRecipients(matchResponse)),
        buyerCountryCode: getRequestBuyerCountryCode(receiptRequest) ?? matchResponse.buyerCountryCode,
        buyerType: getRequestBuyerType(receiptRequest) ?? matchResponse.buyerType,
        taxesApplied: resolveTaxesApplied(receiptRequest)
      } as unknown as ReceiptTemplateGenerationRequest;

      const templateResponse = await this.generateReceiptTemplate(templateGenerationRequest, accessToken);

      if (routeFound(matchResponse)) {
        const encryptedReceipts = this.buildEncryptedReceipts(
          matchResponse,
          templateResponse,
          notificationDisplayCode
        );
        const templateContent = templateResponse.cheqi
          ? serializeJson(templateResponse.cheqi)
          : (templateResponse.ublPurchaseReceipt ?? "");
        const templateHash = sha256Hex(templateContent);
        const createdResponse = await this.sendEncryptedReceipts(
          encryptedReceipts,
          templateHash,
          matchResponse,
          accessToken
        );
        return ReceiptResult.deliveredToApp(createdResponse, templateContent);
      }

      return this.sendReceiptViaEmail(recipientEmail ?? "", (templateResponse.cheqi ?? {}) as Record<string, unknown>, accessToken);
    } catch (error) {
      if (error instanceof CheqiSDKError) {
        throw error;
      }
      throw new ReceiptProcessingError(`Receipt processing failed: ${String((error as Error).message)}`, {
        cause: error
      });
    }
  }

  generateReceiptTemplate(
    request: ReceiptTemplateGenerationRequest,
    accessToken: string | null = null
  ): Promise<ReceiptTemplateResponse> {
    if (!request) {
      throw new CheqiSDKError("Receipt template request cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    return this.apiClient.generateReceiptTemplate(request, accessToken);
  }

  createEncryptedReceipts(
    purchaseReceipt: string,
    recipient: MatchedRecipient,
    notificationDisplayCode: NotificationDisplayCode | null = null
  ): EncryptedReceiptRequest {
    if (!purchaseReceipt.trim()) {
      throw new CheqiSDKError("Purchase receipt cannot be null or empty", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    if (!recipient) {
      throw new CheqiSDKError("Recipient cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }

    return {
      ...this.encryptionService.encryptReceiptForRecipient(purchaseReceipt, recipient),
      notificationDisplayCode: notificationDisplayCode ?? undefined
    };
  }

  sendEncryptedReceipts(
    encryptedReceipts: EncryptedReceiptRequest[],
    templateHash: string,
    matchResponse: RecipientResolutionResponse,
    accessToken: string | null = null
  ): Promise<Record<string, unknown>> {
    if (encryptedReceipts.length === 0) {
      throw new CheqiSDKError("Encrypted receipts cannot be null or empty", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    if (!templateHash.trim()) {
      throw new CheqiSDKError("Template hash cannot be null or empty", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    if (!routeFound(matchResponse) || !matchResponse.matchId) {
      throw new CheqiSDKError("Cannot send receipts: customer was not found during matching", {
        errorCode: ErrorCodes.CUSTOMER_NOT_FOUND,
        httpStatusCode: 400
      });
    }

    return this.apiClient.sendEncryptedReceipts(
      matchResponse.matchId,
      encryptedReceipts,
      templateHash,
      accessToken
    );
  }

  async sendReceiptViaEmail(
    customerEmail: string,
    cheqiReceipt: Record<string, unknown>,
    accessToken: string | null = null
  ): Promise<ReceiptResult> {
    if (!isValidEmail(customerEmail)) {
      throw new CheqiSDKError("Valid customer email is required", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    await this.apiClient.sendReceiptViaEmail(customerEmail, cheqiReceipt, accessToken);
    return ReceiptResult.deliveredViaEmail(customerEmail);
  }

  private buildEncryptedReceipts(
    matchResponse: RecipientResolutionResponse,
    templateResponse: ReceiptTemplateResponse,
    notificationDisplayCode: NotificationDisplayCode | null
  ): EncryptedReceiptRequest[] {
    const encryptedReceipts: EncryptedReceiptRequest[] = [];

    for (const recipient of matchedRecipients(matchResponse)) {
      const acceptedFormats = recipient.acceptedFormats ?? [];
      const envelope: ReceiptEnvelope = {};

      if (acceptedFormats.includes("CHEQI" as any) && templateResponse.cheqi) {
        envelope.cheqi = templateResponse.cheqi;
      }
      if (acceptedFormats.includes("UBL_PURCHASE_RECEIPT" as any) && templateResponse.ublPurchaseReceipt) {
        envelope.ublPurchaseReceipt = templateResponse.ublPurchaseReceipt;
      }
      if (acceptedFormats.includes("UBL_INVOICE" as any) && templateResponse.ublInvoice) {
        envelope.ublInvoice = templateResponse.ublInvoice;
      }
      if (templateResponse.vatMetadata) {
        envelope.vatMetaData = templateResponse.vatMetadata;
      }

      encryptedReceipts.push(
        this.createEncryptedReceipts(serializeJson(envelope), recipient, notificationDisplayCode)
      );
    }

    return encryptedReceipts;
  }

  private validateProcessInputs(
    identificationDetails: IdentificationDetails | null | undefined,
    receiptRequest: ReceiptTemplateRequest | null | undefined
  ): void {
    if (!identificationDetails) {
      throw new CheqiSDKError("Identification details cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    if (!receiptRequest) {
      throw new CheqiSDKError("Receipt template request cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
  }
}

function enrichWithVatContext(
  request: ReceiptTemplateRequest,
  matchResponse: RecipientResolutionResponse
): ReceiptTemplateRequestWithVatContext {
  return {
    ...request,
    buyerCountryCode: getRequestBuyerCountryCode(request) ?? matchResponse.buyerCountryCode,
    buyerType: getRequestBuyerType(request) ?? matchResponse.buyerType,
    taxesApplied: resolveTaxesApplied(request)
  };
}

function resolveTaxesApplied(request: ReceiptTemplateRequest): boolean {
  const enriched = request as ReceiptTemplateRequestWithVatContext;
  if (enriched.taxesApplied !== undefined && enriched.taxesApplied !== null) {
    return enriched.taxesApplied;
  }
  if (typeof request.totalTaxAmount === "number" && request.totalTaxAmount > 0) {
    return true;
  }
  return Array.isArray(request.taxes) && request.taxes.length > 0;
}

function getRequestBuyerCountryCode(request: ReceiptTemplateRequest): string | undefined {
  return (request as ReceiptTemplateRequestWithVatContext).buyerCountryCode;
}

function getRequestBuyerType(request: ReceiptTemplateRequest): ReceiptTemplateGenerationRequest["buyerType"] | undefined {
  return (request as ReceiptTemplateRequestWithVatContext).buyerType;
}
