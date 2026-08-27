/** Coordinates for a source offset inside a textarea's border box. */
export interface TextareaOffsetPosition {
  left: number;
  top: number;
  lineHeight: number;
}

const mirroredProperties = [
  'border-bottom-width',
  'border-left-width',
  'border-right-width',
  'border-top-width',
  'box-sizing',
  'direction',
  'font-family',
  'font-size',
  'font-style',
  'font-variant',
  'font-weight',
  'letter-spacing',
  'line-height',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'tab-size',
  'text-align',
  'text-indent',
  'text-rendering',
  'text-transform',
  'word-break',
  'word-spacing',
] as const;

/**
 * Measures a character offset by mirroring the textarea's wrapping rules.
 *
 * @param textarea Source textarea whose text and styles should be measured.
 * @param offset Normalized string offset to locate inside the source value.
 * @returns Position relative to the textarea, adjusted for its current scroll.
 */
export function measureTextareaOffset(
  textarea: HTMLTextAreaElement,
  offset: number,
): TextareaOffsetPosition {
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const marker = document.createElement('span');
  const normalizedOffset = Math.max(0, Math.min(offset, textarea.value.length));

  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.position = 'fixed';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.left = '-10000px';
  mirror.style.top = '0';
  mirror.style.width = `${textarea.offsetWidth}px`;
  mirror.style.height = 'auto';
  mirror.style.minHeight = '0';
  mirror.style.overflow = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';

  // Mirroring text metrics and box spacing keeps wrapped offsets aligned.
  mirroredProperties.forEach((property) => {
    mirror.style.setProperty(property, computed.getPropertyValue(property));
  });

  mirror.textContent = textarea.value.slice(0, normalizedOffset);
  marker.textContent = textarea.value.slice(normalizedOffset) || '\u200b';
  mirror.append(marker);
  document.body.append(mirror);

  const markerRect = marker.getBoundingClientRect();
  const parsedLineHeight = Number.parseFloat(computed.lineHeight);
  const lineHeight = Number.isFinite(parsedLineHeight)
    ? parsedLineHeight
    : markerRect.height;
  const position = {
    // offsetLeft/Top identify the span's first fragment when its text wraps.
    left: marker.offsetLeft - textarea.scrollLeft,
    top: marker.offsetTop - textarea.scrollTop,
    lineHeight,
  };

  mirror.remove();
  return position;
}
