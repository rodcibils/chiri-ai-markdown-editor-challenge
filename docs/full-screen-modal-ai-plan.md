# Full-Screen Editor and Modal AI Workflow Plan

## Goal

Replace the current page-style presentation with a full-screen text-editor experience focused only on raw Markdown, rendered Markdown, and AI assistance. Remove promotional titles such as “Write with a thoughtful co-author.”

## Full-screen editor shell

- Make the app occupy the full viewport using `100dvh`.
- Add a compact top header containing the application name, current scope indicator when relevant, and an `Ask AI` button.
- Place two equal-width panes below the header:
  - Left: editable raw Markdown `<textarea>`.
  - Right: non-editable Milkdown/Crepe rendered preview.
- Give each pane independent scrolling and preserve the vertical divider.
- Stack the panes vertically on narrow screens.
- Remove the current headline, subtitle, persistent AI controls, status pill, and card-style page framing.

## Editor context and scopes

Capture an immutable context when the modal opens:

```ts
interface EditorContext {
  documentMarkdown: string
  selection: { text: string; from: number; to: number } | null
  insertionPoint: number
}
```

Scope options:

- `Current selection`: enabled only when text is selected.
- `Current insertion point`: always enabled; when a selection exists, use `selectionEnd` as the insertion position.
- `Whole document`.

The editor becomes read-only while the modal is open so captured positions cannot become stale.

## Scope-aware provider interface

Replace the current text-only request with:

```ts
type SuggestionScope =
  | { kind: 'selection'; from: number; to: number }
  | { kind: 'insertion'; position: number }
  | { kind: 'document' }

interface SuggestionRequest {
  documentMarkdown: string
  targetMarkdown: string
  instruction: string
  scope: SuggestionScope
  signal?: AbortSignal
}

interface SuggestionResponse {
  proposedMarkdown: string
}
```

- Selection requests send only selected Markdown and replace only the captured range.
- Insertion requests send an empty target and insert the returned Markdown at the captured caret position.
- Document requests send the complete Markdown and replace the complete document.
- Refinement requests send the previous proposal as `targetMarkdown` while retaining the original target for comparison.
- Keep the provider transport-neutral so the existing mock can later be replaced by OpenRouter without changing the UI.

## Modal states and flow

Use a discriminated state model:

```ts
type ModalState =
  | { kind: 'prompt' }
  | { kind: 'loading'; mode: 'initial' | 'refinement' }
  | { kind: 'error'; mode: 'initial' | 'refinement'; message: string }
  | { kind: 'review'; suggestion: AiSuggestion }
  | { kind: 'refine'; suggestion: AiSuggestion }
```

### Prompt state

- Show a prompt textarea.
- Show the three scope radio options.
- Disable selection scope when no selection exists.
- Default to selection when text is selected; otherwise default to whole document.
- Show mock commands: `[mock:add]`, `[mock:remove]`, `[mock:rewrite]`, `[mock:error]`, `[mock:empty]`, and `[mock:unchanged]`.
- Provide Generate and Cancel actions.

### Loading and errors

- Keep the prompt and selected scope visible while loading.
- Disable duplicate submission and allow cancellation.
- Preserve prompt, scope, and previous proposal after an error.
- Provide Retry and Cancel actions with concise safe messages.

### Review state

Display a vertically split, side-by-side comparison inside the modal:

- Left pane: existing scoped text, with deletions highlighted red.
- Right pane: AI-proposed text, with additions/changes highlighted green.
- Preserve Markdown whitespace and line breaks.
- For insertion scope, show “Insertion point — no existing text” in the left pane.
- For unchanged output, show “No changes suggested.”
- Show exactly three primary actions: Accept, Reject, Refine.

## Accept, reject, and refinement

- Accept applies the latest proposal once:
  - Selection replaces `[from, to]`.
  - Insertion inserts at `position`.
  - Document replaces the complete Markdown value.
- Reject discards the proposal without changing the document.
- Refine switches to a new prompt state, sends the latest proposal as input, and returns to review after success.
- Preserve the original target for every diff, append refinement instructions to history, and allow unlimited refinement cycles.
- On refinement failure, preserve the last valid proposal and allow retry, accept, or reject.
- Closing the modal from review behaves as Reject; closing during loading aborts the request.

## Code organization

- `App.tsx`: full-screen shell and document state.
- `DocumentEditor.tsx`: raw textarea, rendered preview, selection/caret context, and editor bridge.
- `AiSuggestionModal.tsx`: prompt, scope, loading, error, review, and refinement UI.
- `SuggestionDiff.tsx`: side-by-side diff rendering.
- `useSuggestionWorkflow.ts`: request lifecycle and proposal transitions.
- `provider.ts`: scope-aware provider contracts.
- `mockProvider.ts`: deterministic meaningful mock responses.

## Accessibility and deferred testing

- Move focus into the modal on open, trap focus, return focus to `Ask AI` on close, and support keyboard navigation.
- Use semantic labels and text decorations in addition to diff colors.
- Keep modal content scrollable on small screens.
- Defer automated and manual testing work until the UI and behavior are accepted.
