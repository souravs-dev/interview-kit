import type { SearchAdapter, SearchResult } from "../../pipeline/types.js";

/**
 * Query-keyed fake for DuckDuckGo-shaped search results. An unregistered
 * query returns an empty array by default (mirrors "public discussion
 * turns up nothing at all", Section 10) rather than throwing, since that
 * is the realistic default outcome for a query no fixture was set up for.
 */
export class FakeSearchAdapter implements SearchAdapter {
  private responses = new Map<string, SearchResult[] | Error>();
  private calls: string[] = [];

  register(query: string, response: SearchResult[] | Error): this {
    this.responses.set(query, response);
    return this;
  }

  get callLog(): ReadonlyArray<string> {
    return this.calls;
  }

  async search(query: string): Promise<SearchResult[]> {
    this.calls.push(query);
    const response = this.responses.get(query);
    if (!response) return [];
    if (response instanceof Error) throw response;
    return response;
  }
}
