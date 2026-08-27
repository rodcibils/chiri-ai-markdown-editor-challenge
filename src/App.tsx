import { useCallback, useMemo, useRef, useState } from 'react';

import { MockSuggestionProvider } from './ai/mockProvider';
import type { SuggestionProvider } from './ai/provider';
import { DocumentEditor } from './components/DocumentEditor';
import type { EditorBridge } from './components/DocumentEditor';
import { HelpModal } from './components/HelpModal';
import { InfoIcon } from './components/icons';
import { ModalFrame } from './components/ModalFrame';
import { computeDiff } from './diff/computeDiff';
import type {
  AiSuggestion,
  ContextualAiTrigger,
  DiffSegment,
  SuggestionScope,
} from './types';
import './App.css';

const initialMarkdown = `# Welcome

Start writing here. Pause at the cursor or select text to ask for an AI idea.`;

type AiView =
  | { kind: 'prompt' }
  | { kind: 'loading'; mode: 'initial' | 'refinement' }
  | { kind: 'review' }
  | { kind: 'refine' };

type DialogState =
  | { kind: 'closed' }
  | { kind: 'help' }
  | { kind: 'ai'; view: AiView };

interface PromptCopy {
  title: string;
  description: string;
  label: string;
  placeholder: string;
  scopeNote: string;
  submitLabel: string;
}

interface PromptViewProps {
  triggerKind: ContextualAiTrigger['kind'];
  prompt: string;
  error: string;
  loading: boolean;
  setPrompt: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

interface ReviewViewProps {
  suggestion: AiSuggestion;
  diff: DiffSegment[];
  refinementPrompt: string;
  refining: boolean;
  error: string;
  setRefinementPrompt: (value: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onStartRefine: () => void;
  onCancelRefine: () => void;
  onSubmitRefinement: () => void;
}

/** Coordinates the full-screen editor and contextual AI suggestion workflow. */
function App() {
  const editorRef = useRef<EditorBridge | null>(null);
  const requestId = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const provider = useMemo<SuggestionProvider>(
    () => new MockSuggestionProvider(),
    [],
  );

  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });
  const [activeTrigger, setActiveTrigger] =
    useState<ContextualAiTrigger | null>(null);
  const [contextMarkdown, setContextMarkdown] = useState(initialMarkdown);
  const [scope, setScope] = useState<SuggestionScope>({
    kind: 'insertion',
    position: 0,
  });
  const [prompt, setPrompt] = useState('');
  const [refinementPrompt, setRefinementPrompt] = useState('');
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [diff, setDiff] = useState<DiffSegment[]>([]);
  const [error, setError] = useState('');

  /** Stores the editor bridge without changing identity on parent renders. */
  const handleEditorReady = useCallback((bridge: EditorBridge) => {
    editorRef.current = bridge;
  }, []);

  /** Opens a scope-specific prompt from an immutable editor snapshot. */
  const openAiDialog = useCallback((trigger: ContextualAiTrigger) => {
    const nextScope: SuggestionScope = trigger.kind === 'selection'
      ? { kind: 'selection', from: trigger.from, to: trigger.to }
      : { kind: 'insertion', position: trigger.position };

    setActiveTrigger(trigger);
    setContextMarkdown(trigger.documentMarkdown);
    setScope(nextScope);
    setPrompt('');
    setRefinementPrompt('');
    setSuggestion(null);
    setDiff([]);
    setError('');
    setDialog({ kind: 'ai', view: { kind: 'prompt' } });
    editorRef.current?.setReadOnly(true);
  }, []);

  /** Clears an AI session and optionally restores its captured source range. */
  const closeAiDialog = (restoreCapturedRange = true) => {
    const triggerToRestore = activeTrigger;

    requestId.current += 1;
    requestController.current?.abort();
    requestController.current = null;
    setSuggestion(null);
    setDiff([]);
    setError('');
    setPrompt('');
    setRefinementPrompt('');
    setActiveTrigger(null);
    setDialog({ kind: 'closed' });
    editorRef.current?.setReadOnly(false);

    if (!restoreCapturedRange || !triggerToRestore) return;

    if (triggerToRestore.kind === 'selection') {
      editorRef.current?.restoreSelection({
        from: triggerToRestore.from,
        to: triggerToRestore.to,
        direction: triggerToRestore.direction,
      });
    } else {
      editorRef.current?.restoreSelection({
        from: triggerToRestore.position,
        to: triggerToRestore.position,
      });
    }
  };

  /** Returns refinement to review; every other close rejects the AI session. */
  const handleAiClose = () => {
    if (dialog.kind === 'ai' && dialog.view.kind === 'refine') {
      setError('');
      setRefinementPrompt('');
      setDialog({ kind: 'ai', view: { kind: 'review' } });
      return;
    }

    closeAiDialog();
  };

  /** Sends either the captured target or latest proposal to the mock provider. */
  const requestSuggestion = async (
    input: string,
    mode: 'initial' | 'refinement',
  ) => {
    const id = ++requestId.current;
    const controller = new AbortController();
    requestController.current?.abort();
    requestController.current = controller;

    const targetMarkdown = mode === 'refinement'
      ? suggestion?.proposedMarkdown ?? ''
      : scope.kind === 'selection'
        ? contextMarkdown.slice(scope.from, scope.to)
        : scope.kind === 'insertion'
          ? ''
          : contextMarkdown;

    setError('');
    setDialog({ kind: 'ai', view: { kind: 'loading', mode } });

    try {
      const proposedMarkdown = await provider.generateSuggestion({
        documentMarkdown: contextMarkdown,
        targetMarkdown,
        instruction: input,
        scope,
        signal: controller.signal,
      });

      if (id !== requestId.current) return;
      if (!proposedMarkdown.trim()) {
        throw new Error('The AI returned an empty suggestion.');
      }

      const nextSuggestion: AiSuggestion = {
        originalMarkdown:
          mode === 'refinement'
            ? suggestion?.originalMarkdown ?? targetMarkdown
            : targetMarkdown,
        proposedMarkdown,
        scope,
        instructions: [
          ...(mode === 'refinement' ? suggestion?.instructions ?? [] : []),
          input,
        ],
      };

      setSuggestion(nextSuggestion);
      setDiff(computeDiff(nextSuggestion.originalMarkdown, proposedMarkdown));
      if (mode === 'refinement') setRefinementPrompt('');
      setDialog({ kind: 'ai', view: { kind: 'review' } });
    } catch (cause) {
      if (
        id !== requestId.current ||
        (cause instanceof DOMException && cause.name === 'AbortError')
      ) {
        return;
      }

      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to generate a suggestion.',
      );
      setDialog({
        kind: 'ai',
        view: mode === 'refinement' ? { kind: 'review' } : { kind: 'prompt' },
      });
    }
  };

  /** Applies the latest proposal once to its immutable captured scope. */
  const acceptSuggestion = () => {
    if (!suggestion || !editorRef.current) return;

    if (suggestion.scope.kind === 'document') {
      editorRef.current.replaceDocument(suggestion.proposedMarkdown);
    } else if (suggestion.scope.kind === 'selection') {
      editorRef.current.replaceSelection(
        suggestion.proposedMarkdown,
        suggestion.scope,
      );
    } else {
      editorRef.current.replaceSelection(suggestion.proposedMarkdown, {
        from: suggestion.scope.position,
        to: suggestion.scope.position,
      });
    }

    closeAiDialog(false);
  };

  const aiView = dialog.kind === 'ai' ? dialog.view : null;
  const promptCopy = activeTrigger
    ? getPromptCopy(activeTrigger.kind)
    : null;
  const isPrompt =
    aiView?.kind === 'prompt' ||
    (aiView?.kind === 'loading' && aiView.mode === 'initial');
  const isReview = aiView?.kind === 'review' || aiView?.kind === 'refine';
  const aiTitle = getAiDialogTitle(aiView, promptCopy);

  return (
    <main className="app-shell">
      <header className="app-header">
        <span className="app-name">CHIRI / MARKDOWN</span>
        <button
          type="button"
          className="header-icon-button"
          aria-label="Open editor help"
          title="Help"
          disabled={dialog.kind !== 'closed'}
          onClick={() => setDialog({ kind: 'help' })}
        >
          <InfoIcon className="header-icon" />
        </button>
      </header>

      <DocumentEditor
        defaultMarkdown={initialMarkdown}
        contextualActionsEnabled={dialog.kind === 'closed'}
        onReady={handleEditorReady}
        onAiTrigger={openAiDialog}
      />

      {dialog.kind === 'help' && (
        <HelpModal onClose={() => setDialog({ kind: 'closed' })} />
      )}

      {dialog.kind === 'ai' && activeTrigger && promptCopy && (
        <ModalFrame
          titleId="ai-modal-title"
          kicker="AI COLLABORATOR"
          title={aiTitle}
          closeLabel="Close AI dialog"
          className={aiView?.kind === 'review' ? 'ai-modal-review' : ''}
          onClose={handleAiClose}
        >
          {isPrompt && (
            <PromptView
              triggerKind={activeTrigger.kind}
              prompt={prompt}
              error={error}
              loading={aiView?.kind === 'loading'}
              setPrompt={setPrompt}
              onSubmit={() => void requestSuggestion(prompt.trim(), 'initial')}
              onCancel={() => closeAiDialog()}
            />
          )}

          {aiView?.kind === 'loading' &&
            aiView.mode === 'refinement' && (
              <div className="modal-body">
                <p className="modal-loading">Refining the AI suggestion…</p>
              </div>
            )}

          {isReview && suggestion && (
            <ReviewView
              suggestion={suggestion}
              diff={diff}
              refinementPrompt={refinementPrompt}
              refining={aiView?.kind === 'refine'}
              error={error}
              setRefinementPrompt={setRefinementPrompt}
              onAccept={acceptSuggestion}
              onReject={() => closeAiDialog()}
              onStartRefine={() => {
                setError('');
                setRefinementPrompt('');
                setDialog({ kind: 'ai', view: { kind: 'refine' } });
              }}
              onCancelRefine={() => {
                setError('');
                setRefinementPrompt('');
                setDialog({ kind: 'ai', view: { kind: 'review' } });
              }}
              onSubmitRefinement={() =>
                void requestSuggestion(
                  refinementPrompt.trim(),
                  'refinement',
                )
              }
            />
          )}
        </ModalFrame>
      )}
    </main>
  );
}

/** Returns wording that explains the immutable scope chosen in the editor. */
function getPromptCopy(kind: ContextualAiTrigger['kind']): PromptCopy {
  if (kind === 'insertion') {
    return {
      title: 'What should come next?',
      description: 'Describe the idea you want to add at the current cursor.',
      label: 'What would you like to write next?',
      placeholder: 'Add a short section explaining...',
      scopeNote: 'The suggestion will be inserted at your cursor.',
      submitLabel: 'Generate idea',
    };
  }

  return {
    title: 'Improve this selection',
    description: 'Tell the AI how you would like to revise the selected text.',
    label: 'How should this text change?',
    placeholder: 'Make this clearer and more concise...',
    scopeNote: 'Only the selected text will be changed.',
    submitLabel: 'Generate revision',
  };
}

/** Chooses the dialog title for prompt, loading, review, and refinement states. */
function getAiDialogTitle(
  view: AiView | null,
  copy: PromptCopy | null,
): string {
  if (
    view?.kind === 'refine' ||
    (view?.kind === 'loading' && view.mode === 'refinement')
  ) {
    return 'Refine suggestion';
  }

  if (view?.kind === 'review') return 'Review suggestion';
  return copy?.title ?? 'AI suggestion';
}

/** Renders a trigger-specific instruction form without editable scope controls. */
function PromptView({
  triggerKind,
  prompt,
  error,
  loading,
  setPrompt,
  onSubmit,
  onCancel,
}: PromptViewProps) {
  const copy = getPromptCopy(triggerKind);

  return (
    <div className="modal-body prompt-body">
      <p className="prompt-description">{copy.description}</p>
      <label htmlFor="ai-prompt">{copy.label}</label>
      <textarea
        id="ai-prompt"
        data-modal-initial-focus
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={copy.placeholder}
        disabled={loading}
      />

      <p className="scope-note">{copy.scopeNote}</p>
      <p className="mock-help">
        Offline mock commands: <code>[mock:add]</code>{' '}
        <code>[mock:remove]</code>{' '}
        <code>[mock:rewrite]</code>{' '}
        <code>[mock:error]</code>{' '}
        <code>[mock:empty]</code>{' '}
        <code>[mock:unchanged]</code>
      </p>

      {error && (
        <p className="modal-error" role="alert">
          {error}
        </p>
      )}

      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!prompt.trim() || loading}
        >
          {loading ? 'Generating…' : copy.submitLabel}
        </button>
      </div>
    </div>
  );
}

/** Renders either the proposal diff or the refinement prompt. */
function ReviewView({
  suggestion,
  diff,
  refinementPrompt,
  refining,
  error,
  setRefinementPrompt,
  onAccept,
  onReject,
  onStartRefine,
  onCancelRefine,
  onSubmitRefinement,
}: ReviewViewProps) {
  return (
    <div className="modal-body review-body">
      {error && (
        <p className="modal-error" role="alert">
          {error}
        </p>
      )}

      {refining ? (
        <>
          <label htmlFor="refinement-prompt">
            How should the proposal change?
          </label>
          <textarea
            id="refinement-prompt"
            data-modal-initial-focus
            autoFocus
            value={refinementPrompt}
            onChange={(event) => setRefinementPrompt(event.target.value)}
            placeholder="Make the suggestion shorter..."
          />
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onCancelRefine}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmitRefinement}
              disabled={!refinementPrompt.trim()}
            >
              Refine suggestion
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="diff-columns">
            <DiffColumn
              title="Existing text"
              segments={diff}
              side="original"
              suggestion={suggestion}
            />
            <DiffColumn
              title="AI suggestion"
              segments={diff}
              side="proposed"
              suggestion={suggestion}
            />
          </div>
          <div className="modal-actions review-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onReject}
            >
              Reject
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onStartRefine}
            >
              Refine
            </button>
            <button type="button" onClick={onAccept}>
              Accept
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Renders one side of the original/proposed Markdown comparison. */
function DiffColumn({
  title,
  segments,
  side,
  suggestion,
}: {
  title: string;
  segments: DiffSegment[];
  side: 'original' | 'proposed';
  suggestion: AiSuggestion;
}) {
  const visibleSegments = segments.filter((segment) =>
    side === 'original'
      ? segment.type !== 'added'
      : segment.type !== 'removed',
  );

  return (
    <div className="diff-column">
      <h3>{title}</h3>
      <div className="diff-content">
        {suggestion.scope.kind === 'insertion' && side === 'original' ? (
          <span className="diff-placeholder">
            Insertion point — no existing text
          </span>
        ) : (
          visibleSegments.map((segment, index) => (
            <span
              key={`${segment.type}-${index}`}
              className={`diff-${segment.type}`}
            >
              {segment.value}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export default App;
