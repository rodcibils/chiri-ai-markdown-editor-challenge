import type { AiHistoryEntry } from '../types';

/** Pending session steps and committed entries for the current page lifetime. */
export interface DocumentHistoryState {
  committed: AiHistoryEntry[];
  pending: AiHistoryEntry[];
  activeSessionId: string | null;
}

/** Explicit transitions supported by the in-memory history state machine. */
export type DocumentHistoryAction =
  | { type: 'start-session'; sessionId: string }
  | { type: 'append-pending'; entry: AiHistoryEntry }
  | { type: 'commit-session' }
  | { type: 'discard-session' };

/** Empty history used when the application first loads. */
export const initialDocumentHistoryState: DocumentHistoryState = {
  committed: [],
  pending: [],
  activeSessionId: null,
};

/** Returns a new array ordered from newest to oldest with stable tie-breaking. */
export function sortHistoryEntriesNewestFirst(
  entries: AiHistoryEntry[],
): AiHistoryEntry[] {
  return [...entries].sort(
    (left, right) =>
      right.createdAt - left.createdAt || right.sequence - left.sequence,
  );
}

/** Finds one committed entry without exposing storage details to the UI. */
export function findHistoryEntry(
  entries: AiHistoryEntry[],
  id: string,
): AiHistoryEntry | undefined {
  return entries.find((entry) => entry.id === id);
}

/**
 * Applies one immutable history transition.
 *
 * Pending steps are committed together only after document acceptance, which
 * prevents rejected refinement chains from leaking into visible history.
 */
export function documentHistoryReducer(
  state: DocumentHistoryState,
  action: DocumentHistoryAction,
): DocumentHistoryState {
  switch (action.type) {
    case 'start-session':
      return {
        ...state,
        pending: [],
        activeSessionId: action.sessionId,
      };

    case 'append-pending':
      if (action.entry.sessionId !== state.activeSessionId) return state;

      return {
        ...state,
        pending: [...state.pending, action.entry],
      };

    case 'commit-session':
      return {
        committed: sortHistoryEntriesNewestFirst([
          ...state.committed,
          ...state.pending,
        ]),
        pending: [],
        activeSessionId: null,
      };

    case 'discard-session':
      return {
        ...state,
        pending: [],
        activeSessionId: null,
      };
  }
}
