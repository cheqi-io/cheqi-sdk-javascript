import { CheqiApiError, ErrorCodes } from "../errors.js";
import type { CheqiApiClient, IdentificationDetails, RecipientResolutionResponse } from "../types.js";
import { coalesceString } from "../utils.js";

export class MatchingService {
  constructor(private readonly apiClient: Pick<CheqiApiClient, "matchCustomer">) {}

  async matchCustomer(
    identificationDetails: IdentificationDetails,
    accessToken?: string | null
  ): Promise<RecipientResolutionResponse> {
    if (!this.hasValidIdentifiers(identificationDetails)) {
      throw new Error("Identification details must contain at least one identifier (card details, payment account details, or email)");
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

    const cardDetails = identificationDetails.cardDetails ?? identificationDetails.card_details;
    const paymentAccountDetails = identificationDetails.paymentAccountDetails ?? identificationDetails.payment_account_details;

    return Boolean(
      coalesceString(
        cardDetails?.paymentAccountNumber,
        cardDetails?.payment_account_number,
        cardDetails?.paymentAccountReference,
        cardDetails?.payment_account_reference,
        paymentAccountDetails?.identifier,
        identificationDetails.recipientEmail,
        identificationDetails.recipient_email,
        identificationDetails.cheqiReceiptId,
        identificationDetails.cheqi_receipt_id,
        identificationDetails.pairingCode,
        identificationDetails.pairing_code
      )
    );
  }
}
