import { useEffect, useRef, useState } from 'react'
import { Crepe, CrepeFeature } from '@milkdown/crepe'
import { replaceAll } from '@milkdown/kit/utils'

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
  defaultMarkdown: string
  onReady(bridge: EditorBridge): void
  onMarkdownChange(markdown: string): void
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
  const crepeRef = useRef<Crepe | null>(null)
  const previewReady = useRef(false)
  const [rawMarkdown, setRawMarkdown] = useState(defaultMarkdown)
  const [readOnly, setReadOnly] = useState(false)

  useEffect(() => {
    callbacks.current = { onMarkdownChange, onSelectionChange }
  }, [onMarkdownChange, onSelectionChange])

  useEffect(() => {
    if (!previewRef.current) return

    const crepe = new Crepe({
      root: previewRef.current,
      defaultValue: defaultMarkdown,
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
    crepeRef.current = crepe

    let active = true
    void crepe.create().then(() => {
      if (!active) return

      previewReady.current = true
      crepe.setReadonly(true)
      onReady({
        replaceDocument: (value) => {
          setRawMarkdown(value)
          callbacks.current.onMarkdownChange(value)
          crepe.editor.action(replaceAll(value))
        },
        replaceSelection: (value, range) => {
          const current = textareaRef.current?.value ?? ''
          const next = `${current.slice(0, range.from)}${value}${current.slice(range.to)}`
          setRawMarkdown(next)
          callbacks.current.onMarkdownChange(next)
          crepe.editor.action(replaceAll(next))
        },
        setReadOnly: (value) => setReadOnly(value),
      })
    })

    return () => {
      active = false
      previewReady.current = false
      crepeRef.current = null
      void crepe.destroy()
    }
  }, [defaultMarkdown, onReady])

  useEffect(() => {
    if (!previewReady.current || !crepeRef.current || rawMarkdown === defaultMarkdown) return
    crepeRef.current.editor.action(replaceAll(rawMarkdown))
  }, [rawMarkdown, defaultMarkdown])

  const updateMarkdown = (value: string) => {
    setRawMarkdown(value)
    callbacks.current.onMarkdownChange(value)
  }

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
