import type { FetchAdapter, FetchedPage } from "../pipeline/types.js";
import { assertFetchableUrl, BlockedUrlError } from "../security/ssrfGuard.js";
import { withRetry } from "./withRetry.js";

const MAX_BYTES = 3 * 1024 * 1024; // 3MB — plenty for a company page, small enough to bound worst-case memory/time.
const FETCH_TIMEOUT_MS = 10_000;
const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain"];
const DEFAULT_MAX_REDIRECTS = 5;

export interface HttpFetchAdapterOptions {
  nodeEnv?: string;
  maxRedirects?: number;
  /** Overrides MAX_BYTES — primarily for tests exercising the size-limit rejection path without a multi-MB fixture. */
  maxBytes?: number;
}

/** A deterministic failure (wrong content-type, oversized body, 4xx status, too many redirects) — retrying would not help. */
export class PermanentFetchError extends Error {}

function isRetryableFetchError(error: unknown): boolean {
  return !(error instanceof BlockedUrlError) && !(error instanceof PermanentFetchError);
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PermanentFetchError(`Response exceeded max size of ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * The only concrete implementation of FetchAdapter that touches the real
 * network. Every fetch — including each redirect hop — goes through the
 * SSRF guard (Section 11), so a URL that only turns private after a
 * redirect is caught just as reliably as one that's private up front.
 * Deterministic failures (bad content-type, oversized body, SSRF block,
 * a 4xx status) are never retried — only transient network/timeout
 * errors and 429/5xx responses are, per Section 2's rate-limit handling.
 */
export class HttpFetchAdapter implements FetchAdapter {
  constructor(private options: HttpFetchAdapterOptions = {}) {}

  async fetch(rawUrl: string): Promise<FetchedPage> {
    return withRetry(() => this.fetchOnce(rawUrl), { maxAttempts: 3, isRetryable: isRetryableFetchError });
  }

  private async fetchOnce(rawUrl: string): Promise<FetchedPage> {
    let currentUrl = rawUrl;
    const maxRedirects = this.options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const { url } = await assertFetchableUrl(currentUrl, { nodeEnv: this.options.nodeEnv });

      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; InterviewPrepKit/1.0)" },
      });

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        // Re-validate the redirect target on the next loop iteration —
        // never implicitly trust it just because the original URL passed.
        currentUrl = new URL(location, url).toString();
        continue;
      }

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        const message = `Fetch failed with status ${response.status} for ${currentUrl}`;
        throw retryable ? new Error(message) : new PermanentFetchError(message);
      }

      const contentType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim();
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        throw new PermanentFetchError(`Unexpected content-type "${contentType}" for ${currentUrl}`);
      }

      const html = await readLimitedText(response, this.options.maxBytes ?? MAX_BYTES);
      return { url: currentUrl, status: response.status, contentType, html };
    }

    throw new PermanentFetchError(`Too many redirects fetching ${rawUrl}`);
  }
}
