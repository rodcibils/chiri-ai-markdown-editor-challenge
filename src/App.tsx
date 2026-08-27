import { useMemo, useRef, useState } from 'react';

import { MockSuggestionProvider } from './ai/mockProvider';
import type { SuggestionProvider } from './ai/provider';
import { DocumentEditor } from './components/DocumentEditor';
import type { EditorBridge } from './components/DocumentEditor';
import { computeDiff } from './diff/computeDiff';
import type { AiSuggestion, DiffSegment, SuggestionScope } from './types';
import './App.css';

const initialMarkdown = `# Welcome

Start writing here. Select text or place your caret before asking for a change.`;

type ModalState =
  | { kind: 'closed' }
  | { kind: 'prompt' }
  | { kind: 'loading'; mode: 'initial' | 'refinement' }
  | { kind: 'review' }
  | { kind: 'refine' };

interface PromptViewProps {
  prompt: string;
  setPrompt: (value: string) => void;
  scope: SuggestionScope;
  chooseScope: (kind: SuggestionScope['kind']) => void;
  selectedMarkdown: string;
  error: string;
  loading: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

interface ReviewViewProps {
  suggestion: AiSuggestion;
  diff: DiffSegment[];
  refinementPrompt: string;
  setRefinementPrompt: (value: string) => void;
  refining: boolean;
  error: string;
  onAccept: () => void;
  onReject: () => void;
  onStartRefine: () => void;
  onCancelRefine: () => void;
  onSubmitRefinement: () => void;
}

/** Coordinates the full-screen editor and the modal suggestion workflow. */
function App() {
  const editorRef = useRef<EditorBridge | null>(null);
  const requestId = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const provider = useMemo<SuggestionProvider>(
    () => new MockSuggestionProvider(),
    [],
  );

  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [selectedMarkdown, setSelectedMarkdown] = useState('');
  const [selectionRange, setSelectionRange] = useState({ from: 0, to: 0 });
  const [contextMarkdown, setContextMarkdown] = useState(initialMarkdown);
  const [scope, setScope] = useState<SuggestionScope>({ kind: 'document' });
  const [prompt, setPrompt] = useState('');
  const [refinementPrompt, setRefinementPrompt] = useState('');
  const [modal, setModal] = useState<ModalState>({ kind: 'closed' });
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [diff, setDiff] = useState<DiffSegment[]>([]);
  const [error, setError] = useState('');

  /** Captures the current document and defaults scope before opening the dialog. */
  const openModal = () => {
    const nextScope: SuggestionScope = selectedMarkdown
      ? { kind: 'selection', from: selectionRange.from, to: selectionRange.to }
      : { kind: 'document' };

    setContextMarkdown(markdown);
    setScope(nextScope);
    setPrompt('');
    setRefinementPrompt('');
    setError('');
    setModal({ kind: 'prompt' });
    editorRef.current?.setReadOnly(true);
  };

  /** Cancels pending work, clears the proposal, and restores editing. */
  const closeModal = () => {
    requestController.current?.abort();
    requestController.current = null;
    setSuggestion(null);
    setDiff([]);
    setError('');
    setModal({ kind: 'closed' });
    editorRef.current?.setReadOnly(false);
  };

  /** Closes the modal, except refinement mode which returns to the active review. */
  const handleCloseButton = () => {
    if (modal.kind === 'refine') {
      setError('');
      setRefinementPrompt('');
      setModal({ kind: 'review' });
      return;
    }

    closeModal();
  };

  /** Sends either the initial prompt or the current proposal for refinement. */
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
    setModal({ kind: 'loading', mode });

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
      if (mode === 'refinement') {
        setRefinementPrompt('');
      }
      setModal({ kind: 'review' });
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
      setModal(mode === 'refinement' ? { kind: 'review' } : { kind: 'prompt' });
    }
  };

  /** Applies the proposal to the selected scope exactly once. */
  const accept = () => {
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

    closeModal();
  };

  /** Updates the active scope while preserving the captured editor context. */
  const chooseScope = (kind: SuggestionScope['kind']) => {
    if (kind === 'selection' && !selectedMarkdown) return;

    if (kind === 'selection') {
      setScope({ kind: 'selection', from: selectionRange.from, to: selectionRange.to });
    } else if (kind === 'insertion') {
      setScope({ kind: 'insertion', position: selectionRange.to });
    } else {
      setScope({ kind: 'document' });
    }
  };

  const isPrompt = modal.kind === 'prompt' || modal.kind === 'loading';
  const isReview = modal.kind === 'review' || modal.kind === 'refine';

  return (
    <main className="app-shell">
      <header className="app-header">
        <span className="app-name">CHIRI / MARKDOWN</span>
        <button
          type="button"
          className="ask-ai-button"
          onClick={openModal}
          disabled={modal.kind !== 'closed'}
        >
          Ask AI
        </button>
      </header>

      <DocumentEditor
        defaultMarkdown={initialMarkdown}
        onReady={(bridge) => { editorRef.current = bridge; }}
        onMarkdownChange={setMarkdown}
        onSelectionChange={(selected, from, to) => {
          setSelectedMarkdown(selected);
          setSelectionRange({ from, to });
        }}
      />

      {modal.kind !== 'closed' && (
        <div className="modal-backdrop" role="presentation">
          <section
            className={`ai-modal ${modal.kind === 'review' ? 'ai-modal-review' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-header">
              <div>
                <span className="modal-kicker">AI COLLABORATOR</span>
                <h2 id="modal-title">Suggest a change</h2>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={handleCloseButton}
                aria-label="Close AI dialog"
              >
                ×
              </button>
            </div>

            {isPrompt && !(modal.kind === 'loading' && modal.mode === 'refinement') && (
              <PromptView
                prompt={prompt}
                setPrompt={setPrompt}
                scope={scope}
                chooseScope={chooseScope}
                selectedMarkdown={selectedMarkdown}
                error={error}
                loading={modal.kind === 'loading'}
                onSubmit={() => void requestSuggestion(prompt.trim(), 'initial')}
                onCancel={closeModal}
              />
            )}

            {modal.kind === 'loading' && modal.mode === 'refinement' && (
              <div className="modal-body">
                <p className="modal-loading">Refining the AI suggestion…</p>
              </div>
            )}

            {isReview && suggestion && (
              <ReviewView
                suggestion={suggestion}
                diff={diff}
                refinementPrompt={refinementPrompt}
                setRefinementPrompt={setRefinementPrompt}
                refining={modal.kind === 'refine'}
                error={error}
                onAccept={accept}
                onReject={closeModal}
                onStartRefine={() => {
                  setError('');
                  setRefinementPrompt('');
                  setModal({ kind: 'refine' });
                }}
                onCancelRefine={() => {
                  setError('');
                  setRefinementPrompt('');
                  setModal({ kind: 'review' });
                }}
                onSubmitRefinement={() =>
                  void requestSuggestion(refinementPrompt.trim(), 'refinement')
                }
              />
            )}
          </section>
        </div>
      )}
    </main>
  );
}

/** Renders the initial instruction and scope selection form. */
function PromptView(props: PromptViewProps) {
  const scopes: Array<{ kind: SuggestionScope['kind']; label: string }> = [
    { kind: 'selection', label: 'Current selection' },
    { kind: 'insertion', label: 'Current insertion point' },
    { kind: 'document', label: 'Whole document' },
  ];

  return (
    <div className="modal-body">
      <label htmlFor="ai-prompt">What should change?</label>
      <textarea
        id="ai-prompt"
        autoFocus
        value={props.prompt}
        onChange={(event) => props.setPrompt(event.target.value)}
        placeholder="Rewrite this in a more professional tone..."
        disabled={props.loading}
      />

      <fieldset>
        <legend>Change scope</legend>
        {scopes.map(({ kind, label }) => (
          <label className="scope-option" key={kind}>
            <input
              type="radio"
              checked={props.scope.kind === kind}
              onChange={() => props.chooseScope(kind)}
              disabled={
                (kind === 'selection' && !props.selectedMarkdown) || props.loading
              }
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>

      <p className="mock-help">
        Offline mock commands: <code>[mock:add]</code>{' '}
        <code>[mock:remove]</code>{' '}
        <code>[mock:rewrite]</code>{' '}
        <code>[mock:error]</code>{' '}
        <code>[mock:empty]</code>{' '}
        <code>[mock:unchanged]</code>
      </p>

      {props.error && <p className="modal-error" role="alert">{props.error}</p>}

      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={props.onCancel}>
          Cancel
        </button>
        <button
          type="button"
          onClick={props.onSubmit}
          disabled={!props.prompt.trim() || props.loading}
        >
          {props.loading ? 'Generating…' : 'Generate suggestion'}
        </button>
      </div>
    </div>
  );
}

/** Renders either the proposal diff or the refinement prompt. */
function ReviewView(props: ReviewViewProps) {
  return (
    <div className="modal-body review-body">
      {props.error && <p className="modal-error" role="alert">{props.error}</p>}

      {props.refining ? (
        <>
          <label htmlFor="refinement-prompt">How should the proposal change?</label>
          <textarea
            id="refinement-prompt"
            autoFocus
            value={props.refinementPrompt}
            onChange={(event) => props.setRefinementPrompt(event.target.value)}
            placeholder="Make the suggestion shorter..."
          />
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={props.onCancelRefine}>
              Cancel
            </button>
            <button
              type="button"
              onClick={props.onSubmitRefinement}
              disabled={!props.refinementPrompt.trim()}
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
              segments={props.diff}
              side="original"
              suggestion={props.suggestion}
            />
            <DiffColumn
              title="AI suggestion"
              segments={props.diff}
              side="proposed"
              suggestion={props.suggestion}
            />
          </div>
          <div className="modal-actions review-actions">
            <button type="button" className="secondary-button" onClick={props.onReject}>
              Reject
            </button>
            <button type="button" className="secondary-button" onClick={props.onStartRefine}>
              Refine
            </button>
            <button type="button" onClick={props.onAccept}>Accept</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Renders one side of the original/proposed Markdown comparison. */
function DiffColumn(props: {
  title: string;
  segments: DiffSegment[];
  side: 'original' | 'proposed';
  suggestion: AiSuggestion;
}) {
  const visibleSegments = props.segments.filter((segment) =>
    props.side === 'original' ? segment.type !== 'added' : segment.type !== 'removed',
  );

  return (
    <div className="diff-column">
      <h3>{props.title}</h3>
      <div className="diff-content">
        {props.suggestion.scope.kind === 'insertion' && props.side === 'original' ? (
          <span className="diff-placeholder">Insertion point — no existing text</span>
        ) : (
          visibleSegments.map((segment, index) => (
            <span key={`${segment.type}-${index}`} className={`diff-${segment.type}`}>
              {segment.value}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export default App;
