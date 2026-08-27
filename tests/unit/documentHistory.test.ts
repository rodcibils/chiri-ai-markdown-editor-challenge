import { describe, expect, it } from 'vitest';

import {
  documentHistoryReducer,
  findHistoryEntry,
  initialDocumentHistoryState,
  sortHistoryEntriesNewestFirst,
} from '../../src/history/documentHistory';
import type { AiHistoryEntry } from '../../src/types';

const entry = (
  id: string,
  createdAt: number,
  sessionId = 'session',
  sequence = createdAt,
): AiHistoryEntry => ({
  id,
  sequence,
  createdAt,
  prompt: id,
  inputMarkdown: id,
  outputMarkdown: `${id}!`,
  scope: { kind: 'insertion', position: 0 },
  sessionId,
  stepIndex: 0,
});

describe('documentHistoryReducer', () => {
  it('starts a clean pending session without changing committed entries', () => {
    const committed = [entry('old', 1)];
    const state = {
      committed,
      pending: [entry('stale', 2)],
      activeSessionId: 'stale-session',
    };

    expect(
      documentHistoryReducer(state, {
        type: 'start-session',
        sessionId: 'new-session',
      }),
    ).toEqual({
      committed,
      pending: [],
      activeSessionId: 'new-session',
    });
  });

  it('ignores entries from inactive sessions and appends active entries immutably', () => {
    const state = {
      ...initialDocumentHistoryState,
      activeSessionId: 'active',
    };
    const active = entry('active-entry', 10, 'active');
    const inactive = entry('inactive-entry', 11, 'other');

    expect(documentHistoryReducer(state, {
      type: 'append-pending',
      entry: inactive,
    })).toBe(state);

    const next = documentHistoryReducer(state, {
      type: 'append-pending',
      entry: active,
    });
    expect(next.pending).toEqual([active]);
    expect(state.pending).toEqual([]);
  });

  it('commits all pending steps newest first and clears the session', () => {
    const state = {
      committed: [entry('older', 5, 'previous')],
      pending: [entry('initial', 10), entry('refinement', 20)],
      activeSessionId: 'session',
    };

    expect(documentHistoryReducer(state, { type: 'commit-session' })).toEqual({
      committed: [state.pending[1], state.pending[0], state.committed[0]],
      pending: [],
      activeSessionId: null,
    });
  });

  it('discards pending work without touching committed history', () => {
    const committed = [entry('accepted', 10)];
    const state = {
      committed,
      pending: [entry('pending', 20)],
      activeSessionId: 'session',
    };

    expect(documentHistoryReducer(state, { type: 'discard-session' })).toEqual({
      committed,
      pending: [],
      activeSessionId: null,
    });
  });
});

describe('history helpers', () => {
  it('sorts by timestamp and then sequence without mutating input', () => {
    const entries = [entry('first', 100, 'a', 1), entry('second', 100, 'a', 2)];
    const sorted = sortHistoryEntriesNewestFirst(entries);

    expect(sorted.map((item) => item.id)).toEqual(['second', 'first']);
    expect(entries.map((item) => item.id)).toEqual(['first', 'second']);
  });

  it('finds entries by ID and returns undefined when missing', () => {
    const entries = [entry('found', 1)];

    expect(findHistoryEntry(entries, 'found')).toBe(entries[0]);
    expect(findHistoryEntry(entries, 'missing')).toBeUndefined();
  });
});
