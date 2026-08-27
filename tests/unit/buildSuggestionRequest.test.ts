import { describe, expect, it } from 'vitest';

import { buildSuggestionRequest } from '../../src/ai/buildSuggestionRequest';

describe('buildSuggestionRequest', () => {
  it('builds initial insertion, selection, and document targets', () => {
    const documentMarkdown = 'Before OLD after';

    expect(
      buildSuggestionRequest({
        operation: 'initial',
        documentMarkdown,
        instruction: 'Insert text.',
        applicationScope: { kind: 'insertion', position: 7 },
      }),
    ).toMatchObject({
      operation: 'initial',
      documentMarkdown,
      targetMarkdown: '',
      scope: { kind: 'insertion', position: 7 },
    });
    expect(
      buildSuggestionRequest({
        operation: 'initial',
        documentMarkdown,
        instruction: 'Rewrite text.',
        applicationScope: { kind: 'selection', from: 7, to: 10 },
      }),
    ).toMatchObject({
      targetMarkdown: 'OLD',
      scope: { kind: 'selection', from: 7, to: 10 },
    });
    expect(
      buildSuggestionRequest({
        operation: 'initial',
        documentMarkdown,
        instruction: 'Rewrite everything.',
        applicationScope: { kind: 'document' },
      }),
    ).toMatchObject({
      targetMarkdown: documentMarkdown,
      scope: { kind: 'document' },
    });
  });

  it('integrates only the latest selection proposal into each refinement', () => {
    const common = {
      operation: 'refinement' as const,
      documentMarkdown: 'Before OLD after',
      instruction: 'Refine it.',
      applicationScope: { kind: 'selection' as const, from: 7, to: 10 },
    };

    expect(
      buildSuggestionRequest({ ...common, workingMarkdown: 'FIRST' }),
    ).toMatchObject({
      operation: 'refinement',
      documentMarkdown: 'Before FIRST after',
      targetMarkdown: 'FIRST',
      scope: { kind: 'selection', from: 7, to: 12 },
    });
    expect(
      buildSuggestionRequest({ ...common, workingMarkdown: 'SECOND' }),
    ).toMatchObject({
      documentMarkdown: 'Before SECOND after',
      targetMarkdown: 'SECOND',
      scope: { kind: 'selection', from: 7, to: 13 },
    });
  });

  it('turns insertion output into a working selection for refinement', () => {
    expect(
      buildSuggestionRequest({
        operation: 'refinement',
        documentMarkdown: 'Before after',
        instruction: 'Shorten it.',
        applicationScope: { kind: 'insertion', position: 7 },
        workingMarkdown: 'NEW',
      }),
    ).toMatchObject({
      documentMarkdown: 'Before NEWafter',
      targetMarkdown: 'NEW',
      scope: { kind: 'selection', from: 7, to: 10 },
    });
  });

  it('uses a proposal as the complete working document when refining all text', () => {
    expect(
      buildSuggestionRequest({
        operation: 'refinement',
        documentMarkdown: 'Original document',
        instruction: 'Refine it.',
        applicationScope: { kind: 'document' },
        workingMarkdown: 'Current proposal',
      }),
    ).toMatchObject({
      documentMarkdown: 'Current proposal',
      targetMarkdown: 'Current proposal',
      scope: { kind: 'document' },
    });
  });

  it('rejects a refinement without a current proposal', () => {
    expect(() =>
      buildSuggestionRequest({
        operation: 'refinement',
        documentMarkdown: 'Document',
        instruction: 'Refine it.',
        applicationScope: { kind: 'document' },
      }),
    ).toThrow('Refinement requires the latest proposed Markdown.');
  });
});
