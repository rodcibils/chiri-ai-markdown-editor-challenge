/** Identifies the document range that a suggestion is allowed to change. */
export type SuggestionScope =
  | { kind: 'selection'; from: number; to: number }
  | { kind: 'insertion'; position: number }
  | { kind: 'document' };

/** Direction reported by a textarea for its current source selection. */
export type TextSelectionDirection = 'forward' | 'backward' | 'none';

/** Immutable editor context captured when a contextual AI action is opened. */
export type ContextualAiTrigger =
  | {
      kind: 'insertion';
      documentMarkdown: string;
      position: number;
    }
  | {
      kind: 'selection';
      documentMarkdown: string;
      selectedMarkdown: string;
      from: number;
      to: number;
      direction: TextSelectionDirection;
    };

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
