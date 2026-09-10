export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  isRetryable?: (error: unknown) => boolean;
  /**
   * Overrides the computed exponential-backoff delay for a given
   * error/attempt — e.g. honoring a rate-limit response's own reported
   * wait time, which is typically tens of seconds and not something a
   * short exponential backoff can usefully wait out. Return undefined to
   * fall back to the default computed delay.
   */
  getDelayMs?: (error: unknown, attempt: number) => number | undefined;
  /** Injectable for tests — avoids real timers slowing the suite down. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Exponential backoff with jitter, wrapping any adapter call (LLM, search,
 * fetch). Used uniformly across all three adapters and the batch CLI's
 * per-case retries, per RFC-001 section 3.2's rate-limit handling.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 500, factor = 2, jitter = true, isRetryable = () => true, getDelayMs, sleep = defaultSleep } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryable(error)) {
        throw error;
      }
      const computedDelay = baseDelayMs * factor ** (attempt - 1);
      const delay = getDelayMs?.(error, attempt) ?? computedDelay;
      await sleep(jitter ? delay * (0.5 + Math.random() * 0.5) : delay);
    }
  }
  // Unreachable given the loop above always returns or throws, but keeps TS happy.
  throw lastError;
}
