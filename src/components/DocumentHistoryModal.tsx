import { useEffect, useMemo, useRef } from 'react';

import {
  formatHistoryTimestamp,
  toHistoryDateTime,
} from '../history/formatHistoryTimestamp';
import type { AiHistoryEntry } from '../types';
import { ModalFrame } from './ModalFrame';

interface DocumentHistoryModalProps {
  entries: AiHistoryEntry[];
  initialScrollTop: number;
  onSelect: (entryId: string, scrollTop: number) => void;
  onClose: () => void;
}

/** Displays accepted AI steps in newest-first order for the current session. */
export function DocumentHistoryModal({
  entries,
  initialScrollTop,
  onSelect,
  onClose,
}: DocumentHistoryModalProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const timestampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    [],
  );

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = initialScrollTop;
    }
  }, [initialScrollTop]);

  return (
    <ModalFrame
      titleId="history-modal-title"
      kicker="AI CHANGE LOG"
      title="Document History"
      closeLabel="Close document history"
      className="history-modal"
      onClose={onClose}
    >
      <div ref={listRef} className="modal-body history-list-body">
        {entries.length === 0 ? (
          <p className="history-empty-state">
            Accepted AI changes will appear here during this session.
          </p>
        ) : (
          <ul className="history-list">
            {entries.map((entry, index) => {
              const timestamp = formatHistoryTimestamp(
                entry.createdAt,
                timestampFormatter,
              );

              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="history-row"
                    data-modal-initial-focus={index === 0 ? true : undefined}
                    onClick={() =>
                      onSelect(entry.id, listRef.current?.scrollTop ?? 0)
                    }
                  >
                    <time dateTime={toHistoryDateTime(entry.createdAt)}>
                      {timestamp}
                    </time>
                    <span className="history-row-prompt">{entry.prompt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ModalFrame>
  );
}
