import { CheqiSDKError, CreditNoteProcessingError, ErrorCodes } from "../errors.js";
import { CreditNoteResult } from "../models.js";
import type {
  CheqiApiClient,
  CreditNoteTemplateGenerationRequest,
  CreditNoteTemplateRequest,
  CreditNoteTemplateResponse,
  EncryptedCreditNote,
  EncryptedCreditNoteInitiationRequest,
  IdentificationDetails,
  MatchedRecipient,
  ReceiptFormat,
  RecipientResolutionResponse
} from "../types.js";
import { serializeJson, sha256Hex } from "../utils.js";
import { DecryptionService } from "./decryption.js";
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

export class CreditNoteService {
  constructor(
    private readonly apiClient: Pick<
      CheqiApiClient,
      "generateCreditNoteTemplate" | "sendEncryptedCreditNotes"
    >,
    private readonly encryptionService: EncryptionService,
    private readonly matchingService: MatchingService,
    private readonly decryptionService: DecryptionService | null = null
  ) {}

  async processCompleteCreditNote(
    identificationDetails: IdentificationDetails,
    creditNoteTemplateRequest: CreditNoteTemplateRequest,
    accessToken: string | null = null
  ): Promise<CreditNoteResult> {
    if (!identificationDetails) {
      throw new CheqiSDKError("Identification details cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    if (!creditNoteTemplateRequest) {
      throw new CheqiSDKError("Credit note template request cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }

    const originalReceiptId = identificationDetails.cheqiReceiptId;
    if (!originalReceiptId) {
      throw new CheqiSDKError("Original receipt ID (cheqiReceiptId) is required for credit note processing", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }

    try {
      const matchResponse = await this.matchingService.matchCustomer(identificationDetails, accessToken);
      if (!matchResponse.customerFound) {
        return CreditNoteResult.customerNotFound();
      }

      const templateResponse = await this.generateCreditNoteTemplate(
        {
          creditNoteTemplateRequest,
          formats: uniqueFormats(matchResponse.recipients),
          buyerCountryCode: matchResponse.buyerCountryCode ?? "",
          buyerType: matchResponse.buyerType ?? ("CONSUMER" as any),
          taxesApplied: true
        },
        accessToken
      );

      const encryptedCreditNotes = this.buildEncryptedCreditNotes(matchResponse, templateResponse);
      const templateContent = templateResponse.cheqi
        ? serializeJson(templateResponse.cheqi)
        : (templateResponse.ublPurchaseReceipt ?? "");
      const templateHash = sha256Hex(templateContent);
      const createdResponse = await this.sendEncryptedCreditNotes(
        originalReceiptId,
        encryptedCreditNotes,
        templateHash,
        matchResponse,
        accessToken
      );

      return CreditNoteResult.deliveredToApp(createdResponse, templateContent);
    } catch (error) {
      if (error instanceof CheqiSDKError) {
        throw error;
      }
      throw new CreditNoteProcessingError(`Credit note processing failed: ${String((error as Error).message)}`, {
        cause: error
      });
    }
  }

  generateCreditNoteTemplate(
    request: CreditNoteTemplateGenerationRequest,
    accessToken: string | null = null
  ): Promise<CreditNoteTemplateResponse> {
    if (!request) {
      throw new CheqiSDKError("Credit note template request cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    return this.apiClient.generateCreditNoteTemplate(request, accessToken);
  }

  createEncryptedCreditNote(creditNoteEnvelope: string, recipient: MatchedRecipient): EncryptedCreditNote {
    if (!creditNoteEnvelope.trim()) {
      throw new CheqiSDKError("Purchase receipt cannot be null or empty", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    return {
      ...this.encryptionService.encryptCreditNoteForRecipient(creditNoteEnvelope, recipient),
      receiptFormats: recipient.acceptedFormats
    } as EncryptedCreditNote;
  }

  sendEncryptedCreditNotes(
    parentCheqiReceiptId: string,
    encryptedCreditNotes: EncryptedCreditNote[],
    templateHash: string,
    matchResponse: RecipientResolutionResponse,
    accessToken: string | null = null
  ): Promise<Record<string, unknown>> {
    if (encryptedCreditNotes.length === 0) {
      throw new CheqiSDKError("Encrypted credit notes cannot be null or empty", {
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
      throw new CheqiSDKError("Cannot send credit notes: customer was not found during matching", {
        errorCode: ErrorCodes.CUSTOMER_NOT_FOUND,
        httpStatusCode: 400
      });
    }

    return this.apiClient.sendEncryptedCreditNotes(
      matchResponse.matchId,
      parentCheqiReceiptId,
      encryptedCreditNotes,
      templateHash,
      accessToken
    );
  }

  decryptCreditNoteRequest(
    encryptedCreditNote: EncryptedCreditNoteInitiationRequest,
    privateKeyBase64: string
  ): { content: string } {
    if (!this.decryptionService) {
      throw new CheqiSDKError("Decryption service is not configured", {
        errorCode: ErrorCodes.DECRYPTION_ERROR
      });
    }
    return this.decryptionService.decryptCreditNote(encryptedCreditNote, privateKeyBase64);
  }

  private buildEncryptedCreditNotes(
    matchResponse: RecipientResolutionResponse,
    templateResponse: CreditNoteTemplateResponse
  ): EncryptedCreditNote[] {
    const encryptedCreditNotes: EncryptedCreditNote[] = [];

    for (const recipient of matchResponse.recipients ?? []) {
      const acceptedFormats = recipient.acceptedFormats ?? [];
      const envelope: Record<string, unknown> = {};

      if (acceptedFormats.includes("CHEQI" as any) && templateResponse.cheqi) {
        envelope.cheqiCreditNote = templateResponse.cheqi;
      }
      if (acceptedFormats.includes("UBL_CREDIT_NOTE" as any) && templateResponse.ubl) {
        envelope.ublPurchaseReceipt = templateResponse.ubl;
      }

      encryptedCreditNotes.push(this.createEncryptedCreditNote(serializeJson(envelope), recipient));
    }

    return encryptedCreditNotes;
  }
}
