/** Stable filename used for browser downloads from the Markdown editor. */
export const MARKDOWN_DOWNLOAD_FILENAME = 'chiri-document.md';

const MARKDOWN_MIME_TYPE = 'text/markdown;charset=utf-8';

/**
 * Downloads the supplied raw Markdown as a local file.
 *
 * @param markdown Exact source text currently held by the editor.
 * @returns Nothing; the browser owns the resulting download.
 */
export function downloadMarkdown(markdown: string): void {
  const file = new Blob([markdown], { type: MARKDOWN_MIME_TYPE });
  const objectUrl = URL.createObjectURL(file);
  let anchor: HTMLAnchorElement | null = null;

  try {
    anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = MARKDOWN_DOWNLOAD_FILENAME;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    // Remove the temporary node even when a browser rejects the click.
    anchor?.remove();

    // Let the browser begin the download before releasing its object URL.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
