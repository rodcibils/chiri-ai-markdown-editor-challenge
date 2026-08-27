import { useEffect, useRef, useState } from 'react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'

/** Imperative operations the parent needs after the split editor has mounted. */
export interface EditorBridge {
  /** Replace the entire raw Markdown document and refresh the preview. */
  replaceDocument(markdown: string): void
  /** Replace the captured textarea range and refresh the preview. */
  replaceSelection(markdown: string, range: { from: number; to: number }): void
  /** Toggle editing while a proposal is being generated or reviewed. */
  setReadOnly(value: boolean): void
}

/** Props used to synchronize the raw Markdown editor and rendered preview. */
interface Props {
  /** Markdown loaded when the editor is first mounted. */
  defaultMarkdown: string
  /** Called once the preview is ready for imperative updates. */
  onReady(bridge: EditorBridge): void
  /** Called whenever the source textarea changes. */
  onMarkdownChange(markdown: string): void
  /** Called when the user selects text or moves the caret. */
  onSelectionChange(markdown: string, from: number, to: number): void
}

/** Renders raw Markdown beside a read-only Crepe preview. */
export function DocumentEditor({
  defaultMarkdown,
  onReady,
  onMarkdownChange,
  onSelectionChange,
}: Props) {
  const previewRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const callbacks = useRef({ onMarkdownChange, onSelectionChange })
  const [rawMarkdown, setRawMarkdown] = useState(defaultMarkdown)
  const [readOnly, setReadOnly] = useState(false)

  useEffect(() => {
    // Keep callbacks current without recreating the Crepe instance on every render.
    callbacks.current = { onMarkdownChange, onSelectionChange }
  }, [onMarkdownChange, onSelectionChange])

  useEffect(() => {
    // Crepe is used only as a renderer; all editing happens in the textarea.
    if (!previewRef.current) return

    const crepe = new Crepe({
      root: previewRef.current,
      defaultValue: rawMarkdown,
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
    })
    let active = true
    void crepe.create().then(() => {
      if (!active) return

      crepe.setReadonly(true)
      onReady({
        replaceDocument: (value) => {
          setRawMarkdown(value)
          callbacks.current.onMarkdownChange(value)
        },
        replaceSelection: (value, range) => {
          // String offsets are stable for the raw Markdown source and support insertion ranges.
          const current = textareaRef.current?.value ?? ''
          const next = `${current.slice(0, range.from)}${value}${current.slice(range.to)}`
          setRawMarkdown(next)
          callbacks.current.onMarkdownChange(next)
        },
        setReadOnly: (value) => setReadOnly(value),
      })
    })

    return () => {
      active = false
      void crepe.destroy()
    }
  }, [defaultMarkdown, onReady, rawMarkdown])

  const updateMarkdown = (value: string) => {
    setRawMarkdown(value)
    callbacks.current.onMarkdownChange(value)
  }

  /** Reports the current textarea selection as source offsets for scope selection. */
  const updateSelection = () => {
    const textarea = textareaRef.current
    if (!textarea) return

    const from = textarea.selectionStart
    const to = textarea.selectionEnd
    callbacks.current.onSelectionChange(
      textarea.value.slice(from, to),
      from,
      to,
    )
  }

  return (
    <div className="editor-split">
      <div className="editor-pane editor-source-pane">
        <div className="pane-label">RAW MARKDOWN</div>
        <textarea
          ref={textareaRef}
          className="markdown-source"
          value={rawMarkdown}
          readOnly={readOnly}
          spellCheck={false}
          aria-label="Raw Markdown source"
          onChange={(event) => updateMarkdown(event.target.value)}
          onSelect={updateSelection}
          onKeyUp={updateSelection}
          onMouseUp={updateSelection}
        />
      </div>
      <div className="editor-pane editor-preview-pane">
        <div className="pane-label">RENDERED PREVIEW</div>
        <div ref={previewRef} className="editor-preview" aria-label="Rendered Markdown preview" />
      </div>
    </div>
  )
}
