import { diffWordsWithSpace } from 'diff';
import type { DiffSegment } from '../types';

/** Converts two Markdown strings into renderable word-level diff segments. */
export function computeDiff(original: string, proposed: string): DiffSegment[] {
  return diffWordsWithSpace(original, proposed).map((part) => ({
    value: part.value,
    type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
  }));
}
