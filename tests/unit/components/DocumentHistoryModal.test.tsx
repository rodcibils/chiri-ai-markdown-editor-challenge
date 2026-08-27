import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DocumentHistoryModal } from '../../../src/components/DocumentHistoryModal';
import type { AiHistoryEntry } from '../../../src/types';

const entries: AiHistoryEntry[] = [
  {
    id: 'new',
    sequence: 2,
    createdAt: Date.UTC(2026, 0, 2, 3, 4),
    prompt: 'Make this much clearer',
    inputMarkdown: 'old',
    outputMarkdown: 'new',
    scope: { kind: 'selection', from: 0, to: 3 },
    sessionId: 'session',
    stepIndex: 1,
  },
  {
    id: 'old',
    sequence: 1,
    createdAt: Date.UTC(2026, 0, 1, 3, 4),
    prompt: 'Add detail',
    inputMarkdown: '',
    outputMarkdown: 'detail',
    scope: { kind: 'insertion', position: 0 },
    sessionId: 'session',
    stepIndex: 0,
  },
];

describe('DocumentHistoryModal', () => {
  it('renders an empty state when no accepted entries exist', () => {
    render(
      <DocumentHistoryModal
        entries={[]}
        initialScrollTop={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Accepted AI changes/)).toBeInTheDocument();
  });

  it('opens the selected entry and restores the requested list scroll', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <DocumentHistoryModal
        entries={entries}
        initialScrollTop={42}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(3);
    await user.click(rows[2]);
    expect(onSelect).toHaveBeenCalledWith('old', expect.any(Number));
    expect(screen.getByText('Make this much clearer')).toBeInTheDocument();
  });
});
