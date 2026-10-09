import type { CheqiApiClient } from "../types.js";
import type { DestinationResponse, InviteEmployeesResponse, RegisterRequest, RegisterResponse, WebhookReceiptEnvelope } from "../models/generated/index.js";

/** Company membership operations. */
export class CompanyService {
  constructor(private readonly apiClient: Pick<CheqiApiClient, "inviteUsers" | "listReceiptDestinations" | "registerReceiptDestination" | "getPendingReceipts" | "acknowledgeReceipts" | "deactivateReceiptDestination">) {}

  /** Sends employee invitations and returns their outcomes. */
  inviteUsers(companyId: string, emails: string[], accessToken: string | null = null, resendPending?: boolean): Promise<InviteEmployeesResponse> {
    if (!companyId?.trim()) throw new TypeError("Company ID is required");
    if (!Array.isArray(emails) || emails.length === 0) throw new TypeError("At least one email is required");
    return this.apiClient.inviteUsers(companyId, emails, accessToken, resendPending);
  }

  listReceiptDestinations(accessToken: string | null = null): Promise<DestinationResponse[]> {
    return this.apiClient.listReceiptDestinations(accessToken);
  }

  registerReceiptDestination(request: RegisterRequest, accessToken: string | null = null): Promise<RegisterResponse> {
    return this.apiClient.registerReceiptDestination(request, accessToken);
  }

  getPendingReceipts(destinationId: string, accessToken: string | null = null): Promise<WebhookReceiptEnvelope[]> {
    return this.apiClient.getPendingReceipts(destinationId, accessToken);
  }

  acknowledgeReceipts(destinationId: string, receiptIds: string[], accessToken: string | null = null): Promise<void> {
    return this.apiClient.acknowledgeReceipts(destinationId, receiptIds, accessToken);
  }

  deactivateReceiptDestination(destinationId: string, accessToken: string | null = null): Promise<void> {
    return this.apiClient.deactivateReceiptDestination(destinationId, accessToken);
  }
}
