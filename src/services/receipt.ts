import { CheqiApiError, CheqiSDKError, ErrorCodes, SubmissionInProgressError } from "../errors.js";
import {
  encryptDownloadEnvelope,
  generateDownloadLink,
} from "../download/index.js";
import { ReceiptResult, type PreparedReceiptDownload } from "../models.js";
import type {
  CheqiApiClient,
  ReceiptIssueOptions,
  EncryptedReceiptEnvelope,
  EncryptedReceiptPayload,
  IdentificationDetails,
  MatchedRecipient,
  MatchStatusResponse,
  ClientReceiptDownloadResponse,
  ReceiptEnvelope,
  ReceiptPayload,
  ReceiptSubmissionResponse,
  RecipientResolutionResponse,
  RequestOptions
} from "../types.js";
import { validateRequestOptions } from "../http/request-options.js";
import type { RecipientResolutionResponseDeliveryRouteTypeEnum } from "../models/generated/RecipientResolutionResponse.js";
import { serializeJson } from "../utils.js";
import { canonicalizeJson } from "../rfc8785.js";
import { sha256Hex } from "../utils.js";
import { EncryptionService } from "./encryption.js";
import { MatchingService } from "./matching.js";
import { randomUuid, type CryptoProvider } from "../runtime-crypto.js";

const PAYLOAD_DOCUMENT_VERSION = "receipt-payload-v1";

/** Issues definitive receipt payloads through Cheqi's zero-knowledge device flow. */
export class ReceiptService {

  constructor(
    private readonly apiClient: Pick<
      CheqiApiClient,
      "getMatch" | "submitEncryptedReceipt" | "uploadEncryptedDownloadReceipt"
    >,
    private readonly encryptionService: EncryptionService,
    private readonly matchingService: MatchingService,
    private readonly receiptDownloadBaseUrl: string | null = "https://receipt.cheqi.io",
    private readonly crypto?: CryptoProvider
  ) {
    if (!apiClient) throw new TypeError("apiClient cannot be null");
    if (!encryptionService) throw new TypeError("encryptionService cannot be null");
    if (!matchingService) throw new TypeError("matchingService cannot be null");
  }

  /**
   * Resolves a route, then encrypts the exact supplied payload independently for
   * every matched owner device. Pass `{ storeId, accessToken }` to associate a store
   * or act on behalf of a connected company.
   */
  async issueReceipt(
    identificationDetails: IdentificationDetails,
    receiptPayload: ReceiptPayload,
    options?: ReceiptIssueOptions | null
  ): Promise<ReceiptResult> {
    requireNonNull(identificationDetails, "identificationDetails");
    validatePayload(receiptPayload);
    const { storeId = null, ...requestOptions } = validateRequestOptions(options) as ReceiptIssueOptions;

    try {
      let resolution: RecipientResolutionResponse;
      try {
        resolution = await this.matchingService.matchCustomer(identificationDetails, requestOptions);
      } catch (error) {
        if (!isRecoverable(error)) throw error;
        return ReceiptResult.downloadPrepared(await this.prepareDownload(receiptPayload));
      }
      validateResolvedRoute(resolution);
      const route = resolveRoute(resolution);

      if (route === "DOWNLOAD_FALLBACK") {
        if (!identificationDetails.paymentType) {
          return ReceiptResult.downloadEnvelopeRequiredResult(
            resolution.matchId!,
            resolution.expiresAt ?? null
          );
        }
        return this.deliverClientEncryptedDownload(
          resolution.matchId!,
          identificationDetails,
          receiptPayload,
          requestOptions
        );
      }
      if (route === "EMAIL_FALLBACK") {
        return ReceiptResult.emailReceiptRequiredResult(
          resolution.matchId!,
          resolution.expiresAt ?? null
        );
      }

      validateDeviceRecipients(resolution);
      try {
        return ReceiptResult.accepted(await this.submitPayload(
          resolution.matchId!, resolution.recipients!, receiptPayload, storeId, requestOptions
        ));
      } catch (error) {
        if (error instanceof CheqiApiError && error.httpStatusCode === 410) {
          return ReceiptResult.digitalExpired(resolution.matchId!);
        }
        if (!isAmbiguousSubmission(error)) throw error;
        return ReceiptResult.digitalPending(resolution.matchId!, await this.prepareDownload(receiptPayload),
          retryAfter(error));
      }
    } catch (error) {
      if (error instanceof CheqiApiError) throw wrapApiError("Receipt submission failed", error);
      if (error instanceof CheqiSDKError) throw error;
      throw new CheqiSDKError(`Receipt processing failed: ${errorMessage(error)}`, { cause: error });
    }
  }

  /** Retrieves the original device snapshot without matching again. */
  async getMatch(matchId: string, options?: RequestOptions | null): Promise<MatchStatusResponse> {
    validateMatchId(matchId);
    validateRequestOptions(options);
    try {
      return await this.apiClient.getMatch(matchId, options);
    } catch (error) {
      if (error instanceof CheqiApiError) throw wrapApiError("Match retrieval failed", error);
      throw error;
    }
  }

  /** Makes one recovery attempt. Retain the original prepared download and URL. */
  async resumeReceipt(matchId: string, receiptPayload: ReceiptPayload,
    options?: ReceiptIssueOptions | null): Promise<ReceiptResult> {
    validateMatchId(matchId);
    const { storeId = null, ...requestOptions } = validateRequestOptions(options) as ReceiptIssueOptions;
    validatePayload(receiptPayload);
    try {
      const match = await this.apiClient.getMatch(matchId, requestOptions);
      if (!match?.state || match.matchId !== matchId) throw validationError("Invalid match status response");
      switch (match.state) {
        case "SUBMITTED":
          if (!match.submission?.cheqiReceiptId?.trim() || match.submission.matchId !== matchId) {
            throw validationError("Match status did not include the original submission");
          }
          return ReceiptResult.accepted(match.submission);
        case "IN_PROGRESS":
          return ReceiptResult.digitalPending(matchId, null, match.retryAfterSeconds ?? null);
        case "EXPIRED":
          return ReceiptResult.digitalExpired(matchId);
        case "MATCHED":
          if (match.route !== "DIGITAL" || !match.recipients?.length) {
            throw validationError("Match does not contain a digital owner-device route");
          }
          return ReceiptResult.accepted(await this.submitPayload(matchId, match.recipients,
            receiptPayload, storeId, requestOptions));
        default:
          throw validationError("Unknown match state");
      }
    } catch (error) {
      if (error instanceof CheqiApiError && error.httpStatusCode === 410) return ReceiptResult.digitalExpired(matchId);
      if (isAmbiguousSubmission(error)) return ReceiptResult.digitalPending(matchId, null, retryAfter(error));
      if (error instanceof CheqiApiError) throw wrapApiError("Receipt recovery failed", error);
      if (error instanceof CheqiSDKError) throw error;
      throw new CheqiSDKError("Receipt recovery failed", { cause: error });
    }
  }

  /** Uploads a persisted generated request without changing its download id or ciphertext. */
  async uploadPreparedDownload(download: PreparedReceiptDownload,
    options?: RequestOptions | null): Promise<ClientReceiptDownloadResponse> {
    requireNonNull(download, "download");
    validateRequestOptions(options);
    try {
      return await this.apiClient.uploadEncryptedDownloadReceipt({ ...download.uploadRequest }, options);
    } catch (error) {
      if (error instanceof CheqiApiError) throw wrapApiError("Download upload failed", error);
      throw error;
    }
  }

  /** Encrypts locally for a resolved route or a retrieved MATCHED digital snapshot. */
  async generateEncryptedReceiptEnvelope(match: RecipientResolutionResponse | MatchStatusResponse,
    receiptPayload: ReceiptPayload, storeId: string | null = null): Promise<EncryptedReceiptEnvelope> {
    requireNonNull(match, "match");
    if ("state" in match) {
      if (match.state !== "MATCHED" || match.route !== "DIGITAL") {
        throw validationError("Match must be MATCHED with a digital owner-device route");
      }
    } else {
      validateResolvedRoute(match as RecipientResolutionResponse);
      if (resolveRoute(match as RecipientResolutionResponse) !== "DIGITAL") {
        throw validationError("Match does not contain a digital owner-device route");
      }
    }
    return this.generateEnvelope(match.matchId!, match.recipients!, receiptPayload, storeId);
  }

  private async generateEnvelope(matchId: string, recipients: MatchedRecipient[],
    payload: ReceiptPayload, storeId: string | null): Promise<EncryptedReceiptEnvelope> {
    validateMatchId(matchId);
    validatePayload(payload);
    if (!recipients?.length || recipients.some((recipient) => recipient == null)) {
      throw validationError("Match must contain owner devices");
    }
    return { matchId, storeId: storeId ?? undefined,
      deviceDeliveries: await this.encryptForDevices(serializeJson(payload), recipients) };
  }

  private async submitPayload(matchId: string, recipients: MatchedRecipient[], payload: ReceiptPayload,
    storeId: string | null, options: RequestOptions): Promise<ReceiptSubmissionResponse> {
    const response = await this.apiClient.submitEncryptedReceipt(
      await this.generateEnvelope(matchId, recipients, payload, storeId), options);
    if (!response?.cheqiReceiptId?.trim() || response.matchId !== matchId) {
      throw new CheqiApiError("Invalid receipt submission response", { errorCode: ErrorCodes.INVALID_RESPONSE });
    }
    return response;
  }

  /** Creates a client-encrypted download receipt without attempting matching. */
  async issueDownloadReceipt(
    identificationDetails: IdentificationDetails,
    receiptPayload: ReceiptPayload,
    options?: RequestOptions | null
  ): Promise<ReceiptResult> {
    requireNonNull(identificationDetails, "identificationDetails");
    validatePayload(receiptPayload);
    if (!identificationDetails.paymentType) {
      throw validationError("identificationDetails.paymentType is required");
    }
    const requestOptions = validateRequestOptions(options);
    try {
      return await this.deliverClientEncryptedDownload(
        null,
        identificationDetails,
        receiptPayload,
        requestOptions
      );
    } catch (error) {
      if (error instanceof CheqiApiError) {
        throw wrapApiError("Encrypted download receipt submission failed", error);
      }
      if (error instanceof CheqiSDKError) throw error;
      throw new CheqiSDKError(`Download receipt processing failed: ${errorMessage(error)}`, {
        cause: error
      });
    }
  }

  async submitEncryptedReceipt(
    envelope: EncryptedReceiptEnvelope,
    options?: RequestOptions | null
  ): Promise<ReceiptSubmissionResponse> {
    requireNonNull(envelope, "envelope");
    validateRequestOptions(options);
    try {
      return await this.apiClient.submitEncryptedReceipt(envelope, options);
    } catch (error) {
      if (error instanceof CheqiApiError) {
        throw wrapApiError("Encrypted receipt submission failed", error);
      }
      if (error instanceof CheqiSDKError) throw error;
      throw new CheqiSDKError(`Encrypted receipt submission failed: ${errorMessage(error)}`, {
        cause: error
      });
    }
  }

  /** Completes a fallback after the caller generated the final receipt envelope locally. */
  async completeDownloadFallback(
    fallbackResult: ReceiptResult,
    receiptEnvelope: ReceiptEnvelope,
    templateHash: string | null = null,
    options?: RequestOptions | null
  ): Promise<ReceiptResult> {
    requireNonNull(fallbackResult, "fallbackResult");
    requireNonNull(receiptEnvelope, "receiptEnvelope");
    if (
      !fallbackResult.isDownloadEnvelopeRequired() ||
      fallbackResult.getDeliveryRouteType() !== "DOWNLOAD_FALLBACK"
    ) {
      throw validationError("fallbackResult does not require a download receipt envelope");
    }
    validateRequestOptions(options);
    const baseUrl = requireDownloadBaseUrl(this.receiptDownloadBaseUrl);

    try {
      const link = generateDownloadLink(baseUrl, this.crypto);
      const ciphertext = await encryptDownloadEnvelope(receiptEnvelope, link.contentKey, this.crypto);
      const response = await this.apiClient.uploadEncryptedDownloadReceipt(
        {
          downloadId: link.downloadId,
          ciphertext,
          templateHash
        },
        options
      );
      return ReceiptResult.downloadAccepted(fallbackResult.getMatchId(), response, link.url);
    } catch (error) {
      if (error instanceof CheqiApiError) {
        throw wrapApiError("Encrypted download receipt submission failed", error);
      }
      if (error instanceof CheqiSDKError) throw error;
      throw new CheqiSDKError(`Download fallback processing failed: ${errorMessage(error)}`, {
        cause: error
      });
    }
  }

  private async encryptForDevices(
    plaintextJson: string,
    recipients: MatchedRecipient[]
  ): Promise<EncryptedReceiptPayload[]> {
    return Promise.all(recipients.map((recipient) =>
      this.encryptionService.encryptReceiptForRecipient(plaintextJson, recipient)
    ));
  }

  private async deliverClientEncryptedDownload(
    matchId: string | null,
    identificationDetails: IdentificationDetails,
    receiptPayload: ReceiptPayload,
    options: RequestOptions
  ): Promise<ReceiptResult> {
    const prepared = await this.prepareDownload(receiptPayload, identificationDetails);
    try {
      const response = await this.apiClient.uploadEncryptedDownloadReceipt({ ...prepared.uploadRequest }, options);
      return ReceiptResult.downloadAccepted(matchId, response, prepared.downloadUrl);
    } catch (error) {
      if (!isRecoverable(error)) throw error;
      return ReceiptResult.downloadPrepared(prepared);
    }
  }

  private async prepareDownload(receiptPayload: ReceiptPayload,
    identificationDetails?: IdentificationDetails): Promise<PreparedReceiptDownload> {
    const link = generateDownloadLink(requireDownloadBaseUrl(this.receiptDownloadBaseUrl), this.crypto);
    const payloadDocument = serializeJson(receiptPayload);
    const envelope: ReceiptEnvelope = {
      cheqiReceiptId: link.downloadId,
      envelopeVersion: 2,
      receiptGeneratorVersion: PAYLOAD_DOCUMENT_VERSION,
      receiptUuid: randomUuid(this.crypto),
      documents: {
        RECEIPT_PAYLOAD: { mediaType: "application/json", content: payloadDocument },
        ...(identificationDetails == null ? {} : {
          IDENTIFICATION_DETAILS: {
            mediaType: "application/json", content: serializeJson(identificationDetails)
          }
        })
      }
    };
    return {
      downloadUrl: link.url,
      uploadRequest: {
        downloadId: link.downloadId,
        ciphertext: await encryptDownloadEnvelope(envelope, link.contentKey, this.crypto),
        templateHash: await sha256Hex(canonicalizeJson(payloadDocument), this.crypto)
      }
    };
  }

  /** Builds legacy version 1 browser JSON; version 2 downloads carry the payload separately. */
  buildDownloadCheqiDocument(
    receiptPayload: ReceiptPayload,
    identificationDetails: IdentificationDetails
  ): string {
    return serializeJson({ ...receiptPayload, identificationDetails });
  }
}

function validateResolvedRoute(resolution: RecipientResolutionResponse): void {
  if (!resolution?.routeFound) {
    throw new CheqiSDKError("No Cheqi owner-device route was found", {
      errorCode: ErrorCodes.CUSTOMER_NOT_FOUND,
      httpStatusCode: 404
    });
  }
  if (!resolution.matchId?.trim()) {
    throw validationError("Recipient resolution did not include matchId");
  }
}

function resolveRoute(
  resolution: RecipientResolutionResponse
): RecipientResolutionResponseDeliveryRouteTypeEnum {
  if (resolution.deliveryRouteType) return resolution.deliveryRouteType;
  if (resolution.recipients?.length) return "DIGITAL";
  throw validationError("Recipient resolution did not include deliveryRouteType");
}

function validateDeviceRecipients(resolution: RecipientResolutionResponse): void {
  if (!resolution.recipients?.length) {
    throw validationError("Recipient resolution did not include owner devices");
  }
}

function requireDownloadBaseUrl(value: string | null): string {
  if (!value?.trim()) {
    throw validationError("A receipt download base URL is required to complete download fallback");
  }
  return value;
}

function requireNonNull<T>(value: T | null | undefined, name: string): asserts value is T {
  if (value == null) throw validationError(`${name} cannot be null`);
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

function validateMatchId(matchId: string): void {
  if (!matchId?.trim()) throw validationError("matchId is required");
}

function validatePayload(payload: ReceiptPayload): void {
  requireNonNull(payload, "receiptPayload");
  if (!payload.documentNumber?.trim() || !payload.currency?.trim() || payload.issueDate == null ||
      !payload.products?.length || payload.products.some((product) => product == null) ||
      payload.receiptSubtotal == null || payload.totalBeforeTax == null || payload.totalTaxAmount == null ||
      payload.totalAmount == null || payload.taxesApplied == null) {
    throw validationError("receiptPayload must contain the required receipt fields and products");
  }
}

function isRecoverable(error: unknown): error is CheqiApiError {
  return error instanceof CheqiApiError && (error.isRetryable ||
    (error.httpStatusCode === 0 && error.isNetworkError()));
}

function isAmbiguousSubmission(error: unknown): error is CheqiApiError {
  return isRecoverable(error) || (error instanceof CheqiApiError &&
    error.errorCode === ErrorCodes.INVALID_RESPONSE &&
    (error.httpStatusCode === 0 || (error.httpStatusCode >= 200 && error.httpStatusCode < 300)));
}

function retryAfter(error: unknown): number | null {
  return error instanceof SubmissionInProgressError ? error.retryAfterSeconds : null;
}
