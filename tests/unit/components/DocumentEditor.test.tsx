import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentEditor } from '../../../src/components/DocumentEditor';

const mocks = vi.hoisted(() => ({
  constructors: [] as Array<{ root: HTMLDivElement; defaultValue: string }>,
  creates: [] as Array<() => Promise<void>>,
  destroys: [] as Array<() => Promise<void>>,
  setReadonly: vi.fn(),
  measure: vi.fn(() => ({ left: 4, top: 4, lineHeight: 18 })),
}));

vi.mock('@milkdown/crepe', () => ({
  Crepe: class {
    private readonly createHandler = vi.fn(async () => undefined);
    private readonly destroyHandler = vi.fn(async () => undefined);

    constructor(options: { root: HTMLDivElement; defaultValue: string }) {
      mocks.constructors.push(options);
      mocks.creates.push(this.createHandler);
      mocks.destroys.push(this.destroyHandler);
    }

    create = this.createHandler;
    destroy = this.destroyHandler;
    setReadonly = mocks.setReadonly;
  },
  CrepeFeature: {
    Cursor: 'cursor',
    ListItem: 'list-item',
    LinkTooltip: 'link-tooltip',
    ImageBlock: 'image-block',
    BlockEdit: 'block-edit',
    Placeholder: 'placeholder',
    Toolbar: 'toolbar',
    CodeMirror: 'code-mirror',
    Table: 'table',
    Latex: 'latex',
    TopBar: 'top-bar',
    AI: 'ai',
  },
}));

vi.mock('../../../src/editor/measureTextareaOffset', () => ({
  measureTextareaOffset: mocks.measure,
}));

describe('DocumentEditor', () => {
  beforeEach(() => {
    mocks.constructors.length = 0;
    mocks.creates.length = 0;
    mocks.destroys.length = 0;
    mocks.setReadonly.mockClear();
    mocks.measure.mockClear();
  });

  it('creates a read-only preview and exposes the editor bridge', async () => {
    const onReady = vi.fn();
    const onAiTrigger = vi.fn();
    render(
      <DocumentEditor
        defaultMarkdown="hello"
        contextualActionsEnabled
        onReady={onReady}
        onAiTrigger={onAiTrigger}
      />,
    );

    expect(mocks.constructors).toHaveLength(1);
    expect(mocks.constructors[0].defaultValue).toBe('hello');
    const textarea = screen.getByRole('textbox', { name: 'Raw Markdown source' });
    Object.defineProperties(textarea, {
      clientHeight: { configurable: true, value: 300 },
      clientWidth: { configurable: true, value: 300 },
    });
    fireEvent.focus(textarea);
    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(onAiTrigger).not.toHaveBeenCalled();
  });

  it('shows a selection trigger and exposes bridge replacement operations', async () => {
    const onReady = vi.fn();
    const onAiTrigger = vi.fn();
    const user = userEvent.setup();
    render(
      <DocumentEditor
        defaultMarkdown="hello world"
        contextualActionsEnabled
        onReady={onReady}
        onAiTrigger={onAiTrigger}
      />,
    );
    const textarea = screen.getByRole('textbox', { name: 'Raw Markdown source' });
    Object.defineProperties(textarea, {
      clientHeight: { configurable: true, value: 300 },
      clientWidth: { configurable: true, value: 300 },
    });

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    act(() => {
      textarea.setSelectionRange(0, 5, 'forward');
      fireEvent.select(textarea);
    });
    await user.click(
      screen.getByRole('button', { name: 'Ask AI to improve the selected text' }),
    );
    expect(onAiTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'selection',
        selectedMarkdown: 'hello',
        from: 0,
        to: 5,
      }),
    );

    const bridge = onReady.mock.calls[0][0] as {
      replaceSelection: (value: string, range: { from: number; to: number }) => void;
      replaceDocument: (value: string) => void;
      setReadOnly: (value: boolean) => void;
    };
    act(() => bridge.replaceSelection('hi', { from: 0, to: 5 }));
    expect(textarea).toHaveValue('hi world');
    act(() => bridge.replaceDocument('replacement'));
    expect(textarea).toHaveValue('replacement');
    act(() => bridge.setReadOnly(true));
    expect(textarea).toHaveAttribute('readonly');
  });
});
