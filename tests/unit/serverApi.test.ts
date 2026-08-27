import { describe, expect, it } from 'vitest';

import { parseSuggestionRequest } from '../../server/suggestionHandler';

const validBody = {
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
});
