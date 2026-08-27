import type { SuggestionRequest, SuggestionProvider } from './provider';

/** JSON-safe request sent from the browser to the server-side AI proxy. */
export type SuggestionApiRequest = Omit<SuggestionRequest, 'signal'>;

/** Successful JSON response returned by the internal suggestion route. */
export interface SuggestionApiResponse {
  suggestion: string;
}

/** Safe public error shape returned when the proxy cannot generate a result. */
export interface SuggestionApiError {
  error: string;
  code?: string;
}

/** Runtime contract implemented by the server's OpenRouter client. */
export type SuggestionGenerationClient = Pick<
  SuggestionProvider,
  'generateSuggestion'
>;
