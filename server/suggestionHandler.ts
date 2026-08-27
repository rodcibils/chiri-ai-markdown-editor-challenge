import type { RequestHandler, Response } from 'express';

import { OpenRouterUpstreamError } from './openRouterClient.js';
import type {
  ServerSuggestionRequest,
  ServerSuggestionOperation,
  ServerSuggestionScope,
  SuggestionGenerationClient,
} from './types.js';

export const MAX_DOCUMENT_LENGTH = 100_000;
export const MAX_TARGET_LENGTH = 100_000;
export const MAX_INSTRUCTION_LENGTH = 4_000;

/** Creates the validated internal AI route handler around an injected client. */
export function createSuggestionHandler(
  client: SuggestionGenerationClient,
): RequestHandler {
  return async (request, response) => {
    const parsed = parseSuggestionRequest(request.body);
    if (!parsed.ok) {
      response.status(parsed.status).json({ error: parsed.error });
      return;
    }

    const controller = new AbortController();
    const abortWhenDisconnected = () => {
      if (!response.writableEnded) controller.abort();
    };
    request.on('aborted', abortWhenDisconnected);
    response.on('close', abortWhenDisconnected);

    try {
      const suggestion = await client.generateSuggestion(
        parsed.value,
        controller.signal,
      );
      if (!response.writableEnded) response.json({ suggestion });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        if (!response.writableEnded) {
          response.status(499).json({ error: 'Request cancelled.' });
        }
        return;
      }
      sendUpstreamError(response, cause);
    } finally {
      request.off('aborted', abortWhenDisconnected);
      response.off('close', abortWhenDisconnected);
    }
  };
}

interface ParseSuccess {
  ok: true;
  value: ServerSuggestionRequest;
}

interface ParseFailure {
  ok: false;
  status: 400 | 413;
  error: string;
}

type ParseResult = ParseSuccess | ParseFailure;

/** Validates shape, scope coordinates, and payload sizes before billing. */
export function parseSuggestionRequest(value: unknown): ParseResult {
  if (!isRecord(value)) {
    return failure(400, 'Request body must be a JSON object.');
  }

  const documentMarkdown = readString(value.documentMarkdown);
  const targetMarkdown = readString(value.targetMarkdown);
  const instruction = readString(value.instruction)?.trim();
  const operation = readOperation(value.operation);
  if (
    documentMarkdown === undefined ||
    targetMarkdown === undefined ||
    instruction === undefined
  ) {
    return failure(400, 'Document, target, and instruction are required.');
  }
  if (!operation) {
    return failure(400, 'A valid suggestion operation is required.');
  }
  if (!instruction) return failure(400, 'Instruction cannot be empty.');
  if (documentMarkdown.length > MAX_DOCUMENT_LENGTH) {
    return failure(413, 'Document is too large to process.');
  }
  if (
    targetMarkdown.length > MAX_TARGET_LENGTH ||
    instruction.length > MAX_INSTRUCTION_LENGTH
  ) {
    return failure(413, 'Suggestion request is too large to process.');
  }

  const scope = parseScope(
    value.scope,
    documentMarkdown,
    targetMarkdown,
    operation,
  );
  if (!scope.ok) return scope;

  return {
    ok: true,
    value: {
      operation,
      documentMarkdown,
      targetMarkdown,
      instruction,
      scope: scope.value,
    },
  };
}

/** Maps normalized upstream errors to safe public responses. */
function sendUpstreamError(response: Response, cause: unknown): void {
  if (cause instanceof OpenRouterUpstreamError && cause.status === 429) {
    response
      .status(429)
      .json({ error: 'The AI service is busy. Please retry shortly.' });
    return;
  }

  response
    .status(502)
    .json({ error: 'The AI service could not generate a suggestion.' });
}

/** Parses a selection, insertion, or whole-document scope safely. */
function parseScope(
  value: unknown,
  documentMarkdown: string,
  targetMarkdown: string,
  operation: ServerSuggestionOperation,
): { ok: true; value: ServerSuggestionScope } | ParseFailure {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return failure(400, 'A valid suggestion scope is required.');
  }
  if (value.kind === 'document') {
    return targetMarkdown === documentMarkdown
      ? { ok: true, value: { kind: 'document' } }
      : failure(400, 'Document scope target does not match the document.');
  }
  if (value.kind === 'insertion') {
    if (operation === 'refinement') {
      return failure(400, 'Refinement scope must target existing text.');
    }
    return isOffset(value.position) && value.position <= documentMarkdown.length
      ? targetMarkdown === ''
        ? { ok: true, value: { kind: 'insertion', position: value.position } }
        : failure(400, 'Insertion scope target must be empty.')
      : failure(400, 'Insertion scope position is invalid.');
  }
  if (value.kind === 'selection') {
    const from = value.from;
    const to = value.to;
    return isOffset(from) &&
      isOffset(to) &&
      from <= to &&
      to <= documentMarkdown.length
      ? documentMarkdown.slice(from, to) === targetMarkdown
        ? { ok: true, value: { kind: 'selection', from, to } }
        : failure(400, 'Selection target does not match the document.')
      : failure(400, 'Selection scope range is invalid.');
  }
  return failure(400, 'A valid suggestion scope is required.');
}

/** Accepts only a supported initial-generation or refinement operation. */
function readOperation(value: unknown): ServerSuggestionOperation | undefined {
  return value === 'initial' || value === 'refinement' ? value : undefined;
}

/** Sends a compact parser failure with no model/provider details. */
function failure(status: 400 | 413, error: string): ParseFailure {
  return { ok: false, status, error };
}

/** Reads strings from unknown JSON without coercing arbitrary values. */
function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Checks JSON object values without relying on prototype properties. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Accepts only finite non-negative integer textarea offsets. */
function isOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
