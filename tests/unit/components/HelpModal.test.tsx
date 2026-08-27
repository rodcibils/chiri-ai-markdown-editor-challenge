import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { HelpModal } from '../../../src/components/HelpModal';

describe('HelpModal', () => {
  it('explains the contextual workflow and closes from its action', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HelpModal onClose={onClose} />);

    expect(screen.getByText('Continue writing')).toBeInTheDocument();
    expect(screen.getByText('Improve text')).toBeInTheDocument();
    expect(screen.queryByText(/OpenRouter API key/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
