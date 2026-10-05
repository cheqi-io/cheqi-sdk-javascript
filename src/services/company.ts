import type { CheqiApiClient } from "../types.js";

/** Company membership operations. */
export class CompanyService {
  constructor(private readonly apiClient: Pick<CheqiApiClient, "inviteUsers">) {}

  /** Sends employee invitations. A successful response has no body. */
  inviteUsers(companyId: string, emails: string[], accessToken: string | null = null): Promise<void> {
    if (!companyId?.trim()) throw new TypeError("Company ID is required");
    if (!Array.isArray(emails) || emails.length === 0) throw new TypeError("At least one email is required");
    return this.apiClient.inviteUsers(companyId, emails, accessToken);
  }
}
