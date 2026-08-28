import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  downloadMarkdown,
  MARKDOWN_DOWNLOAD_FILENAME,
} from '../../src/download/downloadMarkdown';

describe('downloadMarkdown', () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectUrl = vi.fn(() => 'blob:markdown-download');
    revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();

    if (originalCreateObjectUrl) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      });
    } else {
      delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
    }

    if (originalRevokeObjectUrl) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    } else {
      delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
    document.body.replaceChildren();
  });

  it('downloads exact Markdown with the fixed filename and MIME type', async () => {
    vi.useFakeTimers();
    let clickedAnchor: HTMLAnchorElement | undefined;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {
        clickedAnchor = document.body.querySelector('a') ?? undefined;
      });
    const markdown = '# Café\n\n- first\n- second\n';

    downloadMarkdown(markdown);

    expect(createObjectUrl).toHaveBeenCalledOnce();
    const [file] = createObjectUrl.mock.calls[0] as [Blob];
    expect(file.type).toBe('text/markdown;charset=utf-8');
    expect(clickedAnchor).toBeDefined();
    expect(clickedAnchor?.download).toBe(MARKDOWN_DOWNLOAD_FILENAME);
    expect(clickedAnchor?.href).toBe('blob:markdown-download');
    expect(click).toHaveBeenCalledOnce();
    expect(document.body.querySelector('a')).toBeNull();
    expect(await file.text()).toBe(markdown);

    expect(revokeObjectUrl).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:markdown-download');
  });

  it('supports an empty document', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    downloadMarkdown('');

    const [file] = createObjectUrl.mock.calls[0] as [Blob];
    expect(await file.text()).toBe('');
    expect(click).toHaveBeenCalledOnce();
  });

  it('removes the anchor and schedules URL cleanup when clicking throws', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('Browser download failed');
    });

    expect(() => downloadMarkdown('content')).toThrow('Browser download failed');
    expect(document.body.querySelector('a')).toBeNull();

    vi.runAllTimers();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:markdown-download');
  });
});
