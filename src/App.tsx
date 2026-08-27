import { useCallback, useMemo, useRef, useState } from 'react'

import { MockSuggestionProvider } from './ai/mockProvider'
import type { SuggestionProvider } from './ai/provider'
import { DocumentEditor } from './components/DocumentEditor'
import type { EditorBridge } from './components/DocumentEditor'
import { computeDiff } from './diff/computeDiff'
import type { AiSuggestion, DiffSegment, SuggestionScope } from './types'
import './App.css'

const initialMarkdown = `# Welcome

Start writing here. Select text or ask the mock AI to suggest a change.`;

type RequestStatus = 'idle' | 'loading' | 'ready' | 'error';

function App() {
  const editorRef = useRef<EditorBridge | null>(null);
  const requestId = useRef(0);
  const provider = useMemo<SuggestionProvider>(
    () => new MockSuggestionProvider(),
    [],
  );

  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [selectedMarkdown, setSelectedMarkdown] = useState('');
  const [selectionRange, setSelectionRange] = useState({ from: 0, to: 0 });
  const [instruction, setInstruction] = useState('');
  const [refinement, setRefinement] = useState('');
  const [status, setStatus] = useState<RequestStatus>('idle');
  const [error, setError] = useState('');
  const [suggestion, setSuggestion] = useState<AiSuggestion | null>(null);
  const [diff, setDiff] = useState<DiffSegment[]>([]);

  const scope: SuggestionScope = selectedMarkdown
    ? {
        kind: 'selection',
        from: selectionRange.from,
        to: selectionRange.to,
      }
    : { kind: 'document' };

  /** Keep the editor instance available for accept/reject actions. */
  const handleEditorReady = useCallback((bridge: EditorBridge) => {
    editorRef.current = bridge
  }, [])

  /** Stores both serialized selection content and its ProseMirror coordinates. */
  const handleSelection = useCallback(
    (selected: string, from: number, to: number) => {
      setSelectedMarkdown(selected)
      setSelectionRange({ from, to })
    },
    [],
  )

  /** Runs either an initial request or a refinement without mutating the editor. */
  const startRequest = async (
    text: string,
    nextInstruction: string,
    base: AiSuggestion | null,
  ) => {
    const currentId = ++requestId.current
    const controller = new AbortController()

    setStatus('loading')
    setError('')
    // The proposal must be reviewed before the underlying document can change.
    editorRef.current?.setReadOnly(true)

    try {
      const proposedMarkdown = await provider.generateSuggestion({
        markdown: text,
        instruction: nextInstruction,
        signal: controller.signal,
      })

      if (currentId !== requestId.current) return
      if (!proposedMarkdown.trim()) {
        throw new Error('The AI returned an empty suggestion.')
      }

      const nextSuggestion: AiSuggestion = {
        originalMarkdown: base?.originalMarkdown ?? text,
        proposedMarkdown,
        scope: base?.scope ?? scope,
        instructions: [...(base?.instructions ?? []), nextInstruction],
      }

      setSuggestion(nextSuggestion)
      // Always compare with the original snapshot, including after refinements.
      setDiff(computeDiff(nextSuggestion.originalMarkdown, proposedMarkdown))
      setStatus('ready')
    } catch (cause) {
      if (
        currentId !== requestId.current ||
        (cause instanceof DOMException && cause.name === 'AbortError')
      ) {
        return
      }

      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to generate a suggestion.',
      )
      setStatus(base ? 'ready' : 'error')

      if (!base) {
        editorRef.current?.setReadOnly(false)
      }
    }
  }

  /** Sends the current document or selection to the configured provider. */
  const suggest = () => {
    const value = instruction.trim()

    if (value && status !== 'loading' && !suggestion) {
      void startRequest(selectedMarkdown || markdown, value, null)
    }
  }

  /** Sends the previous proposal back through the provider for another revision. */
  const refine = () => {
    const value = refinement.trim()

    if (value && suggestion && status !== 'loading') {
      setRefinement('')
      void startRequest(suggestion.proposedMarkdown, value, suggestion)
    }
  }

  /** Applies the proposal exactly once, then returns the editor to normal editing. */
  const accept = () => {
    if (!suggestion || !editorRef.current) return

    if (suggestion.scope.kind === 'selection') {
      // The captured range keeps the replacement local to the original selection.
      editorRef.current.replaceSelection(
        suggestion.proposedMarkdown,
        suggestion.scope,
      )
    } else {
      editorRef.current.replaceDocument(suggestion.proposedMarkdown)
    }

    setSuggestion(null)
    setDiff([])
    setError('')
    setStatus('idle')
    editorRef.current.setReadOnly(false)
  }

  /** Discards the proposal without dispatching any editor transaction. */
  const reject = () => {
    setSuggestion(null)
    setDiff([])
    setError('')
    setStatus('idle')
    editorRef.current?.setReadOnly(false)
  }

  const statusLabel = suggestion
    ? 'Reviewing an AI suggestion'
    : status === 'loading'
      ? 'Generating a suggestion'
      : 'Ready to edit'

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">CHIRI / AI DOCUMENT EDITOR</p>
          <h1>Write with a thoughtful co-author.</h1>
          <p className="subtitle">
            Draft in Markdown, then review every proposed change before it
            reaches your document.
          </p>
        </div>
        <span className={`status-pill status-${status}`} role="status">
          {statusLabel}
        </span>
      </header>

      <section className="editor-card" aria-label="Markdown document editor">
        <div className="card-heading">
          <div>
            <span className="section-kicker">DOCUMENT</span>
            <span className="document-name">Untitled.md</span>
          </div>
          <span className="scope-note">
            {selectedMarkdown ? 'Selection active' : 'Whole document'}
          </span>
        </div>
        <DocumentEditor
          defaultMarkdown={initialMarkdown}
          onReady={handleEditorReady}
          onMarkdownChange={setMarkdown}
          onSelectionChange={handleSelection}
        />
      </section>

      <section className="ai-card" aria-label="AI editing controls">
        <div className="card-heading">
          <div>
            <span className="section-kicker">AI COLLABORATOR</span>
            <span className="target-label">
              Editing: {selectedMarkdown ? 'Selected text' : 'Entire document'}
            </span>
          </div>
          <span className="mock-badge">LOCAL MOCK</span>
        </div>
        <div className="instruction-row">
          <label className="sr-only" htmlFor="instruction">
            Ask AI to change this
          </label>
          <input
            id="instruction"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') suggest()
            }}
            placeholder="Make this paragraph more concise..."
            disabled={status === 'loading' || Boolean(suggestion)}
          />
          <button
            type="button"
            onClick={suggest}
            disabled={
              !instruction.trim() || status === 'loading' || Boolean(suggestion)
            }
          >
            Suggest changes
          </button>
        </div>
        {error && !suggestion && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <p className="helper-text">
          Try <code>[mock:error]</code>, <code>[mock:empty]</code>, or{' '}
          <code>[mock:unchanged]</code> to test edge states.
        </p>
      </section>

      {suggestion && (
        <section className="suggestion-card" aria-label="AI suggestion">
          <div className="card-heading">
            <div>
              <span className="section-kicker">PROPOSED EDIT</span>
              <span className="target-label">
                {suggestion.scope.kind === 'selection'
                  ? 'Selected text'
                  : 'Entire document'}
              </span>
            </div>
            <span className="proposal-count">
              {suggestion.instructions.length} instruction
              {suggestion.instructions.length === 1 ? '' : 's'}
            </span>
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {diff.length === 0 ? (
            <p className="no-change">No changes suggested.</p>
          ) : (
            <DiffView segments={diff} />
          )}
          <div className="suggestion-actions">
            <button type="button" className="primary-button" onClick={accept}>
              Accept change
            </button>
            <button type="button" className="secondary-button" onClick={reject}>
              Reject
            </button>
          </div>
          <div className="refine-row">
            <label className="sr-only" htmlFor="refinement">
              Refine this suggestion
            </label>
            <input
              id="refinement"
              value={refinement}
              onChange={(event) => setRefinement(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') refine()
              }}
              placeholder="Refine this suggestion..."
              disabled={status === 'loading'}
            />
            <button
              type="button"
              onClick={refine}
              disabled={!refinement.trim() || status === 'loading'}
            >
              {status === 'loading' ? 'Refining…' : 'Refine'}
            </button>
          </div>
        </section>
      )}
    </main>
  )
}

/** Presents additions and removals inline so the proposed edit is immediately legible. */
function DiffView({ segments }: { segments: DiffSegment[] }) {
  return (
    <div className="diff-view" aria-label="Proposed changes">
      {segments.map((segment, index) => (
        <span
          key={`${segment.type}-${index}`}
          className={`diff-${segment.type}`}
          aria-label={
            segment.type === 'added'
              ? 'Added'
              : segment.type === 'removed'
                ? 'Removed'
                : undefined
          }
        >
          {segment.value}
        </span>
      ))}
    </div>
  )
}

export default App
