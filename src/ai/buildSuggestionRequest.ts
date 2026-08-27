import type {
  SuggestionOperation,
  SuggestionRequest,
} from './provider';
import type { SuggestionScope } from '../types';

interface SuggestionRequestInput {
  operation: SuggestionOperation;
  documentMarkdown: string;
  instruction: string;
  applicationScope: SuggestionScope;
  workingMarkdown?: string;
  signal?: AbortSignal;
}

/**
 * Builds a request whose target always belongs to its accompanying document.
 *
 * Refinement integrates the latest proposal into a temporary document while
 * leaving the application's immutable acceptance scope untouched.
 */
export function buildSuggestionRequest({
  operation,
  documentMarkdown,
  instruction,
  applicationScope,
  workingMarkdown,
  signal,
}: SuggestionRequestInput): SuggestionRequest {
  if (operation === 'initial') {
    return {
      operation,
      documentMarkdown,
      targetMarkdown: readInitialTarget(documentMarkdown, applicationScope),
      instruction,
      scope: applicationScope,
      signal,
    };
  }

  if (workingMarkdown === undefined) {
    throw new Error('Refinement requires the latest proposed Markdown.');
  }

  const workingContext = buildRefinementContext(
    documentMarkdown,
    workingMarkdown,
    applicationScope,
  );
  return {
    operation,
    documentMarkdown: workingContext.documentMarkdown,
    targetMarkdown: workingMarkdown,
    instruction,
    scope: workingContext.scope,
    signal,
  };
}

/** Selects the exact source target for an initial provider request. */
function readInitialTarget(
  documentMarkdown: string,
  scope: SuggestionScope,
): string {
  if (scope.kind === 'selection') {
    return documentMarkdown.slice(scope.from, scope.to);
  }
  if (scope.kind === 'document') return documentMarkdown;
  return '';
}

/** Integrates the latest proposal and returns its model-facing working scope. */
function buildRefinementContext(
  documentMarkdown: string,
  workingMarkdown: string,
  scope: SuggestionScope,
): { documentMarkdown: string; scope: SuggestionScope } {
  if (scope.kind === 'document') {
    return {
      documentMarkdown: workingMarkdown,
      scope: { kind: 'document' },
    };
  }

  const from = scope.kind === 'selection' ? scope.from : scope.position;
  const to = scope.kind === 'selection' ? scope.to : scope.position;
  return {
    documentMarkdown: [
      documentMarkdown.slice(0, from),
      workingMarkdown,
      documentMarkdown.slice(to),
    ].join(''),
    scope: {
      kind: 'selection',
      from,
      to: from + workingMarkdown.length,
    },
  };
}
