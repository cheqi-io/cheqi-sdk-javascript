import type { WebhookDTO } from "../models/generated/index.js";
import type { CheqiApiClient, RequestOptions } from "../types.js";

/** Webhook subscription management. */
export class WebhookService {
  constructor(private readonly apiClient: Pick<CheqiApiClient, "updateWebhookSubscriptionUrl">) {}

  updateSubscriptionUrl(subscriptionId: string, notificationUrl: string, options?: RequestOptions | null): Promise<WebhookDTO> {
    if (!notificationUrl?.trim()) throw new TypeError("Notification URL is required");
    return this.apiClient.updateWebhookSubscriptionUrl(subscriptionId, notificationUrl, options);
  }
}
