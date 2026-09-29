import type {
  ClientReceiptDownloadResponse,
  ClientReceiptDownloadRequest,
  ReceiptSubmissionResponse,
  ReceiptSubmissionResponseStatusEnum
} from "./models/generated/index.js";
import type { RecipientResolutionResponseDeliveryRouteTypeEnum } from "./models/generated/RecipientResolutionResponse.js";

/** Checkout state, distinct from backend device-processing status. */
export const ReceiptIssueState = {
  DIGITAL_SUBMITTED: "DIGITAL_SUBMITTED",
  DIGITAL_PENDING: "DIGITAL_PENDING",
  DIGITAL_EXPIRED: "DIGITAL_EXPIRED",
  DOWNLOAD_FALLBACK: "DOWNLOAD_FALLBACK",
  EMAIL_FALLBACK: "EMAIL_FALLBACK"
} as const;
export type ReceiptIssueState = typeof ReceiptIssueState[keyof typeof ReceiptIssueState];

/** Persist this object before displaying its URL, which includes the secret fragment key. */
export interface PreparedReceiptDownload {
  readonly downloadUrl: string;
  readonly uploadRequest: Readonly<ClientReceiptDownloadRequest>;
}

/** Outcome of receipt routing and submission. */
export class ReceiptResult {
  private constructor(
    readonly cheqiReceiptId: string | null,
    readonly matchId: string | null,
    readonly deliveryRouteType: RecipientResolutionResponseDeliveryRouteTypeEnum,
    readonly status: ReceiptSubmissionResponseStatusEnum | null,
    readonly createdAt: Date | null,
    readonly expiresAt: Date | null,
    readonly downloadUrl: string | null,
    readonly downloadEnvelopeRequired: boolean,
    readonly emailReceiptRequired: boolean,
    readonly state: ReceiptIssueState = deliveryRouteType === "DIGITAL"
      ? ReceiptIssueState.DIGITAL_SUBMITTED : deliveryRouteType,
    readonly submission: ReceiptSubmissionResponse | null = null,
    readonly preparedDownload: PreparedReceiptDownload | null = null,
    readonly retryable: boolean = false,
    readonly retryAfterSeconds: number | null = null
  ) {}

  static accepted(
    response: ReceiptSubmissionResponse,
    deliveryRouteType: RecipientResolutionResponseDeliveryRouteTypeEnum = "DIGITAL"
  ): ReceiptResult {
    if (!response) throw new TypeError("response cannot be null");
    return new ReceiptResult(
      response.cheqiReceiptId ?? null,
      response.matchId ?? null,
      deliveryRouteType,
      response.status ?? null,
      response.createdAt ?? null,
      null,
      null,
      false,
      false,
      ReceiptIssueState.DIGITAL_SUBMITTED,
      response
    );
  }

  static downloadEnvelopeRequiredResult(
    matchId: string,
    expiresAt: Date | null = null
  ): ReceiptResult {
    return new ReceiptResult(
      null,
      matchId,
      "DOWNLOAD_FALLBACK",
      null,
      null,
      expiresAt,
      null,
      true,
      false
    );
  }

  static emailReceiptRequiredResult(matchId: string, expiresAt: Date | null = null): ReceiptResult {
    return new ReceiptResult(
      null,
      matchId,
      "EMAIL_FALLBACK",
      null,
      null,
      expiresAt,
      null,
      false,
      true
    );
  }

  static downloadAccepted(
    matchId: string | null,
    response: ClientReceiptDownloadResponse,
    downloadUrl: string
  ): ReceiptResult {
    if (!response) throw new TypeError("response cannot be null");
    return new ReceiptResult(
      response.cheqiReceiptId ?? null,
      matchId,
      "DOWNLOAD_FALLBACK",
      null,
      response.createdAt ?? null,
      response.expiresAt ?? null,
      downloadUrl,
      false,
      false
    );
  }

  static digitalPending(matchId: string, download: PreparedReceiptDownload | null = null,
    retryAfterSeconds: number | null = null): ReceiptResult {
    return new ReceiptResult(null, matchId, "DIGITAL", null, null, null,
      download?.downloadUrl ?? null, false, false, ReceiptIssueState.DIGITAL_PENDING,
      null, download, true, retryAfterSeconds);
  }

  static digitalExpired(matchId: string): ReceiptResult {
    return new ReceiptResult(null, matchId, "DIGITAL", null, null, null, null,
      false, false, ReceiptIssueState.DIGITAL_EXPIRED);
  }

  static downloadPrepared(download: PreparedReceiptDownload): ReceiptResult {
    return new ReceiptResult(null, null, "DOWNLOAD_FALLBACK", null, null, null,
      download.downloadUrl, false, false, ReceiptIssueState.DOWNLOAD_FALLBACK,
      null, download, true);
  }

  isAccepted(): boolean { return Boolean(this.cheqiReceiptId?.trim()); }
  isSuccess(): boolean { return this.isAccepted(); }
  isDownloadEnvelopeRequired(): boolean { return this.downloadEnvelopeRequired; }
  isEmailReceiptRequired(): boolean { return this.emailReceiptRequired; }
  getCheqiReceiptId(): string | null { return this.cheqiReceiptId; }
  getMatchId(): string | null { return this.matchId; }
  getDeliveryRouteType(): RecipientResolutionResponseDeliveryRouteTypeEnum { return this.deliveryRouteType; }
  getStatus(): ReceiptSubmissionResponseStatusEnum | null { return this.status; }
  getCreatedAt(): Date | null { return this.createdAt; }
  getExpiresAt(): Date | null { return this.expiresAt; }
  getDownloadUrl(): string | null { return this.downloadUrl; }
}

/** Result returned after Cheqi accepts an encrypted credit-note processing job. */
export class CreditNoteResult {
  private constructor(
    readonly parentCheqiReceiptId: string,
    readonly cheqiReceiptId: string | null,
    readonly matchId: string | null,
    readonly status: ReceiptSubmissionResponseStatusEnum | null,
    readonly createdAt: Date | null
  ) {}

  static accepted(parentCheqiReceiptId: string, response: ReceiptSubmissionResponse): CreditNoteResult {
    if (!response) throw new TypeError("response cannot be null");
    return new CreditNoteResult(
      parentCheqiReceiptId,
      response.cheqiReceiptId ?? null,
      response.matchId ?? null,
      response.status ?? null,
      response.createdAt ?? null
    );
  }

  isAccepted(): boolean { return Boolean(this.cheqiReceiptId?.trim()); }
  isSuccess(): boolean { return this.isAccepted(); }
  getCheqiReceiptId(): string | null { return this.cheqiReceiptId; }
  getParentCheqiReceiptId(): string { return this.parentCheqiReceiptId; }
  getMatchId(): string | null { return this.matchId; }
  getStatus(): ReceiptSubmissionResponseStatusEnum | null { return this.status; }
  getCreatedAt(): Date | null { return this.createdAt; }
}
