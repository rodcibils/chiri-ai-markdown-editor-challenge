import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SuggestionDiff } from '../../../src/components/SuggestionDiff';

describe('SuggestionDiff', () => {
  it('renders labeled input and output columns with diff classes', () => {
    render(
      <SuggestionDiff
        originalMarkdown="old wording"
        proposedMarkdown="new wording"
        originalLabel="Input"
        proposedLabel="Output"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Input' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Output' })).toBeInTheDocument();
    expect(document.querySelector('.diff-removed')).toHaveTextContent('old');
    expect(document.querySelector('.diff-added')).toHaveTextContent('new');
  });

  it('shows a no-change status and insertion placeholder', () => {
    const { rerender } = render(
      <SuggestionDiff originalMarkdown="same" proposedMarkdown="same" />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('No changes suggested.');

    rerender(
      <SuggestionDiff
        originalMarkdown=""
        proposedMarkdown="new idea"
        emptyOriginalMessage="No input text — insertion point"
      />,
    );
    expect(screen.getByText('No input text — insertion point')).toBeInTheDocument();
  });
});
