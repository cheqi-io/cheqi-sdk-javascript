import { CheqiApiError, CheqiSDKError, ErrorCodes } from "../errors.js";
import { CreditNoteResult } from "../models.js";
import type {
  CheqiApiClient,
  EncryptedCreditNoteEnvelope,
  EncryptedReceiptPayload,
  IdentificationDetails,
  MatchedRecipient,
  ReceiptSubmissionResponse,
  RecipientResolutionResponse
} from "../types.js";
import { serializeJson } from "../utils.js";
import { EncryptionService } from "./encryption.js";
import { MatchingService } from "./matching.js";

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Issues definitive credit-note values through the encrypted credit-note endpoint. */
export class CreditNoteService {
  constructor(
    private readonly apiClient: Pick<CheqiApiClient, "submitEncryptedCreditNote">,
    private readonly encryptionService: EncryptionService,
    private readonly matchingService: MatchingService
  ) {
    if (!apiClient) throw new TypeError("apiClient cannot be null");
    if (!encryptionService) throw new TypeError("encryptionService cannot be null");
    if (!matchingService) throw new TypeError("matchingService cannot be null");
  }

  /** Serializes and encrypts the supplied definitive credit-note payload without calculations. */
  async issueCreditNote(
    identificationDetails: IdentificationDetails,
    parentCheqiReceiptId: string,
    creditNotePayload: unknown,
    storeIdOrAccessToken: string | null = null,
    accessToken?: string | null
  ): Promise<CreditNoteResult> {
    requireNonNull(identificationDetails, "identificationDetails");
    requireText(parentCheqiReceiptId, "parentCheqiReceiptId");
    requireNonNull(creditNotePayload, "creditNotePayload");
    const { storeId, token } = resolveArguments(storeIdOrAccessToken, accessToken);
    validateOptionalAccessToken(token);

    try {
      const resolution = await this.matchingService.matchCustomer(identificationDetails, token);
      validateDeviceRoute(resolution);
      const plaintextJson = typeof creditNotePayload === "string"
        ? creditNotePayload
        : serializeJson(creditNotePayload);
      const envelope: EncryptedCreditNoteEnvelope = {
        matchId: resolution.matchId!,
        parentCheqiReceiptId,
        storeId: storeId ?? undefined,
        deviceDeliveries: this.encryptForDevices(plaintextJson, resolution.recipients!)
      };
      const response = await this.apiClient.submitEncryptedCreditNote(envelope, token);
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
    accessToken: string | null = null
  ): Promise<ReceiptSubmissionResponse> {
    requireNonNull(envelope, "envelope");
    validateOptionalAccessToken(accessToken);
    try {
      return await this.apiClient.submitEncryptedCreditNote(envelope, accessToken);
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

  private encryptForDevices(
    plaintextJson: string,
    recipients: MatchedRecipient[]
  ): EncryptedReceiptPayload[] {
    return recipients.map((recipient) =>
      this.encryptionService.encryptCreditNoteForRecipient(plaintextJson, recipient)
    );
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

function resolveArguments(
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

function validateOptionalAccessToken(value: string | null): void {
  if (value != null && !value.trim()) throw validationError("accessToken cannot be empty");
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
