import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import type { Express } from 'express';

import type { SuggestionGenerationClient } from './types.js';
import { createSuggestionHandler } from './suggestionHandler.js';

/** Builds the API/static app around an injected client for production and tests. */
export function createApp(
  client: SuggestionGenerationClient,
  options: { serveStatic?: boolean; rateLimit?: boolean } = {},
): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many AI requests. Please retry shortly.' },
  });

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  app.post(
    '/api/suggestions',
    options.rateLimit === false ? (_request, _response, next) => next() : limiter,
    createSuggestionHandler(client),
  );

  if (options.serveStatic) {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
  }

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found.' });
  });
  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      void next;
      if (error instanceof SyntaxError) {
        response.status(400).json({ error: 'Request body must be valid JSON.' });
        return;
      }
      response.status(500).json({ error: 'Internal server error.' });
    },
  );

  return app;
}
