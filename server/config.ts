import dotenv from 'dotenv';

/** Runtime configuration required by the server-only OpenRouter integration. */
export interface ServerConfig {
  apiKey: string;
  model: string;
  siteUrl?: string;
  appName?: string;
  port: number;
  maxCompletionTokens: number;
}

const DEFAULT_PORT = 8787;
const DEFAULT_MAX_COMPLETION_TOKENS = 2_000;

/** Loads ignored local environment files without printing any secret values. */
export function loadServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  if (environment === process.env) {
    dotenv.config({ path: ['.env.local', '.env'] });
  }

  const apiKey = environment.OPENROUTER_API_KEY?.trim();
  const model = environment.OPENROUTER_MODEL?.trim();
  if (!apiKey) {
    throw new Error(
      'Missing OPENROUTER_API_KEY. Add it to ignored .env.local or deployment secrets.',
    );
  }
  if (!model) {
    throw new Error(
      'Missing OPENROUTER_MODEL. Choose a chat model slug in .env.local.',
    );
  }

  return {
    apiKey,
    model,
    siteUrl: environment.OPENROUTER_SITE_URL?.trim() || undefined,
    appName: environment.OPENROUTER_APP_NAME?.trim() || undefined,
    port: parsePositiveInteger(environment.API_PORT, DEFAULT_PORT),
    maxCompletionTokens: parsePositiveInteger(
      environment.OPENROUTER_MAX_COMPLETION_TOKENS,
      DEFAULT_MAX_COMPLETION_TOKENS,
    ),
  };
}

/** Parses positive integer settings while retaining safe production defaults. */
function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
