import { CheqiApiError, CheqiSDKError, ErrorCodes } from "../errors.js";
import type { CheqiApiClient, IdentificationDetails, RecipientResolutionResponse, RequestOptions } from "../types.js";

export class MatchingService {
  constructor(private readonly apiClient: Pick<CheqiApiClient, "matchCustomer">) {}

  async matchCustomer(
    identificationDetails: IdentificationDetails,
    options?: RequestOptions | null
  ): Promise<RecipientResolutionResponse> {
    if (!identificationDetails) {
      throw new CheqiSDKError(
        "Identification details cannot be null",
        { errorCode: ErrorCodes.VALIDATION_ERROR, httpStatusCode: 400 }
      );
    }
    if (!hasValidIdentifiers(identificationDetails)) {
      throw new TypeError(
        "Identification details must contain at least one identifier (card details, payment account details, receipt ID, email, pairing code, or payment type)"
      );
    }

    try {
      return await this.apiClient.matchCustomer(identificationDetails, options);
    } catch (error) {
      if (error instanceof CheqiApiError) {
        throw error;
      }
      throw new CheqiApiError(`Customer matching failed: ${String((error as Error).message)}`, {
        errorCode: ErrorCodes.UNKNOWN_ERROR,
        cause: error
      });
    }
  }
}

function hasValidIdentifiers(details: IdentificationDetails): boolean {
  return Boolean(
    details.cardDetails?.paymentAccountReference?.trim() ||
    details.paymentAccountDetails?.identifier?.trim() ||
    details.cheqiReceiptId?.trim() ||
    details.recipientEmail?.trim() ||
    details.pairingCode?.trim() ||
    details.paymentType
  );
}
