import { CheqiApiError, CheqiSDKError, ErrorCodes } from "../errors.js";
import type { CheqiApiClient, IdentificationDetails, RecipientResolutionResponse } from "../types.js";

export class MatchingService {
  constructor(private readonly apiClient: Pick<CheqiApiClient, "matchCustomer">) {}

  async matchCustomer(
    identificationDetails: IdentificationDetails,
    accessToken?: string | null
  ): Promise<RecipientResolutionResponse> {
    if (!identificationDetails) {
      throw new CheqiSDKError(
        "Identification details cannot be null",
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
}
