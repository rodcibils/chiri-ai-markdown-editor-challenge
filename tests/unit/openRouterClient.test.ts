import { describe, expect, it, vi } from 'vitest';

import { createOpenRouterClient } from '../../server/openRouterClient';

const config = {
  apiKey: 'test-key',
  model: 'test/model',
  siteUrl: 'http://localhost:5173',
  appName: 'Test editor',
  port: 8787,
  maxCompletionTokens: 200,
};

const suggestionRequest = {
  documentMarkdown: '# Notes',
  targetMarkdown: '# Notes',
  instruction: 'Improve the title.',
  scope: { kind: 'document' as const },
};

describe('OpenRouter client', () => {
  it('sends the configured server-only request and extracts message content', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '# Better notes' } }] }),
        { status: 200 },
      ),
    );
    const client = createOpenRouterClient(config, fetchMock);

    await expect(
      client.generateSuggestion(suggestionRequest),
    ).resolves.toBe('# Better notes');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'HTTP-Referer': 'http://localhost:5173',
        }),
      }),
    );
  });

  it('normalizes malformed upstream responses into a safe error', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );
    const client = createOpenRouterClient(config, fetchMock);

    await expect(
      client.generateSuggestion(suggestionRequest),
    ).rejects.toThrow('OpenRouter returned no usable Markdown.');
  });
});
