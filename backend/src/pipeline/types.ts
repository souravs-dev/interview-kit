/**
 * The pipeline's dependency-injection seam. `buildKit` (M4) only ever
 * imports these interfaces, never a concrete adapter — the batch CLI and
 * the Express API wire in the same real implementations, and tests wire
 * in fakes. This is what makes "the same code, not a parallel
 * implementation" (assessment Section 9) true at the type level, not just
 * by convention.
 */

export interface LlmAdapter {
  /** Returns the raw text response. Callers own JSON parsing/schema validation/repair. */
  complete(input: { system: string; prompt: string }): Promise<string>;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchAdapter {
  search(query: string): Promise<SearchResult[]>;
}

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  html: string;
}

export interface FetchAdapter {
  fetch(url: string): Promise<FetchedPage>;
}

export interface PipelineDeps {
  llm: LlmAdapter;
  search: SearchAdapter;
  fetcher: FetchAdapter;
}
