import { CheqiSDKError, ErrorCodes, ReceiptProcessingError } from "../errors.js";
import { ReceiptResult } from "../models.js";
import type {
  CheqiApiClient,
  EncryptedReceiptRequest,
  IdentificationDetails,
  MatchedRecipient,
  NotificationDisplayCode,
  ReceiptFormat,
  ReceiptTemplateGenerationRequest,
  ReceiptTemplateRequest,
  ReceiptTemplateResponse,
  RecipientResolutionResponse
} from "../types.js";
import { isValidEmail, serializeJson, sha256Hex } from "../utils.js";
import { EncryptionService } from "./encryption.js";
import { MatchingService } from "./matching.js";

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

      if (!matchResponse.customerFound && !recipientEmail) {
        return ReceiptResult.customerNotFound();
      }

      const templateResponse = await this.generateReceiptTemplate(
        {
          receiptTemplateRequest: receiptRequest,
          formats: uniqueFormats(matchResponse.recipients),
          buyerCountryCode: matchResponse.buyerCountryCode ?? "",
          buyerType: matchResponse.buyerType ?? ("CONSUMER" as any),
          taxesApplied: true
        },
        accessToken
      );

      if (matchResponse.customerFound) {
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
    if (!matchResponse.customerFound || !matchResponse.matchId) {
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

    for (const recipient of matchResponse.recipients ?? []) {
      const acceptedFormats = recipient.acceptedFormats ?? [];
      const envelope: Record<string, unknown> = {};

      if (acceptedFormats.includes("CHEQI" as any) && templateResponse.cheqi) {
        envelope.cheqiReceipt = templateResponse.cheqi;
      }
      if (acceptedFormats.includes("UBL_PURCHASE_RECEIPT" as any) && templateResponse.ublPurchaseReceipt) {
        envelope.ublPurchaseReceipt = templateResponse.ublPurchaseReceipt;
      }
      if (templateResponse.vatMetadata) {
        envelope.vatMetadata = templateResponse.vatMetadata;
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
