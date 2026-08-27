import type { SuggestionProvider, SuggestionRequest } from './provider';
import type {
  SuggestionApiError,
  SuggestionApiRequest,
  SuggestionApiResponse,
} from './suggestionApi';

/** Browser provider that talks only to the same-origin server proxy. */
export class HttpSuggestionProvider implements SuggestionProvider {
  private readonly endpoint: string;

  /** Creates a provider for the internal route without accepting any secret. */
  constructor(endpoint = '/api/suggestions') {
    this.endpoint = endpoint;
  }

  /** Sends a JSON-safe request and returns only the generated Markdown. */
  async generateSuggestion(request: SuggestionRequest): Promise<string> {
    const body: SuggestionApiRequest = {
      documentMarkdown: request.documentMarkdown,
      targetMarkdown: request.targetMarkdown,
      instruction: request.instruction,
      scope: request.scope,
    };
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });

    const payload = await readJson(response);
    if (!response.ok) {
      const message = isSuggestionApiError(payload)
        ? payload.error
        : 'The AI service could not process the request.';
      throw new Error(message);
    }

    if (!isSuggestionApiResponse(payload) || !payload.suggestion.trim()) {
      throw new Error('The AI service returned an invalid suggestion.');
    }

    return payload.suggestion;
  }
}

/** Parses JSON safely so HTML/proxy failures become a user-safe error. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Checks the narrow success shape without trusting unknown server data. */
function isSuggestionApiResponse(
  payload: unknown,
): payload is SuggestionApiResponse {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'suggestion' in payload &&
    typeof payload.suggestion === 'string'
  );
}

/** Checks the narrow public error shape without exposing upstream details. */
function isSuggestionApiError(payload: unknown): payload is SuggestionApiError {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'string'
  );
}
