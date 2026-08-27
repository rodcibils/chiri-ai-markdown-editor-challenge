import { describe, expect, it } from 'vitest';

import { parseSuggestionRequest } from '../../server/suggestionHandler';

const validBody = {
  operation: 'initial',
  documentMarkdown: '# Document',
  targetMarkdown: '',
  instruction: 'Continue the document.',
  scope: { kind: 'insertion', position: 10 },
};

describe('suggestion API', () => {
  it('validates scope coordinates and target text', () => {
    expect(parseSuggestionRequest(validBody).ok).toBe(true);
    expect(
      parseSuggestionRequest({
        ...validBody,
        scope: { kind: 'selection', from: 0, to: 2 },
      }),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects malformed request bodies before a provider can run', () => {
    expect(parseSuggestionRequest({})).toEqual({
      ok: false,
      status: 400,
      error: 'Document, target, and instruction are required.',
    });
  });

  it('accepts consistent selection and document refinements', () => {
    expect(
      parseSuggestionRequest({
        operation: 'refinement',
        documentMarkdown: 'Before refined after',
        targetMarkdown: 'refined',
        instruction: 'Make it shorter.',
        scope: { kind: 'selection', from: 7, to: 14 },
      }),
    ).toMatchObject({ ok: true });
    expect(
      parseSuggestionRequest({
        operation: 'refinement',
        documentMarkdown: 'Refined document',
        targetMarkdown: 'Refined document',
        instruction: 'Polish it.',
        scope: { kind: 'document' },
      }),
    ).toMatchObject({ ok: true });
  });

  it('rejects invalid refinement operations and working targets', () => {
    expect(
      parseSuggestionRequest({ ...validBody, operation: 'unknown' }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      parseSuggestionRequest({ ...validBody, operation: 'refinement' }),
    ).toMatchObject({
      ok: false,
      status: 400,
      error: 'Refinement scope must target existing text.',
    });
    expect(
      parseSuggestionRequest({
        operation: 'refinement',
        documentMarkdown: 'Before refined after',
        targetMarkdown: 'different',
        instruction: 'Polish it.',
        scope: { kind: 'selection', from: 7, to: 14 },
      }),
    ).toMatchObject({ ok: false, status: 400 });
  });
});
