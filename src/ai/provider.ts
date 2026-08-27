/** Input passed to any AI suggestion provider. */
export interface SuggestionRequest {
  /** Markdown text that the provider should revise. */
  markdown: string;
  /** Natural-language instruction describing the requested revision. */
  instruction: string;
  /** Optional cancellation signal for an in-flight request. */
  signal?: AbortSignal;
}

/** Transport-neutral contract shared by the mock and future OpenRouter adapters. */
export interface SuggestionProvider {
  /** Returns revised Markdown without applying it to the document. */
  generateSuggestion(request: SuggestionRequest): Promise<string>;
}
