import { CheqiSDKError, ErrorCodes, ReceiptProcessingError } from "../errors.js";
import { ReceiptResult } from "../models.js";
import type {
  CheqiApiClient,
  EncryptedReceiptRequestDto,
  IdentificationDetails,
  NotificationDisplayCode,
  ReceiptFormat,
  Recipient,
  RecipientResolutionResponse,
  ReceiptTemplateRequest,
  ReceiptTemplateResponse
} from "../types.js";
import { serializeJson, sha256Hex } from "../utils.js";
import { EncryptionService } from "./encryption.js";
import { MatchingService } from "./matching.js";

function uniqueFormats(recipients: Recipient[] = []): ReceiptFormat[] {
  const seen = new Set<ReceiptFormat>();
  const formats: ReceiptFormat[] = [];

  for (const recipient of recipients) {
    for (const format of recipient.acceptedFormats ?? recipient.accepted_formats ?? []) {
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
      const recipientEmail = identificationDetails.recipientEmail ?? identificationDetails.recipient_email;

      if (!matchResponse.customerFound && !recipientEmail) {
        return ReceiptResult.customerNotFound();
      }

      const templateResponse = await this.generateReceiptTemplate(
        {
          ...receiptRequest,
          buyerCountryCode: receiptRequest.buyerCountryCode ?? matchResponse.buyerCountryCode,
          recipientEntityType: receiptRequest.recipientEntityType ?? matchResponse.recipientEntityType
        },
        uniqueFormats(matchResponse.recipients),
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
          : (templateResponse.ubl ?? "");
        const templateHash = sha256Hex(templateContent);
        const createdResponse = await this.sendEncryptedReceipts(
          encryptedReceipts,
          templateHash,
          matchResponse,
          accessToken
        );
        return ReceiptResult.deliveredToApp(createdResponse, templateContent);
      }

      return this.sendReceiptViaEmail(recipientEmail ?? "", templateResponse.cheqi ?? {}, accessToken);
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
    request: ReceiptTemplateRequest,
    receiptFormats: ReceiptFormat[] = [],
    accessToken: string | null = null
  ): Promise<ReceiptTemplateResponse> {
    if (!request) {
      throw new CheqiSDKError("Receipt template request cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    return this.apiClient.generateReceiptTemplate(request, receiptFormats, accessToken);
  }

  createEncryptedReceipts(
    purchaseReceipt: string,
    recipient: Recipient,
    notificationDisplayCode: NotificationDisplayCode | null = null
  ): EncryptedReceiptRequestDto {
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
      receiptFormats: recipient.acceptedFormats ?? recipient.accepted_formats,
      notificationDisplayCode: notificationDisplayCode ?? undefined
    };
  }

  sendEncryptedReceipts(
    encryptedReceipts: EncryptedReceiptRequestDto[],
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
    if (!customerEmail.includes("@")) {
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
  ): EncryptedReceiptRequestDto[] {
    const encryptedReceipts: EncryptedReceiptRequestDto[] = [];

    for (const recipient of matchResponse.recipients ?? []) {
      const acceptedFormats = recipient.acceptedFormats ?? recipient.accepted_formats ?? [];
      const envelope: Record<string, unknown> = {};

      if (acceptedFormats.includes("CHEQI") && templateResponse.cheqi) {
        envelope.cheqiReceipt = templateResponse.cheqi;
      }
      if (acceptedFormats.includes("UBL_XML") && templateResponse.ubl) {
        envelope.ublXml = templateResponse.ubl;
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
