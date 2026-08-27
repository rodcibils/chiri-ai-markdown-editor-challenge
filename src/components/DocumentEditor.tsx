import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/kit/utils';
import { useCallback, useEffect, useRef, useState } from 'react';

import { measureTextareaOffset } from '../editor/measureTextareaOffset';
import type {
  ContextualAiTrigger,
  TextSelectionDirection,
} from '../types';
import { LightbulbIcon } from './icons';

const AI_TRIGGER_IDLE_MS = 1_000;
const TRIGGER_BUTTON_SIZE = 40;
const TRIGGER_GAP = 8;
const TRIGGER_EDGE_MARGIN = 8;
const CARET_VISIBILITY_MARGIN = 32;
const PREVIEW_UPDATE_DELAY_MS = 150;

interface SelectionRange {
  from: number;
  to: number;
  direction?: TextSelectionDirection;
}

interface TriggerAnchor {
  left: number;
  top: number;
}

type EditorTriggerDescriptor =
  | {
      kind: 'insertion';
      position: number;
    }
  | {
      kind: 'selection';
      from: number;
      to: number;
      direction: TextSelectionDirection;
    };

type EditorTrigger = EditorTriggerDescriptor & {
  anchor: TriggerAnchor | null;
};

/** Imperative operations the parent needs after the split editor has mounted. */
export interface EditorBridge {
  /** Replace the entire raw Markdown document and focus its new endpoint. */
  replaceDocument(markdown: string): void;
  /** Replace one captured source range and focus the end of the new text. */
  replaceSelection(markdown: string, range: SelectionRange): void;
  /** Toggle editing while a modal suggestion workflow is active. */
  setReadOnly(value: boolean): void;
  /** Restore focus and a previously captured caret or selection range. */
  restoreSelection(range: SelectionRange): void;
}

/** Props used by the raw Markdown editor and its rendered preview. */
interface DocumentEditorProps {
  /** Markdown loaded when the editor is first mounted. */
  defaultMarkdown: string;
  /** Whether contextual AI actions may currently be displayed. */
  contextualActionsEnabled: boolean;
  /** Called once editor operations are ready for the parent workflow. */
  onReady(bridge: EditorBridge): void;
  /** Called with an immutable snapshot when a lightbulb action is activated. */
  onAiTrigger(trigger: ContextualAiTrigger): void;
}

/** Renders raw Markdown beside a synchronized, read-only Crepe preview. */
export function DocumentEditor({
  defaultMarkdown,
  contextualActionsEnabled,
  onReady,
  onAiTrigger,
}: DocumentEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const idleTimerRef = useRef<number | null>(null);
  const hasFocusRef = useRef(false);
  const pointerSelectingRef = useRef(false);
  const readOnlyRef = useRef(false);
  const actionsEnabledRef = useRef(contextualActionsEnabled);
  const [rawMarkdown, setRawMarkdown] = useState(defaultMarkdown);
  const [readOnly, setReadOnly] = useState(false);
  const [trigger, setTrigger] = useState<EditorTrigger | null>(null);

  /** Cancels the pending insertion suggestion timer, if one exists. */
  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current === null) return;

    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }, []);

  /** Removes every pending or visible contextual action. */
  const hideContextualTrigger = useCallback(() => {
    clearIdleTimer();
    setTrigger(null);
  }, [clearIdleTimer]);

  /**
   * Converts a source offset into a clamped button position in the textarea.
   * The action prefers the space below the cursor and flips above when needed.
   */
  const calculateTriggerAnchor = useCallback(
    (textarea: HTMLTextAreaElement, offset: number): TriggerAnchor | null => {
      const measured = measureTextareaOffset(textarea, offset);
      const cursorBottom = measured.top + measured.lineHeight;
      const cursorIsVisible =
        cursorBottom >= 0 && measured.top <= textarea.clientHeight;

      if (!cursorIsVisible) return null;

      const maximumLeft = Math.max(
        TRIGGER_EDGE_MARGIN,
        textarea.clientWidth - TRIGGER_BUTTON_SIZE - TRIGGER_EDGE_MARGIN,
      );
      const maximumTop = Math.max(
        TRIGGER_EDGE_MARGIN,
        textarea.clientHeight - TRIGGER_BUTTON_SIZE - TRIGGER_EDGE_MARGIN,
      );
      const preferredTop = cursorBottom + TRIGGER_GAP;
      const top = preferredTop + TRIGGER_BUTTON_SIZE <= textarea.clientHeight
        ? preferredTop
        : measured.top - TRIGGER_BUTTON_SIZE - TRIGGER_GAP;

      return {
        left: Math.min(
          maximumLeft,
          Math.max(TRIGGER_EDGE_MARGIN, measured.left + TRIGGER_GAP),
        ),
        top: Math.min(maximumTop, Math.max(TRIGGER_EDGE_MARGIN, top)),
      };
    },
    [],
  );

  /** Displays a contextual action for an insertion point or selected range. */
  const showTrigger = useCallback(
    (nextTrigger: EditorTriggerDescriptor) => {
      const textarea = textareaRef.current;
      if (!textarea || !actionsEnabledRef.current || readOnlyRef.current) return;

      const activeOffset = nextTrigger.kind === 'selection'
        ? nextTrigger.direction === 'backward'
          ? nextTrigger.from
          : nextTrigger.to
        : nextTrigger.position;

      setTrigger({
        ...nextTrigger,
        anchor: calculateTriggerAnchor(textarea, activeOffset),
      });
    },
    [calculateTriggerAnchor],
  );

  /** Repositions an existing action after scrolling or resizing. */
  const refreshTriggerPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    setTrigger((current) => {
      if (!current) return current;

      const activeOffset = current.kind === 'selection'
        ? current.direction === 'backward'
          ? current.from
          : current.to
        : current.position;

      return {
        ...current,
        anchor: calculateTriggerAnchor(textarea, activeOffset),
      };
    });
  }, [calculateTriggerAnchor]);

  /** Starts a fresh idle countdown for the textarea's current caret. */
  const scheduleInsertionTrigger = useCallback(
    (textarea: HTMLTextAreaElement) => {
      clearIdleTimer();
      setTrigger(null);

      if (
        !hasFocusRef.current ||
        !actionsEnabledRef.current ||
        readOnlyRef.current ||
        textarea.selectionStart !== textarea.selectionEnd
      ) {
        return;
      }

      const scheduledPosition = textarea.selectionEnd;
      const scheduledMarkdown = textarea.value;

      idleTimerRef.current = window.setTimeout(() => {
        idleTimerRef.current = null;

        const currentTextarea = textareaRef.current;
        const contextIsUnchanged =
          currentTextarea === textarea &&
          document.activeElement === textarea &&
          currentTextarea.value === scheduledMarkdown &&
          currentTextarea.selectionStart === scheduledPosition &&
          currentTextarea.selectionEnd === scheduledPosition;

        if (
          !contextIsUnchanged ||
          !actionsEnabledRef.current ||
          readOnlyRef.current
        ) {
          return;
        }

        showTrigger({ kind: 'insertion', position: scheduledPosition });
      }, AI_TRIGGER_IDLE_MS);
    },
    [clearIdleTimer, showTrigger],
  );

  /** Shows a selection action or schedules an insertion action as appropriate. */
  const finalizeSelectionInteraction = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || pointerSelectingRef.current) return;

    clearIdleTimer();
    if (textarea.selectionStart < textarea.selectionEnd) {
      showTrigger({
        kind: 'selection',
        from: textarea.selectionStart,
        to: textarea.selectionEnd,
        direction: textarea.selectionDirection,
      });
      return;
    }

    scheduleInsertionTrigger(textarea);
  }, [clearIdleTimer, scheduleInsertionTrigger, showTrigger]);

  useEffect(() => {
    actionsEnabledRef.current = contextualActionsEnabled;
    if (!contextualActionsEnabled) {
      clearIdleTimer();
      return;
    }

    // Modal focus restoration can finish before this prop becomes enabled.
    const frame = window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (textarea && document.activeElement === textarea) {
        hasFocusRef.current = true;
        finalizeSelectionInteraction();
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    clearIdleTimer,
    contextualActionsEnabled,
    finalizeSelectionInteraction,
  ]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const observer = new ResizeObserver(refreshTriggerPosition);
    observer.observe(textarea);
    window.addEventListener('resize', refreshTriggerPosition);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', refreshTriggerPosition);
    };
  }, [refreshTriggerPosition]);

  useEffect(() => {
    return () => clearIdleTimer();
  }, [clearIdleTimer]);

  useEffect(() => {
    /** Scrolls only the textarea when its active selection endpoint is hidden. */
    const revealSelectionEndpoint = (
      textarea: HTMLTextAreaElement,
      range: SelectionRange,
    ) => {
      const activeOffset = range.direction === 'backward'
        ? range.from
        : range.to;
      const measured = measureTextareaOffset(textarea, activeOffset);
      const visibleBottom = textarea.clientHeight - CARET_VISIBILITY_MARGIN;
      const visibleRight = textarea.clientWidth - CARET_VISIBILITY_MARGIN;
      const cursorBottom = measured.top + measured.lineHeight;

      if (measured.top < CARET_VISIBILITY_MARGIN) {
        textarea.scrollTop += measured.top - CARET_VISIBILITY_MARGIN;
      } else if (cursorBottom > visibleBottom) {
        textarea.scrollTop += cursorBottom - visibleBottom;
      }

      if (measured.left < CARET_VISIBILITY_MARGIN) {
        textarea.scrollLeft += measured.left - CARET_VISIBILITY_MARGIN;
      } else if (measured.left > visibleRight) {
        textarea.scrollLeft += measured.left - visibleRight;
      }
    };

    /** Focuses a normalized source range after React commits a value update. */
    const restoreSelection = (range: SelectionRange) => {
      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        // Prevent the browser from scrolling an ancestor before we reveal the caret.
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(
          range.from,
          range.to,
          range.direction ?? 'none',
        );
        revealSelectionEndpoint(textarea, range);
      });
    };

    onReady({
      replaceDocument: (value) => {
        setRawMarkdown(value);
        restoreSelection({ from: value.length, to: value.length });
      },
      replaceSelection: (value, range) => {
        // String offsets match textarea selections and support zero-width inserts.
        const current = textareaRef.current?.value ?? '';
        const next = [
          current.slice(0, range.from),
          value,
          current.slice(range.to),
        ].join('');
        const nextPosition = range.from + value.length;

        setRawMarkdown(next);
        restoreSelection({ from: nextPosition, to: nextPosition });
      },
      setReadOnly: (value) => {
        readOnlyRef.current = value;
        setReadOnly(value);
        if (value) hideContextualTrigger();
      },
      restoreSelection,
    });
  }, [hideContextualTrigger, onReady]);

  /** Updates the raw source and restarts the contextual insertion countdown. */
  const updateMarkdown = (textarea: HTMLTextAreaElement) => {
    setRawMarkdown(textarea.value);
    scheduleInsertionTrigger(textarea);
  };

  /** Opens the AI workflow with a snapshot of the visible trigger context. */
  const activateTrigger = () => {
    const textarea = textareaRef.current;
    if (!textarea || !trigger) return;

    const nextTrigger: ContextualAiTrigger = trigger.kind === 'selection'
      ? {
          kind: 'selection',
          documentMarkdown: textarea.value,
          selectedMarkdown: textarea.value.slice(trigger.from, trigger.to),
          from: trigger.from,
          to: trigger.to,
          direction: trigger.direction,
        }
      : {
          kind: 'insertion',
          documentMarkdown: textarea.value,
          position: trigger.position,
        };

    hideContextualTrigger();
    onAiTrigger(nextTrigger);
  };

  const triggerLabel = trigger?.kind === 'selection'
    ? 'Ask AI to improve the selected text'
    : 'Ask AI for an idea at the cursor';

  return (
    <div className="editor-split">
      <div className="editor-pane editor-source-pane">
        <div className="pane-label">RAW MARKDOWN</div>
        <div className="source-editor-surface">
          <textarea
            ref={textareaRef}
            className="markdown-source"
            value={rawMarkdown}
            readOnly={readOnly}
            spellCheck={false}
            aria-label="Raw Markdown source"
            onChange={(event) => updateMarkdown(event.currentTarget)}
            onFocus={() => {
              hasFocusRef.current = true;
              finalizeSelectionInteraction();
            }}
            onBlur={(event) => {
              if (event.relatedTarget === triggerButtonRef.current) return;

              hasFocusRef.current = false;
              hideContextualTrigger();
            }}
            onKeyDown={(event) => {
              // Preserve the button while Tab moves keyboard focus to it.
              if (event.key !== 'Tab') hideContextualTrigger();
            }}
            onKeyUp={finalizeSelectionInteraction}
            onSelect={() => {
              if (!pointerSelectingRef.current) {
                finalizeSelectionInteraction();
              }
            }}
            onPointerDown={() => {
              pointerSelectingRef.current = true;
              hideContextualTrigger();
            }}
            onPointerUp={() => {
              pointerSelectingRef.current = false;
              finalizeSelectionInteraction();
            }}
            onPointerCancel={() => {
              pointerSelectingRef.current = false;
              finalizeSelectionInteraction();
            }}
            onScroll={refreshTriggerPosition}
          />

          {contextualActionsEnabled && trigger?.anchor && (
            <button
              ref={triggerButtonRef}
              type="button"
              className="contextual-ai-button"
              style={{
                left: `${trigger.anchor.left}px`,
                top: `${trigger.anchor.top}px`,
              }}
              aria-label={triggerLabel}
              title={triggerLabel}
              onPointerDown={(event) => event.preventDefault()}
              onClick={activateTrigger}
              onBlur={(event) => {
                if (event.relatedTarget !== textareaRef.current) {
                  hideContextualTrigger();
                }
              }}
            >
              <LightbulbIcon className="contextual-ai-icon" />
            </button>
          )}
        </div>
      </div>

      <div className="editor-pane editor-preview-pane">
        <div className="pane-label">RENDERED PREVIEW</div>
        <MarkdownPreview markdown={rawMarkdown} />
      </div>
    </div>
  );
}

interface MarkdownPreviewProps {
  markdown: string;
}

/** Maintains a read-only Crepe view and coalesces source updates. */
function MarkdownPreview({ markdown }: MarkdownPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const initialMarkdownRef = useRef(markdown);
  const latestMarkdownRef = useRef(markdown);
  const appliedMarkdownRef = useRef<string | null>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const previewReadyRef = useRef(false);

  /** Replaces only the preview document while preserving its Crepe instance. */
  const applyPreviewMarkdown = useCallback((nextMarkdown: string) => {
    const crepe = crepeRef.current;
    if (
      !crepe ||
      !previewReadyRef.current ||
      appliedMarkdownRef.current === nextMarkdown
    ) {
      return;
    }

    // Flush the read-only state so preview updates do not accumulate undo history.
    crepe.editor.action(replaceAll(nextMarkdown, true));
    appliedMarkdownRef.current = nextMarkdown;
  }, []);

  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;

    const crepe = new Crepe({
      root,
      defaultValue: initialMarkdownRef.current,
      features: {
        [CrepeFeature.Cursor]: false,
        [CrepeFeature.ListItem]: false,
        [CrepeFeature.LinkTooltip]: false,
        [CrepeFeature.ImageBlock]: false,
        [CrepeFeature.BlockEdit]: false,
        [CrepeFeature.Placeholder]: false,
        [CrepeFeature.Toolbar]: false,
        [CrepeFeature.CodeMirror]: false,
        [CrepeFeature.Table]: false,
        [CrepeFeature.Latex]: false,
        [CrepeFeature.TopBar]: false,
        [CrepeFeature.AI]: false,
      },
    });
    let disposed = false;
    let createSettled = false;
    let cleanupRequested = false;
    let destroyStarted = false;
    crepeRef.current = crepe;

    /** Destroys this lifecycle's editor at most once. */
    const destroyOnce = () => {
      if (destroyStarted) return;

      destroyStarted = true;
      void crepe.destroy();
    };

    void crepe.create().then(() => {
      createSettled = true;
      if (disposed || crepeRef.current !== crepe) {
        destroyOnce();
        return;
      }

      previewReadyRef.current = true;
      crepe.setReadonly(true);
      appliedMarkdownRef.current = initialMarkdownRef.current;
      applyPreviewMarkdown(latestMarkdownRef.current);
    }).catch(() => {
      createSettled = true;
      if (cleanupRequested) destroyOnce();
      // Keep the source editor usable when preview initialization fails.
    });

    return () => {
      disposed = true;
      previewReadyRef.current = false;
      if (previewTimerRef.current !== null) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      if (crepeRef.current === crepe) crepeRef.current = null;
      cleanupRequested = true;
      if (createSettled) destroyOnce();
    };
  }, [applyPreviewMarkdown]);

  useEffect(() => {
    latestMarkdownRef.current = markdown;
    if (!previewReadyRef.current) return;

    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      applyPreviewMarkdown(latestMarkdownRef.current);
    }, PREVIEW_UPDATE_DELAY_MS);

    return () => {
      if (previewTimerRef.current === null) return;

      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    };
  }, [applyPreviewMarkdown, markdown]);

  return (
    <div
      ref={previewRef}
      className="editor-preview"
      aria-label="Rendered Markdown preview"
    />
  );
}
