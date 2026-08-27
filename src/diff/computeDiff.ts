import { diffWordsWithSpace } from 'diff'

import type { DiffSegment } from '../types'

/** Converts the `diff` package result into the app's renderable segment model. */
export function computeDiff(original: string, proposed: string): DiffSegment[] {
  return diffWordsWithSpace(original, proposed).map((part) => ({
    value: part.value,
    type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
  }))
}
