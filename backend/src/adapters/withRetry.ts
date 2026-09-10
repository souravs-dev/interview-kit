export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  isRetryable?: (error: unknown) => boolean;
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
  const { maxAttempts = 3, baseDelayMs = 500, factor = 2, jitter = true, isRetryable = () => true, sleep = defaultSleep } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryable(error)) {
        throw error;
      }
      const delay = baseDelayMs * factor ** (attempt - 1);
      await sleep(jitter ? delay * (0.5 + Math.random() * 0.5) : delay);
    }
  }
  // Unreachable given the loop above always returns or throws, but keeps TS happy.
  throw lastError;
}
