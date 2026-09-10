/**
 * Runs `fn` over `items` with at most `concurrency` in flight at once,
 * preserving result order regardless of completion order. Used by the
 * batch CLI (M6) to bound how many kits build simultaneously, so LLM
 * rate limits aren't hit by firing all cases at once.
 */
export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
