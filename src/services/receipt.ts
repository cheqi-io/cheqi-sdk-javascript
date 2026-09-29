import { randomUUID } from "node:crypto";
import { CheqiApiError, CheqiSDKError, ErrorCodes } from "../errors.js";
import {
  encryptDownloadEnvelope,
  generateDownloadLink,
  type DownloadLink
} from "../download/index.js";
import { ReceiptResult } from "../models.js";
import type {
  CheqiApiClient,
  EncryptedReceiptEnvelope,
  EncryptedReceiptPayload,
  IdentificationDetails,
  MatchedRecipient,
  ReceiptEnvelope,
  ReceiptPayload,
  ReceiptSubmissionResponse,
  RecipientResolutionResponse
} from "../types.js";
import type { RecipientResolutionResponseDeliveryRouteTypeEnum } from "../models/generated/RecipientResolutionResponse.js";
import { serializeJson } from "../utils.js";
import { VerificationService } from "./verification.js";
import { EncryptionService } from "./encryption.js";
import { MatchingService } from "./matching.js";

const PAYLOAD_DOCUMENT_VERSION = "receipt-payload-v1";
const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Issues definitive receipt payloads through Cheqi's zero-knowledge device flow. */
export class ReceiptService {
  private readonly verificationService = new VerificationService();

  constructor(
    private readonly apiClient: Pick<
      CheqiApiClient,
      "submitEncryptedReceipt" | "uploadEncryptedDownloadReceipt"
    >,
    private readonly encryptionService: EncryptionService,
    private readonly matchingService: MatchingService,
    private readonly receiptDownloadBaseUrl: string | null = "https://receipt.cheqi.io"
  ) {
    if (!apiClient) throw new TypeError("apiClient cannot be null");
    if (!encryptionService) throw new TypeError("encryptionService cannot be null");
    if (!matchingService) throw new TypeError("matchingService cannot be null");
  }

  /**
   * Resolves a route, then encrypts the exact supplied payload independently for
   * every matched owner device. With three arguments, a UUID is treated as a
   * storeId and any other non-empty string as an access token.
   */
  async issueReceipt(
    identificationDetails: IdentificationDetails,
    receiptPayload: ReceiptPayload,
    storeIdOrAccessToken: string | null = null,
    accessToken?: string | null
  ): Promise<ReceiptResult> {
    requireNonNull(identificationDetails, "identificationDetails");
    requireNonNull(receiptPayload, "receiptPayload");
    const { storeId, token } = resolveReceiptArguments(storeIdOrAccessToken, accessToken);
    validateOptionalAccessToken(token);

    try {
      const resolution = await this.matchingService.matchCustomer(identificationDetails, token);
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
          token
        );
      }
      if (route === "EMAIL_FALLBACK") {
        return ReceiptResult.emailReceiptRequiredResult(
          resolution.matchId!,
          resolution.expiresAt ?? null
        );
      }

      validateDeviceRecipients(resolution);
      const plaintextJson = serializeJson(receiptPayload);
      const envelope: EncryptedReceiptEnvelope = {
        matchId: resolution.matchId!,
        storeId: storeId ?? undefined,
        deviceDeliveries: this.encryptForDevices(plaintextJson, resolution.recipients!)
      };
      const response = await this.apiClient.submitEncryptedReceipt(envelope, token);
      return ReceiptResult.accepted(response, route);
    } catch (error) {
      if (error instanceof CheqiApiError) throw wrapApiError("Receipt submission failed", error);
      if (error instanceof CheqiSDKError) throw error;
      throw new CheqiSDKError(`Receipt processing failed: ${errorMessage(error)}`, { cause: error });
    }
  }

  /** Creates a client-encrypted download receipt without attempting matching. */
  async issueDownloadReceipt(
    identificationDetails: IdentificationDetails,
    receiptPayload: ReceiptPayload,
    accessToken: string | null = null
  ): Promise<ReceiptResult> {
    requireNonNull(identificationDetails, "identificationDetails");
    requireNonNull(receiptPayload, "receiptPayload");
    if (!identificationDetails.paymentType) {
      throw validationError("identificationDetails.paymentType is required");
    }
    validateOptionalAccessToken(accessToken);
    try {
      return await this.deliverClientEncryptedDownload(
        null,
        identificationDetails,
        receiptPayload,
        accessToken
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
    accessToken: string | null = null
  ): Promise<ReceiptSubmissionResponse> {
    requireNonNull(envelope, "envelope");
    validateOptionalAccessToken(accessToken);
    try {
      return await this.apiClient.submitEncryptedReceipt(envelope, accessToken);
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
    accessToken: string | null = null
  ): Promise<ReceiptResult> {
    requireNonNull(fallbackResult, "fallbackResult");
    requireNonNull(receiptEnvelope, "receiptEnvelope");
    if (
      !fallbackResult.isDownloadEnvelopeRequired() ||
      fallbackResult.getDeliveryRouteType() !== "DOWNLOAD_FALLBACK"
    ) {
      throw validationError("fallbackResult does not require a download receipt envelope");
    }
    validateOptionalAccessToken(accessToken);
    const baseUrl = requireDownloadBaseUrl(this.receiptDownloadBaseUrl);

    try {
      const link = generateDownloadLink(baseUrl);
      const ciphertext = await encryptDownloadEnvelope(receiptEnvelope, link.contentKey);
      const response = await this.apiClient.uploadEncryptedDownloadReceipt(
        {
          downloadId: link.downloadId,
          ciphertext,
          templateHash
        },
        accessToken
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

  private encryptForDevices(
    plaintextJson: string,
    recipients: MatchedRecipient[]
  ): EncryptedReceiptPayload[] {
    return recipients.map((recipient) =>
      this.encryptionService.encryptReceiptForRecipient(plaintextJson, recipient)
    );
  }

  private async deliverClientEncryptedDownload(
    matchId: string | null,
    identificationDetails: IdentificationDetails,
    receiptPayload: ReceiptPayload,
    accessToken: string | null
  ): Promise<ReceiptResult> {
    const link = generateDownloadLink(requireDownloadBaseUrl(this.receiptDownloadBaseUrl));
    const payloadDocument = serializeJson(receiptPayload);
    const envelope: ReceiptEnvelope = {
      cheqiReceiptId: link.downloadId,
      envelopeVersion: 2,
      receiptGeneratorVersion: PAYLOAD_DOCUMENT_VERSION,
      receiptUuid: randomUUID(),
      documents: {
        RECEIPT_PAYLOAD: { mediaType: "application/json", content: payloadDocument },
        IDENTIFICATION_DETAILS: {
          mediaType: "application/json", content: serializeJson(identificationDetails)
        }
      }
    };
    const ciphertext = await encryptDownloadEnvelope(envelope, link.contentKey);
    const templateHash = this.verificationService.calculateCheqiReceiptHash(payloadDocument);
    const response = await this.apiClient.uploadEncryptedDownloadReceipt(
      { downloadId: link.downloadId, ciphertext, templateHash },
      accessToken
    );
    return ReceiptResult.downloadAccepted(matchId, response, link.url);
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

function resolveReceiptArguments(
  storeIdOrAccessToken: string | null,
  explicitAccessToken: string | null | undefined
): { storeId: string | null; token: string | null } {
  if (explicitAccessToken !== undefined) {
    return { storeId: storeIdOrAccessToken, token: explicitAccessToken };
  }
  if (storeIdOrAccessToken && !UUID_PATTERN.test(storeIdOrAccessToken)) {
    return { storeId: null, token: storeIdOrAccessToken };
  }
  return { storeId: storeIdOrAccessToken, token: null };
}

function validateOptionalAccessToken(accessToken: string | null): void {
  if (accessToken != null && !accessToken.trim()) {
    throw validationError("accessToken cannot be empty");
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
