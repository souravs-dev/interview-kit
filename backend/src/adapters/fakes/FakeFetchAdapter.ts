import type { FetchAdapter, FetchedPage } from "../../pipeline/types.js";

/**
 * URL-keyed fake fetcher. An unregistered URL throws by default (mirrors
 * "the company URL is invalid, returns 404, or times out" — Section 10 —
 * without needing a real network call or fixture server in unit tests).
 */
export class FakeFetchAdapter implements FetchAdapter {
  private responses = new Map<string, FetchedPage | Error>();
  private calls: string[] = [];

  register(url: string, response: FetchedPage | Error): this {
    this.responses.set(url, response);
    return this;
  }

  get callLog(): ReadonlyArray<string> {
    return this.calls;
  }

  async fetch(url: string): Promise<FetchedPage> {
    this.calls.push(url);
    const response = this.responses.get(url);
    if (!response) {
      throw new Error(`FakeFetchAdapter: no fixture registered for ${url}`);
    }
    if (response instanceof Error) throw response;
    return response;
  }
}
