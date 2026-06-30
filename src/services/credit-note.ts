import { CheqiSDKError, CreditNoteProcessingError, DecryptionError, ErrorCodes } from "../errors.js";
import { CreditNoteResult } from "../models.js";
import type {
  CheqiApiClient,
  CreditNoteContextEnvelope,
  CreditNoteEnvelope,
  CreditNoteInitiationRequest,
  CreditNoteTemplateGenerationRequest,
  CreditNoteTemplateRequest,
  CreditNoteTemplateResponse,
  DecryptedDeliveredCreditNote,
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

const CUSTOMER_PARTY_PLACEHOLDER = "<cac:AccountingCustomerParty/>";
const CUSTOMER_PARTY_CLOSING_TAG = "</cac:AccountingCustomerParty>";

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
  return matchResponse.recipients ?? [];
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
      const recipientEmail = identificationDetails.recipientEmail;

      if (!routeFound(matchResponse) && !recipientEmail) {
        return CreditNoteResult.customerNotFound();
      }

      const templateResponse = await this.generateCreditNoteTemplate(
        {
          creditNoteTemplateRequest,
          formats: uniqueFormats(matchedRecipients(matchResponse)),
          buyerCountryCode: matchResponse.buyerCountryCode ?? "",
          buyerType: matchResponse.buyerType ?? ("CONSUMER" as any),
          taxesApplied: true
        },
        accessToken
      );

      if (!routeFound(matchResponse)) {
        return CreditNoteResult.customerNotFound();
      }

      const encryptedCreditNotes = this.buildEncryptedCreditNotes(matchResponse, templateResponse);
      const templateContent = templateResponse.cheqi
        ? serializeJson(templateResponse.cheqi)
        : (templateResponse.ublCreditNote ?? "");
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
      throw new CheqiSDKError("Credit note envelope cannot be null or empty", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }
    return {
      ...this.encryptionService.encryptCreditNoteForRecipient(creditNoteEnvelope, recipient)
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
    if (!routeFound(matchResponse) || !matchResponse.matchId) {
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

  /**
   * Decrypt and parse a customer-initiated credit-note (return) request.
   * Mirrors the Java SDK, which deserializes the decrypted JSON into a
   * structured {@link CreditNoteInitiationRequest}.
   */
  decryptCreditNoteRequest(
    encryptedCreditNote: EncryptedCreditNoteInitiationRequest,
    privateKeyBase64: string
  ): CreditNoteInitiationRequest {
    if (!this.decryptionService) {
      throw new CheqiSDKError("Decryption service is not configured", {
        errorCode: ErrorCodes.DECRYPTION_ERROR
      });
    }
    const { content } = this.decryptionService.decryptCreditNote(encryptedCreditNote, privateKeyBase64);
    try {
      return JSON.parse(content) as CreditNoteInitiationRequest;
    } catch (error) {
      throw new DecryptionError("Failed to deserialize decrypted credit note request", { cause: error });
    }
  }

  decryptDeliveredCreditNote(
    encryptedCreditNote: EncryptedCreditNote,
    privateKeyBase64: string
  ): DecryptedDeliveredCreditNote {
    if (!this.decryptionService) {
      throw new CheqiSDKError("Decryption service is not configured", {
        errorCode: ErrorCodes.DECRYPTION_ERROR
      });
    }

    const decrypted = this.decryptionService.decryptDeliveredCreditNote(encryptedCreditNote, privateKeyBase64);
    return this.mergeCreditNoteContext(decrypted);
  }

  private buildEncryptedCreditNotes(
    matchResponse: RecipientResolutionResponse,
    templateResponse: CreditNoteTemplateResponse
  ): EncryptedCreditNote[] {
    const encryptedCreditNotes: EncryptedCreditNote[] = [];

    for (const recipient of matchedRecipients(matchResponse)) {
      const acceptedFormats = recipient.acceptedFormats ?? [];
      const envelope: Record<string, unknown> = {};

      if (acceptedFormats.includes("CHEQI" as any) && templateResponse.cheqi) {
        envelope.cheqiCreditNote = templateResponse.cheqi;
      }
      if (acceptedFormats.includes("UBL_CREDIT_NOTE" as any) && templateResponse.ublCreditNote) {
        envelope.ublCreditNote = templateResponse.ublCreditNote;
      }

      encryptedCreditNotes.push(this.createEncryptedCreditNote(serializeJson(envelope), recipient));
    }

    return encryptedCreditNotes;
  }

  private mergeCreditNoteContext(decrypted: DecryptedDeliveredCreditNote): DecryptedDeliveredCreditNote {
    const context = decrypted.creditNoteContextEnvelope;
    if (!context) {
      return decrypted;
    }

    const creditNoteEnvelope: CreditNoteEnvelope = {
      cheqiCreditNote: decrypted.creditNoteEnvelope.cheqiCreditNote,
      ublCreditNote: decrypted.creditNoteEnvelope.ublCreditNote
    };

    this.mergeXmlParty(creditNoteEnvelope, context);
    this.mergeXmlPaymentMeans(creditNoteEnvelope, context);
    this.mergeReceivingParty(creditNoteEnvelope, context);

    return {
      ...decrypted,
      creditNoteEnvelope
    };
  }

  private mergeXmlParty(creditNoteEnvelope: CreditNoteEnvelope, context: CreditNoteContextEnvelope): void {
    const xmlReceivingParty = context.receivingParty?.xmlReceivingParty;
    if (!xmlReceivingParty || !creditNoteEnvelope.ublCreditNote?.includes(CUSTOMER_PARTY_PLACEHOLDER)) {
      return;
    }

    creditNoteEnvelope.ublCreditNote = creditNoteEnvelope.ublCreditNote.replace(
      CUSTOMER_PARTY_PLACEHOLDER,
      xmlReceivingParty
    );
  }

  private mergeXmlPaymentMeans(creditNoteEnvelope: CreditNoteEnvelope, context: CreditNoteContextEnvelope): void {
    const xmlPaymentMeans = context.paymentMeans?.xmlPaymentMeans;
    const xml = creditNoteEnvelope.ublCreditNote;
    if (!xmlPaymentMeans || !xml) {
      return;
    }

    if (xml.includes(CUSTOMER_PARTY_CLOSING_TAG)) {
      creditNoteEnvelope.ublCreditNote = xml.replace(
        CUSTOMER_PARTY_CLOSING_TAG,
        CUSTOMER_PARTY_CLOSING_TAG + xmlPaymentMeans
      );
      return;
    }

    if (xml.includes(CUSTOMER_PARTY_PLACEHOLDER)) {
      creditNoteEnvelope.ublCreditNote = xml.replace(
        CUSTOMER_PARTY_PLACEHOLDER,
        CUSTOMER_PARTY_PLACEHOLDER + xmlPaymentMeans
      );
    }
  }

  private mergeReceivingParty(creditNoteEnvelope: CreditNoteEnvelope, context: CreditNoteContextEnvelope): void {
    const receivingParty = context.receivingParty?.receivingParty;
    if (!receivingParty || !creditNoteEnvelope.cheqiCreditNote) {
      return;
    }

    creditNoteEnvelope.cheqiCreditNote = {
      ...creditNoteEnvelope.cheqiCreditNote,
      receivingParty
    };
  }
}
