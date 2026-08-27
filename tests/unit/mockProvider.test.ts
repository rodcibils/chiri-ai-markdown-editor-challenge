import { describe, expect, it, vi } from 'vitest';

import { MockSuggestionProvider } from '../../src/ai/mockProvider';
import type { SuggestionRequest } from '../../src/ai/provider';

const request = (instruction: string, targetMarkdown = 'Original text'):
  SuggestionRequest => ({
    operation: 'initial',
    documentMarkdown: `# Document\n\n${targetMarkdown}`,
    targetMarkdown,
    instruction,
    scope: { kind: 'selection', from: 0, to: targetMarkdown.length },
  });

describe('MockSuggestionProvider', () => {
  it('returns deterministic scoped output after its delay', async () => {
    vi.useFakeTimers();
    const provider = new MockSuggestionProvider();
    const promise = provider.generateSuggestion(request('[mock:rewrite] Make clear'));

    await vi.advanceTimersByTimeAsync(599);
    expect(promise).toBeInstanceOf(Promise);
    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    await expect(promise).resolves.toContain('Mock rewrite applied');
  });

  it.each([
    ['[mock:error]', 'rejects'],
    ['[mock:empty]', 'empty'],
    ['[mock:unchanged]', 'unchanged'],
  ])('supports the %s offline command', async (command, behavior) => {
    vi.useFakeTimers();
    const provider = new MockSuggestionProvider();
    const promise = provider.generateSuggestion(request(command));
    const assertion = behavior === 'rejects'
      ? expect(promise).rejects.toThrow('Mock AI service unavailable.')
      : behavior === 'empty'
        ? expect(promise).resolves.toBe('')
        : expect(promise).resolves.toBe('Original text');
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
  });

  it('supports add and remove commands and insertion scopes', async () => {
    vi.useFakeTimers();
    const provider = new MockSuggestionProvider();
    const addRequest = request('[mock:add]', '');
    addRequest.scope = { kind: 'insertion', position: 0 };
    const addPromise = provider.generateSuggestion(addRequest);
    await vi.advanceTimersByTimeAsync(600);
    await expect(addPromise).resolves.toContain('Suggested addition');

    const removePromise = provider.generateSuggestion(request('[mock:remove]'));
    await vi.advanceTimersByTimeAsync(600);
    await expect(removePromise).resolves.toBe('Original text');
  });

  it('rejects immediately when already aborted and while pending', async () => {
    vi.useFakeTimers();
    const provider = new MockSuggestionProvider();
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    await expect(
      provider.generateSuggestion({
        ...request('rewrite'),
        signal: alreadyAborted.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    const controller = new AbortController();
    const promise = provider.generateSuggestion({
      ...request('rewrite'),
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(600);
  });
});
