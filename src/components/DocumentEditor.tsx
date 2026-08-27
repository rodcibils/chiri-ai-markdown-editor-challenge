import { useEffect, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx, serializerCtx } from '@milkdown/kit/core'
import { replaceAll, replaceRange } from '@milkdown/kit/utils'

/** Imperative operations the parent needs after the editor has mounted. */
export interface EditorBridge {
  /** Replace the entire editor document with Markdown. */
  replaceDocument(markdown: string): void
  /** Replace only the captured ProseMirror range with Markdown. */
  replaceSelection(markdown: string, range: { from: number; to: number }): void
  /** Toggle editing while a proposal is being generated or reviewed. */
  setReadOnly(value: boolean): void
}

/** Props used to synchronize the Milkdown instance with React state. */
interface Props {
  defaultMarkdown: string
  onReady(bridge: EditorBridge): void
  onMarkdownChange(markdown: string): void
  onSelectionChange(markdown: string, from: number, to: number): void
}

/** Mounts Crepe and exposes serialized document, selection, and replacement operations. */
export function DocumentEditor({
  defaultMarkdown,
  onReady,
  onMarkdownChange,
  onSelectionChange,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onMarkdownChange, onSelectionChange })

  useEffect(() => {
    callbacks.current = { onMarkdownChange, onSelectionChange }
  }, [onMarkdownChange, onSelectionChange])

  useEffect(() => {
    if (!rootRef.current) return

    const crepe = new Crepe({
      root: rootRef.current,
      defaultValue: defaultMarkdown,
    })

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, value) => {
        callbacks.current.onMarkdownChange(value)
      })

      listener.selectionUpdated((_ctx, selection) => {
        const selected = crepe.editor.action((actionCtx) => {
          const view = actionCtx.get(editorViewCtx)
          const serializer = actionCtx.get(serializerCtx)
          const slice = view.state.doc.slice(selection.from, selection.to)
          const { schema } = view.state.doc.type

          // A document node can contain block content; inline selections need a paragraph wrapper.
          let wrapper = schema.topNodeType.createAndFill(null, slice.content)
          if (!wrapper) {
            const paragraph = schema.nodes.paragraph?.createAndFill(
              null,
              slice.content,
            )
            if (paragraph) {
              wrapper = schema.topNodeType.createAndFill(null, paragraph)
            }
          }

          return wrapper
            ? serializer(wrapper)
            : view.state.doc.textBetween(selection.from, selection.to)
        })

        callbacks.current.onSelectionChange(
          selection.empty ? '' : selected,
          selection.from,
          selection.to,
        )
      })
    })

    let active = true
    void crepe.create().then(() => {
      if (!active) return

      onReady({
        replaceDocument: (value) => crepe.editor.action(replaceAll(value)),
        replaceSelection: (value, range) =>
          crepe.editor.action(replaceRange(value, range)),
        setReadOnly: (value) => crepe.setReadonly(value),
      })
    })

    return () => {
      // Prevent a late create callback from publishing a bridge after unmount.
      active = false
      void crepe.destroy()
    }
  }, [defaultMarkdown, onReady])

  return <div ref={rootRef} className="editor-host" />
}
