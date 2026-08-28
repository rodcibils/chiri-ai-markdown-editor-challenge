import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import App from '../../src/App';

const mocks = vi.hoisted(() => ({
  bridge: {
    getMarkdown: vi.fn(() => '# Test document'),
    replaceDocument: vi.fn(),
    replaceSelection: vi.fn(),
    setReadOnly: vi.fn(),
    restoreSelection: vi.fn(),
  },
  downloadMarkdown: vi.fn(),
}));

vi.mock('../../src/components/DocumentEditor', () => ({
  DocumentEditor: ({
    onReady,
    onAiTrigger,
  }: {
    onReady: (bridge: typeof mocks.bridge) => void;
    onAiTrigger: (trigger: {
      kind: 'insertion';
      documentMarkdown: string;
      position: number;
    }) => void;
  }) => {
    useEffect(() => {
      onReady(mocks.bridge);
    }, [onReady]);

    return (
      <button
        type="button"
        onClick={() =>
          onAiTrigger({
            kind: 'insertion',
            documentMarkdown: '# Test document',
            position: 0,
          })
        }
      >
        Ask AI at cursor
      </button>
    );
  },
}));

vi.mock('../../src/download/downloadMarkdown', () => ({
  downloadMarkdown: mocks.downloadMarkdown,
}));

describe('App AI workflow', () => {
  it('downloads the exact current Markdown through the editor bridge', async () => {
    const user = userEvent.setup();
    mocks.bridge.getMarkdown.mockReturnValue('### Current source\n\n✓ saved');
    render(<App />);

    const downloadButton = await screen.findByRole('button', {
      name: 'Download Markdown document',
    });
    await waitFor(() => expect(downloadButton).toBeEnabled());
    await user.click(downloadButton);

    expect(mocks.bridge.getMarkdown).toHaveBeenCalledOnce();
    expect(mocks.downloadMarkdown).toHaveBeenCalledWith(
      '### Current source\n\n✓ saved',
    );
  });

  it('disables download while a modal is open and does not call the provider', async () => {
    const user = userEvent.setup();
    const provider = { generateSuggestion: vi.fn() };
    render(<App suggestionProvider={provider} />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Download Markdown document' }),
      ).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Open editor help' }));

    expect(
      screen.getByRole('button', { name: 'Download Markdown document' }),
    ).toBeDisabled();
    expect(provider.generateSuggestion).not.toHaveBeenCalled();
  });

  it('accepts a mocked suggestion and exposes it in document history', async () => {
    const user = userEvent.setup();
    const provider = {
      generateSuggestion: vi.fn().mockResolvedValue('A generated idea'),
    };
    const historyEnvironment = {
      now: vi.fn().mockReturnValue(100),
      createId: vi
        .fn()
        .mockReturnValueOnce('session-1')
        .mockReturnValueOnce('entry-1'),
    };

    render(
      <App
        suggestionProvider={provider}
        historyEnvironment={historyEnvironment}
        initialMarkdown="# Test document"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ask AI at cursor' }));
    await user.type(screen.getByLabelText('What would you like to write next?'), 'Add an idea');
    await user.click(screen.getByRole('button', { name: 'Generate idea' }));

    expect(await screen.findByText('A generated idea')).toBeInTheDocument();
    expect(provider.generateSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        documentMarkdown: '# Test document',
        targetMarkdown: '',
        instruction: 'Add an idea',
        scope: { kind: 'insertion', position: 0 },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(mocks.bridge.replaceSelection).toHaveBeenCalledWith(
      'A generated idea',
      { from: 0, to: 0 },
    );

    await user.click(screen.getByRole('button', { name: /Open document history/ }));
    await user.click(screen.getByRole('button', { name: /Add an idea/ }));
    expect(screen.getByText('A generated idea')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to history' })).toBeInTheDocument();
  });

  it('keeps the prompt after a provider error so the user can retry', async () => {
    const user = userEvent.setup();
    const provider = {
      generateSuggestion: vi
        .fn()
        .mockRejectedValueOnce(new Error('Offline test failure'))
        .mockResolvedValueOnce('Recovered suggestion'),
    };

    render(<App suggestionProvider={provider} />);
    await user.click(screen.getByRole('button', { name: 'Ask AI at cursor' }));
    const prompt = screen.getByLabelText('What would you like to write next?');
    await user.type(prompt, 'Keep this prompt');
    await user.click(screen.getByRole('button', { name: 'Generate idea' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Offline test failure');
    expect(prompt).toHaveValue('Keep this prompt');
    await user.click(screen.getByRole('button', { name: 'Generate idea' }));
    expect(await screen.findByText('Recovered suggestion')).toBeInTheDocument();
  });

  it('rejects a suggestion without recording history and refines from the latest proposal', async () => {
    const user = userEvent.setup();
    const provider = {
      generateSuggestion: vi
        .fn()
        .mockResolvedValueOnce('Initial proposal')
        .mockResolvedValueOnce('Refined proposal'),
    };
    const historyEnvironment = {
      now: vi.fn().mockReturnValue(100),
      createId: vi
        .fn()
        .mockReturnValueOnce('session-2')
        .mockReturnValueOnce('entry-initial')
        .mockReturnValueOnce('entry-refined'),
    };

    const { unmount } = render(
      <App
        suggestionProvider={provider}
        historyEnvironment={historyEnvironment}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Ask AI at cursor' }));
    await user.type(screen.getByLabelText('What would you like to write next?'), 'Start a section');
    await user.click(screen.getByRole('button', { name: 'Generate idea' }));
    await screen.findByText('Initial proposal');
    await user.click(screen.getByRole('button', { name: 'Refine' }));
    await user.type(screen.getByLabelText('How should the proposal change?'), 'Make it shorter');
    await user.click(screen.getByRole('button', { name: 'Refine suggestion' }));
    await screen.findByText('Refined proposal');

    expect(provider.generateSuggestion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operation: 'refinement',
        documentMarkdown: 'Initial proposal# Test document',
        targetMarkdown: 'Initial proposal',
        instruction: 'Make it shorter',
        scope: { kind: 'selection', from: 0, to: 16 },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await user.click(screen.getByRole('button', { name: /Open document history/ }));
    expect(screen.getByText(/Accepted AI changes will appear here/)).toBeInTheDocument();
    unmount();
  });

  it('accepts repeated insertion refinements at the original editor position', async () => {
    const user = userEvent.setup();
    const provider = {
      generateSuggestion: vi
        .fn()
        .mockResolvedValueOnce('First proposal')
        .mockResolvedValueOnce('Second proposal')
        .mockResolvedValueOnce('Final proposal'),
    };
    const historyEnvironment = {
      now: vi.fn().mockReturnValue(100),
      createId: vi
        .fn()
        .mockReturnValueOnce('session-3')
        .mockReturnValueOnce('entry-initial')
        .mockReturnValueOnce('entry-refinement-1')
        .mockReturnValueOnce('entry-refinement-2'),
    };

    render(
      <App
        suggestionProvider={provider}
        historyEnvironment={historyEnvironment}
        initialMarkdown="# Test document"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Ask AI at cursor' }));
    await user.type(
      screen.getByLabelText('What would you like to write next?'),
      'Initial prompt',
    );
    await user.click(screen.getByRole('button', { name: 'Generate idea' }));
    await screen.findByText('First proposal');

    await user.click(screen.getByRole('button', { name: 'Refine' }));
    await user.type(
      screen.getByLabelText('How should the proposal change?'),
      'First refinement',
    );
    await user.click(screen.getByRole('button', { name: 'Refine suggestion' }));
    await screen.findByText('Second proposal');

    await user.click(screen.getByRole('button', { name: 'Refine' }));
    await user.type(
      screen.getByLabelText('How should the proposal change?'),
      'Final refinement',
    );
    await user.click(screen.getByRole('button', { name: 'Refine suggestion' }));
    await screen.findByText('Final proposal');

    expect(provider.generateSuggestion).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        operation: 'refinement',
        documentMarkdown: 'Second proposal# Test document',
        targetMarkdown: 'Second proposal',
        scope: { kind: 'selection', from: 0, to: 15 },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(mocks.bridge.replaceSelection).toHaveBeenCalledWith(
      'Final proposal',
      { from: 0, to: 0 },
    );

    await user.click(screen.getByRole('button', { name: /Open document history/ }));
    expect(screen.getByText('Initial prompt')).toBeInTheDocument();
    expect(screen.getByText('First refinement')).toBeInTheDocument();
    expect(screen.getByText('Final refinement')).toBeInTheDocument();
  });
});
