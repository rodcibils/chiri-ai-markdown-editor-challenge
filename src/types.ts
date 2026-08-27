/** Identifies whether a proposal applies to the whole document or a ProseMirror range. */
export type SuggestionScope =
  | { kind: 'document' }
  | { kind: 'selection'; from: number; to: number };

/** A single contiguous portion of the inline review diff. */
export type DiffSegment = {
  value: string;
  type: 'unchanged' | 'added' | 'removed';
}

/** Immutable proposal snapshot retained until the user accepts or rejects it. */
export interface AiSuggestion {
  originalMarkdown: string;
  proposedMarkdown: string;
  scope: SuggestionScope;
  instructions: string[];
}
