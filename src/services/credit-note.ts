import { encryptDownloadEnvelope, generateDownloadLink } from "../download/index.js";
import { randomUuid, type CryptoProvider } from "../runtime-crypto.js";
import type { PreparedReceiptDownload } from "../models.js";
import { CheqiApiError, CheqiSDKError, ErrorCodes } from "../errors.js";
import { CreditNoteResult } from "../models.js";
import type {
  CheqiApiClient,
  ReceiptIssueOptions,
  EncryptedCreditNoteEnvelope,
  EncryptedReceiptPayload,
  IdentificationDetails,
  MatchedRecipient,
  ReceiptSubmissionResponse,
  RecipientResolutionResponse,
  RequestOptions
} from "../types.js";
import { validateRequestOptions } from "../http/request-options.js";
import { serializeJson } from "../utils.js";
import { EncryptionService } from "./encryption.js";
import { MatchingService } from "./matching.js";

/** Issues definitive credit-note values through the encrypted credit-note endpoint. */
export class CreditNoteService {
  constructor(
    private readonly apiClient: Pick<CheqiApiClient, "submitEncryptedCreditNote">,
    private readonly encryptionService: EncryptionService,
    private readonly matchingService: MatchingService,
    private readonly crypto?: CryptoProvider
  ) {
    if (!apiClient) throw new TypeError("apiClient cannot be null");
    if (!encryptionService) throw new TypeError("encryptionService cannot be null");
    if (!matchingService) throw new TypeError("matchingService cannot be null");
  }

  /** Prepare a normal receipt link; the receiving wallet links the encrypted document reference locally. */
  async prepareDownload(payload: unknown, baseUrl = "https://receipt.cheqi.io"): Promise<PreparedReceiptDownload> {
    const node = typeof payload === "string" ? JSON.parse(payload) : JSON.parse(serializeJson(payload));
    const body = node?.creditNoteTemplateRequest ?? node;
    if (!body || typeof body.documentNumber !== "string" || typeof body.originatorDocumentReference !== "string")
      throw validationError("documentNumber and originatorDocumentReference are required");
    requireText(body.documentNumber, "documentNumber");
    requireText(body.originatorDocumentReference, "originatorDocumentReference");
    if (typeof node.taxesApplied !== "boolean") throw validationError("taxesApplied must be a boolean");
    const link = generateDownloadLink(baseUrl, this.crypto);
    const ciphertext = await encryptDownloadEnvelope({ envelopeVersion: 2, cheqiReceiptId: link.downloadId,
      receiptUuid: randomUuid(this.crypto), receiptGeneratorVersion: "credit-note-payload-v1",
      documents: { CREDIT_NOTE_PAYLOAD: { mediaType: "application/json",
        content: serializeJson({ ...body, taxesApplied: node.taxesApplied }) } }
    }, link.contentKey, this.crypto);
    return { downloadUrl: link.url, uploadRequest: { downloadId: link.downloadId, ciphertext } };
  }

  /** Serializes and encrypts the supplied definitive credit-note payload without calculations. */
  async issueCreditNote(
    identificationDetails: IdentificationDetails,
    parentCheqiReceiptId: string,
    creditNotePayload: unknown,
    options?: ReceiptIssueOptions | null
  ): Promise<CreditNoteResult> {
    requireNonNull(identificationDetails, "identificationDetails");
    requireText(parentCheqiReceiptId, "parentCheqiReceiptId");
    requireNonNull(creditNotePayload, "creditNotePayload");
    const { storeId = null, ...requestOptions } = validateRequestOptions(options) as ReceiptIssueOptions;

    try {
      const resolution = await this.matchingService.matchCustomer(identificationDetails, requestOptions);
      validateDeviceRoute(resolution);
      const plaintextJson = typeof creditNotePayload === "string"
        ? creditNotePayload
        : serializeJson(creditNotePayload);
      const envelope: EncryptedCreditNoteEnvelope = {
        matchId: resolution.matchId!,
        parentCheqiReceiptId,
        storeId: storeId ?? undefined,
        deviceDeliveries: await this.encryptForDevices(plaintextJson, resolution.recipients!)
      };
      const response = await this.apiClient.submitEncryptedCreditNote(envelope, requestOptions);
      return CreditNoteResult.accepted(parentCheqiReceiptId, response);
    } catch (error) {
      if (error instanceof CheqiApiError) throw wrapApiError("Credit-note submission failed", error);
      if (error instanceof CheqiSDKError) throw error;
      throw new CheqiSDKError(`Credit-note processing failed: ${errorMessage(error)}`, {
        cause: error
      });
    }
  }

  async submitEncryptedCreditNote(
    envelope: EncryptedCreditNoteEnvelope,
    options?: RequestOptions | null
  ): Promise<ReceiptSubmissionResponse> {
    requireNonNull(envelope, "envelope");
    validateRequestOptions(options);
    try {
      return await this.apiClient.submitEncryptedCreditNote(envelope, options);
    } catch (error) {
      if (error instanceof CheqiApiError) {
        throw wrapApiError("Encrypted credit-note submission failed", error);
      }
      if (error instanceof CheqiSDKError) throw error;
      throw new CheqiSDKError(`Encrypted credit-note submission failed: ${errorMessage(error)}`, {
        cause: error
      });
    }
  }

  private async encryptForDevices(
    plaintextJson: string,
    recipients: MatchedRecipient[]
  ): Promise<EncryptedReceiptPayload[]> {
    return Promise.all(recipients.map((recipient) =>
      this.encryptionService.encryptCreditNoteForRecipient(plaintextJson, recipient)
    ));
  }
}

function validateDeviceRoute(resolution: RecipientResolutionResponse): void {
  if (!resolution?.routeFound) {
    throw new CheqiSDKError("No Cheqi owner-device route was found", {
      errorCode: ErrorCodes.CUSTOMER_NOT_FOUND,
      httpStatusCode: 404
    });
  }
  requireText(resolution.matchId, "matchId");
  if (!resolution.recipients?.length) {
    throw validationError("Recipient resolution did not include owner devices");
  }
}

function requireNonNull<T>(value: T | null | undefined, name: string): asserts value is T {
  if (value == null) throw validationError(`${name} cannot be null`);
}

function requireText(value: string | undefined, name: string): asserts value is string {
  if (!value?.trim()) throw validationError(`${name} cannot be null or empty`);
}

function validationError(message: string): CheqiSDKError {
  return new CheqiSDKError(message, {
    errorCode: ErrorCodes.VALIDATION_ERROR,
    httpStatusCode: 400
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function wrapApiError(prefix: string, error: CheqiApiError): CheqiSDKError {
  return new CheqiSDKError(`${prefix}: ${error.message}`, {
    cause: error,
    errorCode: error.errorCode,
    httpStatusCode: error.httpStatusCode,
    correlationId: error.correlationId
  });
}
