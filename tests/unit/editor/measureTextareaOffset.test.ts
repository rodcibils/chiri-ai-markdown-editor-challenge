import { describe, expect, it } from 'vitest';

import { measureTextareaOffset } from '../../../src/editor/measureTextareaOffset';

describe('measureTextareaOffset', () => {
  it('clamps offsets and removes its temporary mirror', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    document.body.append(textarea);
    const before = document.body.children.length;

    const result = measureTextareaOffset(textarea, 999);

    expect(result.left).toBe(0);
    expect(result.top).toBe(0);
    expect(document.body.children.length).toBe(before);
  });

  it('returns a finite position for empty text and negative offsets', () => {
    const textarea = document.createElement('textarea');
    textarea.value = '';
    document.body.append(textarea);

    expect(measureTextareaOffset(textarea, -10)).toEqual({
      left: 0,
      top: 0,
      lineHeight: 0,
    });
  });
});
