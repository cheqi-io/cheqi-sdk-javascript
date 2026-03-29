import { CheqiSDKError, ErrorCodes } from "../errors.js";
import type { CheqiApiClient, CompanyDTO } from "../types.js";
import { Company } from "../models/domain.js";
import { getCompanyValidationErrors } from "../validators.js";

export class CompanyService {
  constructor(
    private readonly apiClient: Pick<CheqiApiClient, "provisionCompany">
  ) {}

  provisionCompany(company: Company | CompanyDTO, adminEmail: string): Promise<Record<string, unknown>> {
    if (!company) {
      throw new CheqiSDKError("Company cannot be null", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }

    const validationErrors = getCompanyValidationErrors(company);
    if (validationErrors.length > 0) {
      throw new CheqiSDKError(`Invalid company data: ${validationErrors.join(", ")}`, {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }

    if (!adminEmail.includes("@")) {
      throw new CheqiSDKError("Admin email must be a valid email address", {
        errorCode: ErrorCodes.VALIDATION_ERROR,
        httpStatusCode: 400
      });
    }

    const companyDTO = company instanceof Company ? company.toCompanyDTO() : company;
    return this.apiClient.provisionCompany({ company: companyDTO, adminEmail });
  }
}
