import type { ServerConfig } from './config.js';
import { buildOpenRouterMessages } from './prompt.js';
import type { ServerSuggestionRequest } from './types.js';

const OPENROUTER_ENDPOINT =
  'https://openrouter.ai/api/v1/chat/completions';

/** Normalized upstream failure used by the HTTP route's safe status mapping. */
export class OpenRouterUpstreamError extends Error {
  readonly status: number;

  constructor(status: number, message = 'OpenRouter request failed.') {
    super(message);
    this.name = 'OpenRouterUpstreamError';
    this.status = status;
  }
}

/** Server-side client for OpenRouter's OpenAI-compatible chat endpoint. */
export interface OpenRouterClient {
  generateSuggestion(
    request: ServerSuggestionRequest,
    signal?: AbortSignal,
  ): Promise<string>;
}

/** Creates an OpenRouter client with injectable fetch for offline tests. */
export function createOpenRouterClient(
  config: ServerConfig,
  fetchImplementation: typeof fetch = fetch,
): OpenRouterClient {
  return {
    async generateSuggestion(request, signal) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      };
      if (config.siteUrl) headers['HTTP-Referer'] = config.siteUrl;
      if (config.appName) headers['X-OpenRouter-Title'] = config.appName;

      let response: Response;
      try {
        response = await fetchImplementation(OPENROUTER_ENDPOINT, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: config.model,
            messages: buildOpenRouterMessages(request),
            temperature: 0.3,
            max_completion_tokens: config.maxCompletionTokens,
          }),
          signal,
        });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          throw cause;
        }
        throw new OpenRouterUpstreamError(503, 'OpenRouter is unavailable.');
      }

      const payload = await readJson(response);
      if (!response.ok) throw new OpenRouterUpstreamError(response.status);

      const content = getMessageContent(payload);
      if (!content?.trim()) {
        throw new OpenRouterUpstreamError(
          502,
          'OpenRouter returned no usable Markdown.',
        );
      }
      return content;
    },
  };
}

/** Parses an unknown upstream body without allowing raw data to escape. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Extracts the standard string message content from an unknown response. */
function getMessageContent(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  if (!('choices' in payload) || !Array.isArray(payload.choices)) return undefined;

  const firstChoice = payload.choices[0];
  if (typeof firstChoice !== 'object' || firstChoice === null) return undefined;
  if (!('message' in firstChoice) || typeof firstChoice.message !== 'object') {
    return undefined;
  }

  const message = firstChoice.message;
  if (message === null || !('content' in message)) return undefined;
  return typeof message.content === 'string' ? message.content : undefined;
}
