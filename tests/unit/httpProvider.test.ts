import { describe, expect, it, vi } from 'vitest';

import { HttpSuggestionProvider } from '../../src/ai/httpProvider';

const request = {
  operation: 'initial' as const,
  documentMarkdown: '# Document',
  targetMarkdown: '',
  instruction: 'Continue the document.',
  scope: { kind: 'insertion' as const, position: 10 },
};

describe('HttpSuggestionProvider', () => {
  it('sends the browser request to the internal route and returns Markdown', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ suggestion: 'A continuation.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new HttpSuggestionProvider().generateSuggestion(request),
    ).resolves.toBe('A continuation.');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/suggestions',
      expect.objectContaining({ method: 'POST' }),
    );
    const serializedBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(JSON.parse(String(serializedBody))).toEqual({
      operation: 'initial',
      documentMarkdown: '# Document',
      targetMarkdown: '',
      instruction: 'Continue the document.',
      scope: { kind: 'insertion', position: 10 },
    });
  });

  it('surfaces safe server errors and rejects empty suggestions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Try again.' }), { status: 502 }),
      ),
    );
    await expect(
      new HttpSuggestionProvider().generateSuggestion(request),
    ).rejects.toThrow('Try again.');

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ suggestion: '   ' }), { status: 200 }),
      ),
    );
    await expect(
      new HttpSuggestionProvider().generateSuggestion(request),
    ).rejects.toThrow('invalid suggestion');
  });
});
