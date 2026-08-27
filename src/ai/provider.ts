import type { SuggestionScope } from '../types';

/** Input shared by offline and future network-backed suggestion providers. */
export interface SuggestionRequest {
  /** Complete document, retained as context for the model. */
  documentMarkdown: string;
  /** Exact text the provider is allowed to revise or replace. */
  targetMarkdown: string;
  /** User-authored instruction for the proposed edit. */
  instruction: string;
  /** Scope and coordinates used when applying the returned proposal. */
  scope: SuggestionScope;
  /** Optional cancellation signal for an in-flight request. */
  signal?: AbortSignal;
}

/** Stable boundary between the editor workflow and an AI transport. */
export interface SuggestionProvider {
  /** Returns proposed Markdown without mutating the document. */
  generateSuggestion(request: SuggestionRequest): Promise<string>;
}
