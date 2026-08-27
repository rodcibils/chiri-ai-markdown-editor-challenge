import { describe, expect, it } from 'vitest';

import { computeDiff } from '../../src/diff/computeDiff';

describe('computeDiff', () => {
  it('returns unchanged content for identical Markdown', () => {
    expect(computeDiff('## Title\n\nText', '## Title\n\nText')).toEqual([
      { value: '## Title\n\nText', type: 'unchanged' },
    ]);
  });

  it('preserves additions, removals, and whitespace', () => {
    const segments = computeDiff('A short note.', 'A much longer note.');

    expect(segments).toEqual([
      { value: 'A ', type: 'unchanged' },
      { value: 'short', type: 'removed' },
      { value: 'much', type: 'added' },
      { value: ' ', type: 'unchanged' },
      { value: 'longer ', type: 'added' },
      { value: 'note.', type: 'unchanged' },
    ]);
  });

  it('handles empty and Unicode input', () => {
    expect(computeDiff('', '✨ idea')).toEqual([
      { value: '✨ idea', type: 'added' },
    ]);
    expect(computeDiff('café', '')).toEqual([
      { value: 'café', type: 'removed' },
    ]);
  });
});
