import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HistoryDetailModal } from '../../../src/components/HistoryDetailModal';
import type { AiHistoryEntry } from '../../../src/types';

const entry: AiHistoryEntry = {
  id: 'detail',
  sequence: 1,
  createdAt: Date.UTC(2026, 0, 2, 3, 4),
  prompt: 'Rewrite this section with more context',
  inputMarkdown: 'Before',
  outputMarkdown: 'After',
  scope: { kind: 'selection', from: 0, to: 6 },
  sessionId: 'session',
  stepIndex: 0,
};

describe('HistoryDetailModal', () => {
  it('shows prompt, generated timestamp, diff, and navigation actions', () => {
    const onBack = vi.fn();
    render(
      <HistoryDetailModal
        entry={entry}
        onBack={onBack}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(entry.prompt)).toBeInTheDocument();
    expect(screen.getByText('Generated')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Input' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Output' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to history' })).toBeInTheDocument();
  });
});
