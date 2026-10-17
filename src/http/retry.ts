import { CheqiApiError, ErrorCodes } from "../errors.js";
import type { Logger } from "../logger.js";
import { NoopLogger } from "../logger.js";
import { sleep } from "../utils.js";

/**
 * Whether a response status code should trigger a retry.
 * Matches the Java SDK: request timeout (408), rate limit (429) and any 5xx.
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

/** Options for configuring the retry handler. */
export interface RetryOptions {
  /** Maximum number of retries (default 3). */
  maxRetries?: number;
  /** Base delay in ms for non-429 retries (default 1000). */
  baseDelayMs?: number;
  /** Base delay in ms for 429 rate-limit retries (default 5000). */
  rateLimitDelayMs?: number;
  /** Maximum backoff delay in ms (default 30 000). */
  maxBackoffMs?: number;
  /** Logger instance. */
  logger?: Logger;
}

/**
 * Executes an HTTP operation with exponential back-off and jitter.
 *
 * Retries on network errors and on responses whose status code is in
 * {@link DEFAULT_RETRYABLE_STATUS_CODES}.
 */
export class RetryHandler {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly rateLimitDelayMs: number;
  private readonly maxBackoffMs: number;
  private readonly logger: Logger;

  constructor(opts: RetryOptions | number = {}) {
    // backwards-compat: accept bare number for maxRetries
    const options = typeof opts === "number" ? { maxRetries: opts } : opts;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.rateLimitDelayMs = options.rateLimitDelayMs ?? 5000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.logger = options.logger ?? new NoopLogger();
  }

  async executeWithRetry(
    operation: () => Promise<Response>,
    operationName: string,
    allowRetries = true,
    maxRetries?: number
  ): Promise<Response> {
    const retryLimit = allowRetries ? maxRetries ?? this.maxRetries : 0;
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt <= retryLimit) {
      try {
        const response = await operation();

        if (isRetryableStatus(response.status) && attempt < retryLimit) {
          const delay = this.calculateBackoff(attempt, response.status, response.headers.get("Retry-After"));
          this.logger.warn(
            `${operationName} returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${retryLimit})`
          );
          await sleep(delay);
          attempt += 1;
          continue;
        }

        if (attempt > 0) {
          this.logger.info(`${operationName} succeeded after ${attempt + 1} attempts`);
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt >= retryLimit) {
          break;
        }
        const delay = this.calculateBackoff(attempt, 0, null);
        this.logger.warn(
          `${operationName} network error: ${(error as Error).message}, retrying in ${delay}ms (attempt ${attempt + 1}/${retryLimit})`
        );
        await sleep(delay);
        attempt += 1;
      }
    }

    this.logger.error(`${operationName} failed after ${attempt + 1} attempts`);
    throw new CheqiApiError(`Network error: ${String((lastError as Error | null)?.message ?? operationName)}`, {
      errorCode: ErrorCodes.NETWORK_ERROR,
      cause: lastError
    });
  }

  private calculateBackoff(attempt: number, statusCode: number, retryAfter: string | null): number {
    if (retryAfter) {
      const parsed = Number(retryAfter);
      // Honour the server's Retry-After verbatim (matches the Java SDK, which does
      // not cap it by maxBackoff). Allow 0 to mean "retry immediately".
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed * 1000;
      }
    }

    const baseDelay = statusCode === 429 ? this.rateLimitDelayMs : this.baseDelayMs;
    const jitter = 0.75 + Math.random() * 0.5;
    return Math.min(Math.trunc(baseDelay * (2 ** attempt) * jitter), this.maxBackoffMs);
  }
}
