import { useMemo } from 'react';

import { computeDiff } from '../diff/computeDiff';
import type { DiffSegment } from '../types';

interface SuggestionDiffProps {
  originalMarkdown: string;
  proposedMarkdown: string;
  originalLabel?: string;
  proposedLabel?: string;
  emptyOriginalMessage?: string;
}

/** Renders a shared-scroll comparison used by live review and history details. */
export function SuggestionDiff({
  originalMarkdown,
  proposedMarkdown,
  originalLabel = 'Existing text',
  proposedLabel = 'AI suggestion',
  emptyOriginalMessage,
}: SuggestionDiffProps) {
  const segments = useMemo(
    () => computeDiff(originalMarkdown, proposedMarkdown),
    [originalMarkdown, proposedMarkdown],
  );
  const hasChanges = segments.some((segment) => segment.type !== 'unchanged');

  if (!hasChanges) {
    return (
      <p className="diff-no-change" role="status">
        No changes suggested.
      </p>
    );
  }

  return (
    <div className="diff-columns">
      <DiffColumn
        title={originalLabel}
        segments={segments}
        side="original"
        emptyMessage={emptyOriginalMessage}
      />
      <DiffColumn
        title={proposedLabel}
        segments={segments}
        side="proposed"
      />
    </div>
  );
}

interface DiffColumnProps {
  title: string;
  segments: DiffSegment[];
  side: 'original' | 'proposed';
  emptyMessage?: string;
}

/** Renders one filtered side of an original/proposed Markdown comparison. */
function DiffColumn({
  title,
  segments,
  side,
  emptyMessage,
}: DiffColumnProps) {
  const visibleSegments = segments.filter((segment) =>
    side === 'original'
      ? segment.type !== 'added'
      : segment.type !== 'removed',
  );

  return (
    <div className="diff-column">
      <h3>{title}</h3>
      <div className="diff-content">
        {emptyMessage && side === 'original' ? (
          <span className="diff-placeholder">{emptyMessage}</span>
        ) : (
          visibleSegments.map((segment, index) => (
            <span
              key={`${segment.type}-${index}`}
              className={`diff-${segment.type}`}
            >
              {segment.value}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
