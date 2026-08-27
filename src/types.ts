/** Identifies the document range that a suggestion is allowed to change. */
export type SuggestionScope =
  | { kind: 'selection'; from: number; to: number }
  | { kind: 'insertion'; position: number }
  | { kind: 'document' };

/** A contiguous piece of text in the computed review diff. */
export type DiffSegment = {
  value: string;
  type: 'unchanged' | 'added' | 'removed';
};

/** Proposal snapshot kept unchanged until the user accepts or rejects it. */
export interface AiSuggestion {
  originalMarkdown: string;
  proposedMarkdown: string;
  scope: SuggestionScope;
  instructions: string[];
}
