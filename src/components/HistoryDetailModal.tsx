import { useMemo } from 'react';

import {
  formatHistoryTimestamp,
  toHistoryDateTime,
} from '../history/formatHistoryTimestamp';
import type { AiHistoryEntry } from '../types';
import { ModalFrame } from './ModalFrame';
import { SuggestionDiff } from './SuggestionDiff';

interface HistoryDetailModalProps {
  entry: AiHistoryEntry;
  onBack: () => void;
  onClose: () => void;
}

/** Shows the complete prompt and scoped input/output diff for one accepted step. */
export function HistoryDetailModal({
  entry,
  onBack,
  onClose,
}: HistoryDetailModalProps) {
  const timestampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'full',
        timeStyle: 'long',
      }),
    [],
  );
  const timestamp = formatHistoryTimestamp(
    entry.createdAt,
    timestampFormatter,
  );

  return (
    <ModalFrame
      titleId="history-detail-title"
      kicker="ACCEPTED AI CHANGE"
      title="AI change details"
      closeLabel="Close AI change details"
      className="ai-modal-review history-detail-modal"
      onClose={onClose}
    >
      <div className="modal-body review-body history-detail-body">
        <div className="history-detail-metadata">
          <div className="history-detail-field">
            <span>Prompt</span>
            <p>{entry.prompt}</p>
          </div>
          <div className="history-detail-field">
            <span>Generated</span>
            <time dateTime={toHistoryDateTime(entry.createdAt)}>
              {timestamp}
            </time>
          </div>
        </div>

        <SuggestionDiff
          originalMarkdown={entry.inputMarkdown}
          proposedMarkdown={entry.outputMarkdown}
          originalLabel="Input"
          proposedLabel="Output"
          emptyOriginalMessage={
            entry.scope.kind === 'insertion' && !entry.inputMarkdown
              ? 'No input text — insertion point'
              : undefined
          }
        />

        <div className="modal-actions review-actions history-detail-actions">
          <button
            type="button"
            className="secondary-button"
            data-modal-initial-focus
            onClick={onBack}
          >
            Back to history
          </button>
        </div>
      </div>
    </ModalFrame>
  );
}
