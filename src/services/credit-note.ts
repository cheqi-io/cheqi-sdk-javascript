import type { CryptoProvider } from "../runtime-crypto.js";
import { randomUuid } from "../runtime-crypto.js";
import { generateDownloadLink, encryptDownloadEnvelope } from "../download/index.js";
import { documentReferenceHash } from "./document-reference.js";

import type { PreparedCreditNote } from "../models/generated/PreparedCreditNote.js";

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
    private readonly apiClient: Pick<CheqiApiClient, "submitEncryptedCreditNote"> & Partial<Pick<CheqiApiClient, "resolveCreditNoteReference" | "uploadEncryptedDownloadReceipt">>,
    private readonly encryptionService: EncryptionService,
    private readonly matchingService: MatchingService,
    private readonly crypto?: CryptoProvider
  ) {
    if (!apiClient) throw new TypeError("apiClient cannot be null");
    if (!encryptionService) throw new TypeError("encryptionService cannot be null");
    if (!matchingService) throw new TypeError("matchingService cannot be null");
  }

  async prepareCreditNote(payload: unknown, options?: ReceiptIssueOptions | null): Promise<PreparedCreditNote> {
    const node = typeof payload === "string" ? JSON.parse(payload) : JSON.parse(serializeJson(payload));
    const body = node?.creditNoteTemplateRequest ?? node;
    if (!body || typeof body.originatorDocumentReference !== "string" || !body.originatorDocumentReference.trim())
      throw validationError("originatorDocumentReference must contain the original documentNumber");
    const { storeId, ...requestOptions } = validateRequestOptions(options) as ReceiptIssueOptions;
    if (!this.apiClient.resolveCreditNoteReference) throw validationError("API client does not support document-reference resolution");
    try {
      const original = await this.apiClient.resolveCreditNoteReference({
        documentReferenceHash: await documentReferenceHash(body.originatorDocumentReference, this.crypto)
      }, requestOptions);
      requireText(original?.parentCheqiReceiptId, "resolved parentCheqiReceiptId");
      const parent = original.parentCheqiReceiptId;
      if (original.deliveryRoute === "DIGITAL") {
        if (typeof node.taxesApplied !== "boolean") throw validationError("taxesApplied must be a boolean for device generation");
        const match = await this.matchingService.matchCustomer({ cheqiReceiptId: parent }, requestOptions);
        validateDeviceRoute(match);
        if (match.deliveryRouteType !== "DIGITAL") throw validationError("Original owner-device route is unavailable");
        const generation = node.creditNoteTemplateRequest ? node : { taxesApplied: node.taxesApplied, creditNoteTemplateRequest: body };
        return { parentCheqiReceiptId: parent, deviceSubmission: { parentCheqiReceiptId: parent,
          matchId: match.matchId!, storeId: storeId ?? original.storeId ?? undefined,
          deviceDeliveries: await this.encryptForDevices(serializeJson(generation), match.recipients!) } };
      }
      if (original.deliveryRoute !== "DOWNLOAD") throw validationError("Unsupported original document route");
      if (storeId) throw validationError("Download delivery does not support store-scoped issuance");
      requireText(original.creditNotePublicKey, "creditNotePublicKey");
      const child = generateDownloadLink("https://receipt.cheqi.io", this.crypto);
      const link = await this.encryptionService.encryptForDevice(serializeJson({ version: 2,
        parentCheqiReceiptId: parent, downloadId: child.downloadId, contentKey: child.contentKey }),
        { id: parent, publicKey: original.creditNotePublicKey });
      const ciphertext = await encryptDownloadEnvelope({ envelopeVersion: 2, cheqiReceiptId: child.downloadId,
        receiptUuid: randomUuid(this.crypto), receiptGeneratorVersion: "credit-note-payload-v1",
        documents: { CREDIT_NOTE_PAYLOAD: { mediaType: "application/json", content: serializeJson(body) } }
      }, child.contentKey, this.crypto);
      return { parentCheqiReceiptId: parent, downloadSubmission: { downloadId: child.downloadId, ciphertext,
        parentCheqiReceiptId: parent, encryptedParentLink: link.encryptedContent, encryptedParentLinkKey: link.encryptedAesKey } };
    } catch (error) {
      if (error instanceof CheqiApiError) throw wrapApiError("Credit-note reference preparation failed", error);
      throw error;
    }
  }

  async submitPreparedCreditNote(prepared: PreparedCreditNote, options?: RequestOptions | null): Promise<CreditNoteResult> {
    validateRequestOptions(options);
    if (!prepared || Boolean(prepared.deviceSubmission) === Boolean(prepared.downloadSubmission))
      throw validationError("Exactly one prepared submission is required");
    const submission = prepared.deviceSubmission ?? prepared.downloadSubmission!;
    if (!prepared.parentCheqiReceiptId || submission.parentCheqiReceiptId !== prepared.parentCheqiReceiptId)
      throw validationError("Credit-note parent mismatch");
    try {
      if (prepared.deviceSubmission) {
        const response = await this.apiClient.submitEncryptedCreditNote(prepared.deviceSubmission, options);
        if (!response?.cheqiReceiptId || response.matchId !== prepared.deviceSubmission.matchId)
          throw validationError("Credit-note acceptance is not confirmed");
        return CreditNoteResult.accepted(prepared.parentCheqiReceiptId, response);
      }
      if (!this.apiClient.uploadEncryptedDownloadReceipt) throw validationError("API client does not support downloads");
      const response = await this.apiClient.uploadEncryptedDownloadReceipt(prepared.downloadSubmission!, options);
      if (!response?.cheqiReceiptId) throw validationError("Credit-note acceptance is not confirmed");
      return CreditNoteResult.accepted(prepared.parentCheqiReceiptId, { ...response, status: "COMPLETED" });
    } catch (error) {
      if (error instanceof CheqiApiError) throw wrapApiError("Credit-note submission failed; retain the prepared submission", error);
      throw error;
    }
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
