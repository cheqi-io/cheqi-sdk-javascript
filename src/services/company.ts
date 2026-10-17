import type { CheqiApiClient, RequestOptions } from "../types.js";
import type { DestinationResponse, InviteEmployeesResponse, RegisterRequest, RegisterResponse, WebhookReceiptEnvelope } from "../models/generated/index.js";

/** Company membership operations. */
export class CompanyService {
  constructor(private readonly apiClient: Pick<CheqiApiClient, "inviteUsers" | "listReceiptDestinations" | "registerReceiptDestination" | "getPendingReceipts" | "acknowledgeReceipts" | "deactivateReceiptDestination">) {}

  /** Sends employee invitations and returns their outcomes. */
  inviteUsers(companyId: string, emails: string[], resendPending?: boolean, options?: RequestOptions | null): Promise<InviteEmployeesResponse> {
    if (!companyId?.trim()) throw new TypeError("Company ID is required");
    if (!Array.isArray(emails) || emails.length === 0) throw new TypeError("At least one email is required");
    return this.apiClient.inviteUsers(companyId, emails, resendPending, options);
  }

  listReceiptDestinations(options?: RequestOptions | null): Promise<DestinationResponse[]> {
    return this.apiClient.listReceiptDestinations(options);
  }

  registerReceiptDestination(request: RegisterRequest, options?: RequestOptions | null): Promise<RegisterResponse> {
    return this.apiClient.registerReceiptDestination(request, options);
  }

  getPendingReceipts(destinationId: string, options?: RequestOptions | null): Promise<WebhookReceiptEnvelope[]> {
    return this.apiClient.getPendingReceipts(destinationId, options);
  }

  acknowledgeReceipts(destinationId: string, receiptIds: string[], options?: RequestOptions | null): Promise<void> {
    return this.apiClient.acknowledgeReceipts(destinationId, receiptIds, options);
  }

  deactivateReceiptDestination(destinationId: string, options?: RequestOptions | null): Promise<void> {
    return this.apiClient.deactivateReceiptDestination(destinationId, options);
  }
}
