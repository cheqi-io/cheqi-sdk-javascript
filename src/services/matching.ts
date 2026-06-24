import { CheqiApiError, CheqiSDKError, ErrorCodes } from "../errors.js";
import type { CheqiApiClient, IdentificationDetails, RecipientResolutionResponse } from "../types.js";
import { coalesceString } from "../utils.js";

export class MatchingService {
  constructor(private readonly apiClient: Pick<CheqiApiClient, "matchCustomer">) {}

  async matchCustomer(
    identificationDetails: IdentificationDetails,
    accessToken?: string | null
  ): Promise<RecipientResolutionResponse> {
    if (!this.hasValidIdentifiers(identificationDetails)) {
      throw new CheqiSDKError(
        "Identification details must contain at least one identifier (card details, payment account details, or email)",
        { errorCode: ErrorCodes.VALIDATION_ERROR, httpStatusCode: 400 }
      );
    }

    try {
      return await this.apiClient.matchCustomer(identificationDetails, accessToken);
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

  private hasValidIdentifiers(identificationDetails: IdentificationDetails | null | undefined): boolean {
    if (!identificationDetails) {
      return false;
    }

    return Boolean(
      coalesceString(
        (identificationDetails.cardDetails as { paymentAccountNumber?: string } | undefined)?.paymentAccountNumber,
        identificationDetails.cardDetails?.paymentAccountReference,
        identificationDetails.paymentAccountDetails?.identifier,
        identificationDetails.recipientEmail,
        identificationDetails.cheqiReceiptId,
        identificationDetails.pairingCode
      )
    );
  }
}
