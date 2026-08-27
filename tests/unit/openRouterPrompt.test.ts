import { describe, expect, it } from 'vitest';

import { buildOpenRouterMessages } from '../../server/prompt';

describe('OpenRouter prompt', () => {
  it('identifies initial generation and refinement explicitly', () => {
    const baseRequest = {
      documentMarkdown: '# Document',
      targetMarkdown: '# Document',
      instruction: 'Improve it.',
      scope: { kind: 'document' as const },
    };
    const initial = buildOpenRouterMessages({
      ...baseRequest,
      operation: 'initial',
    });
    const refinement = buildOpenRouterMessages({
      ...baseRequest,
      operation: 'refinement',
    });

    expect(initial[1].content).toContain('Create an initial suggestion');
    expect(refinement[1].content).toContain('Refine the latest AI proposal');
  });
});
