import { CheqiApiError, ErrorCodes } from "../errors.js";
import { sleep } from "../utils.js";

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export class RetryHandler {
  constructor(private readonly maxRetries = 3) {}

  async executeWithRetry(
    operation: () => Promise<Response>,
    operationName: string
  ): Promise<Response> {
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= this.maxRetries) {
      try {
        const response = await operation();
        if (RETRYABLE_STATUS_CODES.has(response.status) && attempt < this.maxRetries) {
          await sleep(this.calculateBackoff(attempt, response.status, response.headers.get("Retry-After")));
          attempt += 1;
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt >= this.maxRetries) {
          break;
        }
        await sleep(this.calculateBackoff(attempt, 0, null));
        attempt += 1;
      }
    }

    throw new CheqiApiError(`Network error: ${String((lastError as Error | null)?.message ?? operationName)}`, {
      errorCode: ErrorCodes.NETWORK_ERROR,
      cause: lastError
    });
  }

  private calculateBackoff(attempt: number, statusCode: number, retryAfter: string | null): number {
    if (retryAfter) {
      const parsed = Number(retryAfter);
      if (Number.isFinite(parsed)) {
        return parsed * 1000;
      }
    }

    const baseDelay = statusCode === 429 ? 5000 : 1000;
    const jitter = 0.75 + Math.random() * 0.5;
    return Math.min(Math.trunc(baseDelay * (2 ** attempt) * jitter), 30000);
  }
}
