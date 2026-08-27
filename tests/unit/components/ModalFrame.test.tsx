import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ModalFrame } from '../../../src/components/ModalFrame';

describe('ModalFrame', () => {
  it('labels the dialog, focuses the preferred control, traps Tab, and closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ModalFrame
        titleId="test-title"
        kicker="TEST"
        title="Test modal"
        closeLabel="Close test modal"
        onClose={onClose}
      >
        <button type="button" data-modal-initial-focus>
          Primary
        </button>
        <button type="button">Secondary</button>
      </ModalFrame>,
    );

    expect(screen.getByRole('dialog', { name: 'Test modal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close test modal' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
