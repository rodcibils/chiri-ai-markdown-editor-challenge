/** Scope supported by the server-side suggestion contract. */
export type ServerSuggestionScope =
  | { kind: 'document' }
  | { kind: 'insertion'; position: number }
  | { kind: 'selection'; from: number; to: number };

/** Stage of the suggestion workflow represented by a server request. */
export type ServerSuggestionOperation = 'initial' | 'refinement';

/** Validated request exchanged between the route and OpenRouter client. */
export interface ServerSuggestionRequest {
  operation: ServerSuggestionOperation;
  documentMarkdown: string;
  targetMarkdown: string;
  instruction: string;
  scope: ServerSuggestionScope;
}

/** Minimal provider contract used by the HTTP route. */
export interface SuggestionGenerationClient {
  generateSuggestion(
    request: ServerSuggestionRequest,
    signal?: AbortSignal,
  ): Promise<string>;
}
