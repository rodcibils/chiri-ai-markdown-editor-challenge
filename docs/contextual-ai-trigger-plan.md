# Contextual AI Trigger and Help UI Plan

## Goal

Replace the global AI scope controls with contextual idea buttons that appear
beside the user's caret or selection. The interaction should make it clear
whether the AI will add text at the insertion point or revise selected text,
while preserving the existing mock provider, diff review, accept/reject flow,
and iterative refinement behavior.

This plan is separate from the existing implementation plans and does not
replace them.

## Intended user experience

### Continue writing from the caret

1. The user types or places the caret in the raw Markdown editor without
   selecting text.
2. After one second without a document edit, a small lightbulb button appears
   just below and to the right of the caret.
3. Pressing the button captures the current document and caret position, then
   opens the AI prompt modal with insertion-specific wording.
4. The generated Markdown is reviewed using the existing diff modal and is
   inserted at the captured position only after the user accepts it.

Suggested initial prompt copy:

- Title: `What should come next?`
- Description: `Describe the idea you want to add at the current cursor.`
- Field label: `What would you like to write next?`
- Placeholder: `Add a short section explaining...`
- Scope note: `The suggestion will be inserted at your cursor.`

### Improve selected text

1. The user selects a non-empty range in the raw Markdown editor.
2. Once the selection is complete, a lightbulb button appears above or below
   the active selection endpoint: the cursor position where the user finished
   selecting text.
3. Pressing the button captures the selected Markdown and its source offsets,
   then opens the AI prompt modal with selection-specific wording.
4. The generated Markdown is compared with the captured selection and replaces
   only that range if accepted.

Suggested initial prompt copy:

- Title: `Improve this selection`
- Description: `Tell the AI how you would like to revise the selected text.`
- Field label: `How should this text change?`
- Placeholder: `Make this clearer and more concise...`
- Scope note: `Only the selected text will be changed.`

### Work with the whole document

- Do not add a separate whole-document trigger or scope selector.
- Explain that the user can press `Ctrl+A` on Windows/Linux or `Command+A` on
  macOS while the raw Markdown editor is focused.
- A complete-document selection follows the same selection workflow. It can
  continue to use the existing `selection` scope with offsets covering the
  complete source, which avoids adding a separate UI path.

## Contextual trigger behavior

### Insertion trigger timing

- Start or restart a one-second idle timer after every actual Markdown value
  change while the textarea is focused and its selection is collapsed.
- Hide the insertion trigger immediately when the user edits again.
- Also restart the timer when the user moves the caret, so the button never
  appears beside a stale insertion point.
- Do not show an insertion trigger before the textarea has received focus.
- Do not show it while an AI or help modal is open, while the editor is
  read-only, or when a non-empty selection exists.
- Clear the timer on blur and component unmount.

The one-second delay should be stored as a named constant such as
`AI_TRIGGER_IDLE_MS` so it is easy to tune later.

### Selection trigger timing

- Show the selection trigger when a mouse, keyboard, or touch interaction ends
  with `selectionStart < selectionEnd`.
- During pointer dragging, keep the trigger hidden so it does not jump while the
  selection is changing.
- Keyboard selections should update after `keyup`; pointer and touch selections
  should update after their corresponding end event.
- Hide the trigger when the selection collapses, the user types, the textarea
  loses focus, or a modal opens.
- A whitespace-only selection is still a valid source range because Markdown
  whitespace can be meaningful.

### Captured context

The trigger must pass an immutable snapshot to the application rather than
letting the modal infer scope from later editor state:

```ts
export type ContextualAiTrigger =
  | {
      kind: 'insertion';
      documentMarkdown: string;
      position: number;
    }
  | {
      kind: 'selection';
      documentMarkdown: string;
      selectedMarkdown: string;
      from: number;
      to: number;
    };
```

- Convert this snapshot directly to the existing `SuggestionScope` when the
  modal opens.
- Keep the editor read-only for the complete prompt, review, and refinement
  session so the captured offsets remain valid.
- Preserve the original captured target throughout refinements; each refinement
  still sends the latest AI proposal as `targetMarkdown`.

## Positioning the lightbulb button

Native textareas provide selection offsets but not screen coordinates. Add a
small internal measurement utility instead of introducing a dependency:

1. Create an off-screen mirror element with the textarea's computed font,
   padding, border, line height, letter spacing, wrapping, and width.
2. Copy the Markdown up to the relevant source offset into the mirror.
3. Place a marker span at the offset and read its bounding rectangle.
4. Subtract the textarea's `scrollTop` and `scrollLeft`, then translate the
   marker position into coordinates inside the raw editor pane.
5. For a collapsed caret, measure `selectionEnd`.
6. For a selection, measure its active endpoint: use `selectionEnd` for a
   forward selection and `selectionStart` for a backward selection, based on
   `selectionDirection`. This anchors the action where the user finished
   selecting rather than always using the range's highest offset.
7. Place the button immediately below the active endpoint when space permits.
   If there is not enough visible space below it, place the button immediately
   above the endpoint instead.
8. Clamp the final position inside the visible textarea bounds while keeping it
   visually associated with the selection cursor.

Recalculate or hide the button when the textarea scrolls, its size changes, or
the editor layout switches between desktop and mobile. A `ResizeObserver` can
handle textarea size changes without a new package.

The source editor pane should become the positioning container with
`position: relative`, and the trigger should be absolutely positioned above the
textarea content. Prevent the button's pointer-down interaction from clearing
the textarea selection before the captured trigger context is dispatched.

## Contextual idea button design

- Use one compact circular button with an inline SVG lightbulb icon.
- Do not install an icon package for two simple icons.
- Give the button a high-contrast background, visible focus state, and a subtle
  entrance transition that respects `prefers-reduced-motion`.
- Use `aria-label="Ask AI for an idea at the cursor"` for insertion mode.
- Use `aria-label="Ask AI to improve the selected text"` for selection mode.
- Provide matching `title` text as a lightweight mouse tooltip.
- Keep the button at least 36 by 36 CSS pixels and ensure it does not obscure
  the line currently being edited.
- Keep it inside the raw Markdown pane and above the editor surface, but below
  modal overlays.

## AI prompt modal changes

### Remove manual scope selection

- Remove the scope radio buttons, `fieldset`, selection-disabled state, and the
  `chooseScope` callback from `PromptView`.
- Remove the global `openModal()` logic that chooses scope from mutable state.
- Replace it with `openAiModal(trigger: ContextualAiTrigger)`, which receives the
  already captured scope.
- Keep a short, read-only scope note in the modal so the user can verify what the
  action will affect without being able to change it there.

### Make prompt copy depend on trigger kind

- Pass the trigger kind into the prompt view.
- Use insertion-specific or selection-specific title, description, label,
  placeholder, submit-button text, and accessible dialog label.
- Keep the offline mock command help visible in both variants.
- Preserve the current error behavior: an initial request failure returns to the
  same prompt without clearing the entered instruction.
- Keep review, accept, reject, close, and unlimited refinement behavior
  unchanged after a suggestion has been generated.
- Refinement copy remains proposal-oriented because refinements always operate
  on the latest AI result, regardless of the original trigger kind.

## Header and help modal

### Header update

- Remove the `Ask AI` button and its styles.
- Add a compact icon-only Help/Info button at the top-right of the header.
- Use an inline SVG information icon, an `aria-label` such as
  `Open editor help`, a visible focus state, and a `title="Help"` tooltip.

### Help content

Open a separate centered modal with concise instructions:

1. `Continue writing` — Leave the caret where you want new text, pause for five
   seconds, then press the lightbulb.
2. `Improve text` — Select the text you want to change, then press the
   lightbulb beside the selection.
3. `Change everything` — Focus the raw Markdown editor and press `Ctrl+A`
   (`Command+A` on macOS), then use the selection lightbulb.
4. `Review safely` — Compare the original and suggested Markdown, then Accept,
   Reject, or Refine it before the document changes.
5. `Offline mode` — Suggestions currently come from the local mock provider;
   list the supported mock commands or point to the command help in the prompt.

The help modal needs a clear title, close button, and one `Got it` action. It
must not start an AI request or retain any AI prompt state.

### Modal coordination

- Ensure the help modal and AI modal cannot be open simultaneously.
- Model the active overlay explicitly, for example with an `ActiveDialog` union,
  instead of relying on multiple booleans that could conflict.
- Opening Help hides any pending contextual trigger.
- Closing Help returns focus to the Help button.
- Closing the AI workflow returns focus to the raw editor and restores its
  captured caret or selection where possible.
- Support `Escape` for Help and for AI states where closing is already allowed.
- Reuse one modal backdrop and shared header/action styles while keeping Help
  content separate from AI workflow state.

## State and event flow

```text
Textarea interaction
  -> DocumentEditor determines insertion or selection context
  -> contextual lightbulb becomes visible at a measured anchor
  -> user activates lightbulb
  -> DocumentEditor emits an immutable ContextualAiTrigger
  -> App captures scope and locks the editor
  -> prompt modal renders trigger-specific copy
  -> existing mock request and diff review workflow continues
  -> accept applies only the captured range, or close/reject applies nothing
```

Keep transient presentation state close to the editor:

- idle timer identifier;
- whether the textarea currently has focus;
- pointer-selection-in-progress state;
- trigger visibility and kind;
- measured trigger coordinates.

Keep workflow state in the application or extracted AI workflow component:

- immutable trigger context and `SuggestionScope`;
- prompt and refinement prompt;
- loading/error/review/refine state;
- suggestion, diff, request ID, and abort controller;
- active AI or Help dialog.

## Planned code changes

### `src/components/DocumentEditor.tsx`

- Add the one-second idle lifecycle.
- Distinguish collapsed caret state from non-empty selection state.
- Measure the relevant text offset and render the contextual idea button.
- Emit `ContextualAiTrigger` when the button is activated.
- Restore the captured textarea selection after the AI modal closes.
- Continue reporting Markdown changes for the rendered preview.
- Keep event handlers and effects documented, cleanup-safe, and formatted with
  semicolons.

### `src/editor/measureTextareaOffset.ts`

- Add the mirror-based textarea offset measurement utility.
- Keep DOM measurement isolated from React state and document its coordinate
  system, inputs, output, and cleanup requirements.
- Reuse one temporary mirror per measurement or one managed mirror per editor;
  never leave detached measurement nodes behind.

### `src/types.ts`

- Add the `ContextualAiTrigger` union and, if useful, a small point type for the
  button anchor.
- Retain the existing `SuggestionScope` contract so the provider and review
  workflow remain transport-neutral.

### `src/App.tsx`

- Replace the header `Ask AI` action with the Help icon button.
- Replace mutable scope selection with trigger-driven modal initialization.
- Remove `chooseScope`, the scope options, and related prompt props/state.
- Add trigger-dependent prompt copy and an informational scope note.
- Coordinate AI and Help dialogs without changing mock request semantics.
- Preserve captured original text across all refinement cycles.

### `src/components/HelpModal.tsx`

- Render the concise usage guide with semantic headings and controls.
- Reuse shared modal styling and expose a simple `onClose` callback.
- Include keyboard and screen-reader behavior in the component contract.

### `src/components/icons.tsx`

- Provide small inline `LightbulbIcon` and `InfoIcon` React components.
- Mark decorative SVG paths as hidden from assistive technology because each
  owning button supplies its accessible name.

### `src/App.css`

- Remove `.ask-ai-button`, fieldset, legend, and `.scope-option` rules once no
  longer used.
- Add contextual trigger positioning, hover, focus, and reduced-motion styles.
- Add Help icon button and Help modal content styles.
- Preserve the full-screen split editor and the shared-scroll diff layout.
- Clamp modal dimensions and contextual controls appropriately on narrow
  screens.

## Accessibility and interaction requirements

- The contextual buttons must be real `<button>` elements and keyboard
  reachable.
- Do not rely on the lightbulb icon alone; every icon button needs an accessible
  name.
- Keep focus trapped inside either open modal and restore it to a meaningful
  control on close.
- The selection highlight should remain visible while the user moves focus to
  the contextual button when the browser permits it; the immutable snapshot is
  still authoritative if the visual highlight disappears.
- Preserve visible focus outlines against both the dark source pane and modal
  surfaces.
- Announce request errors using the existing `role="alert"` behavior.
- Do not use color alone to communicate scope or diff meaning.

## Code quality and readability

- Add concise TSDoc comments to exported types, components, utilities, and
  methods so their purpose, important inputs, and outputs are clear.
- Add comments inside function bodies only where they explain non-obvious
  behavior, such as textarea coordinate measurement, timer cleanup, selection
  preservation, or modal state transitions.
- Avoid excessive comments that merely repeat what the code already expresses.
- Use descriptive names and small, focused functions so most behavior remains
  understandable without commentary.
- Use semicolons consistently in TypeScript and TSX files.
- Indent TypeScript, TSX, CSS, and Markdown consistently and keep line lengths
  reasonable for side-by-side review.
- Organize CSS declarations and selectors into readable blocks, removing styles
  that become unused when the old scope controls and `Ask AI` button are
  removed.
- Run the existing lint command after implementation and resolve all lint
  errors and warnings introduced by these changes.
- Run the production build after linting to verify TypeScript compilation and
  bundled application output.

## Edge cases to handle

- An empty document and caret position `0`.
- A caret at the first or last source character.
- A multiline or whole-document selection.
- A backward selection where the active endpoint is `selectionStart` rather
  than `selectionEnd`; use `selectionDirection` when choosing the visual anchor
  so the button remains beside the cursor where selection finished, while
  keeping normalized `from` and `to` offsets for replacement.
- Long lines with horizontal scrolling and long documents with vertical
  scrolling.
- Textarea resize and the responsive stacked editor layout.
- Selection created with keyboard shortcuts, including `Ctrl+A` and
  `Command+A`.
- A pending idle timer when the editor blurs, a modal opens, or the component
  unmounts.
- Rapid edits or selection changes that could let a stale timer reveal the
  trigger at an old position.
- Clicking the lightbulb without losing the captured selection.
- Closing, rejecting, accepting, or repeatedly refining without carrying prompt
  text into the next independent AI session.

## Implementation sequence

1. Add the contextual trigger types and textarea measurement utility.
2. Extend `DocumentEditor` with focus, idle, selection-finalization, geometry,
   and contextual button behavior.
3. Change `App` so a trigger snapshot is the only entry point into the AI
   workflow.
4. Remove prompt scope controls and add insertion/selection-specific copy.
5. Replace the header action with the Help icon and add the Help modal.
6. Add responsive, accessible styling and remove obsolete CSS.
7. Add concise TSDoc and targeted implementation comments, then review all
   affected TypeScript and CSS for the project's semicolon, indentation, and
   line-width conventions.
8. Run linting and the production build, fixing any issues introduced by the
   implementation.

Automated test implementation remains deferred until the interaction and final
UI are accepted, consistent with the current project stage.

## Acceptance criteria

- The global `Ask AI` button and prompt scope buttons no longer appear.
- A focused collapsed caret produces an insertion lightbulb only after one
  second without an edit or caret movement.
- A finalized non-empty selection produces a selection lightbulb above or below
  its active endpoint without waiting one second, clearly indicating where
  the user finished selecting.
- Activating either lightbulb opens the correct prompt copy and immutable scope.
- Full-document edits are discoverable through Help and work through select-all.
- The prompt does not permit changing scope after the contextual trigger opens
  it.
- Accept applies the proposal only to the captured insertion point or selection.
- Reject and close leave the document unchanged.
- Refinement continues to operate on the latest AI proposal.
- The Help icon opens a concise, keyboard-accessible explanation and does not
  interfere with AI workflow state.
- Contextual buttons remain positioned correctly while the editor scrolls or
  resizes and never render outside the visible source pane.
- New and changed code is concisely documented without redundant commentary,
  consistently indented, readable at reasonable line widths, and uses
  semicolons in TypeScript and TSX.
- The existing lint command and production build complete successfully after
  implementation.
