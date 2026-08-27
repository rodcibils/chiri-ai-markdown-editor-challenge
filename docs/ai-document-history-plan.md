# In-Memory AI Document History Plan

## Goal

Add an in-memory history of accepted AI-assisted edits so users can review how
their Markdown evolved during the current browser session. Each history item
will show the prompt that produced it, when it was generated, and a side-by-side
diff of that step's AI input and output.

History is intentionally ephemeral in this stage. Refreshing or closing the
page clears it; no browser storage, server storage, or external API changes are
included.

## Core behavior

- Add a `Document History` button to the header beside the existing Help button.
- Opening it displays a closable history-list modal.
- Display committed history items newest first.
- Each list row displays:
  - the local timestamp;
  - the submitted prompt on one line;
  - an ellipsis when the prompt is wider than the available row space.
- Selecting a row opens a history-detail modal containing:
  - the complete prompt;
  - the full timestamp;
  - a shared-scroll, side-by-side diff of that step's input and output.
- Record only AI steps belonging to a suggestion session that the user
  ultimately accepts.
- Treat the initial generation and every successful refinement as separate
  history items.
- If the user rejects or closes the AI review, discard every pending item from
  that session.

## History data model

Use immutable serializable records with primitive values so history logic is
easy to unit test later:

```ts
export interface AiHistoryEntry {
  id: string;
  sequence: number;
  createdAt: number;
  prompt: string;
  inputMarkdown: string;
  outputMarkdown: string;
  scope: SuggestionScope;
  sessionId: string;
  stepIndex: number;
}
```

Field meanings:

- `id`: stable React key and detail-view identifier.
- `sequence`: monotonic in-memory ordering value used when timestamps match.
- `createdAt`: generation-completion time as an epoch number; formatting stays
  in the UI layer.
- `prompt`: the trimmed instruction actually submitted to the provider.
- `inputMarkdown`: exact scoped Markdown sent as `targetMarkdown` for this
  successful request.
- `outputMarkdown`: exact Markdown returned by the provider for this request.
- `scope`: immutable scope captured when the AI session opened.
- `sessionId`: groups an initial request and all of its refinements.
- `stepIndex`: zero-based position within that session.

The detail diff is scoped to the text sent to the provider, matching the
existing AI review semantics:

- Selection: selected Markdown before and after that step.
- Insertion: empty input for the initial step and generated Markdown as output.
- Refinement: the previous AI proposal as input and the refined proposal as
  output.

Store successful no-change responses as steps if the user ultimately accepts
the session. Their detail view should state `No changes suggested` rather than
silently omitting an accepted prompt from the refinement chain.

## Transactional history lifecycle

History must distinguish pending AI work from committed accepted work.

### Starting a suggestion session

- Create a new `sessionId` when a contextual lightbulb opens the AI prompt.
- Reset the pending step collection to an empty array.
- Do not modify committed document history.

### Successful initial generation

- Use the captured scoped target as `inputMarkdown`.
- Use the provider response as `outputMarkdown`.
- Create pending step `0` after the provider response succeeds.
- Keep the step pending while the user reviews, rejects, or refines it.

### Successful refinement

- Use the latest proposal as `inputMarkdown`.
- Use the new provider response as `outputMarkdown`.
- Append a new pending step with the next `stepIndex`.
- Never rewrite the earlier pending steps; each refinement remains independently
  reviewable.

### Failures and retries

- A failed or aborted request does not create a pending history step.
- Retrying after an initial failure creates the initial step only when the retry
  succeeds.
- A failed refinement preserves the previous valid suggestion and existing
  pending steps.
- A later successful refinement adds one new pending step for that successful
  response only.

### Accepting

- Verify that the final proposal can be applied before changing history.
- Apply the latest proposal to the document using the existing immutable scope.
- Commit every pending step from that session to document history as one atomic
  state transition.
- Prepend the pending steps in reverse generation order so the newest
  refinement appears first, followed by earlier steps, followed by older
  accepted sessions.
- Clear the pending session after committing it.

Example accepted chain:

```text
History list, newest first
  Refinement prompt 2: proposal 1 -> proposal 2
  Refinement prompt 1: initial proposal -> proposal 1
  Initial prompt: selected source -> initial proposal
  ...older accepted sessions
```

### Rejecting or closing

- Rejecting the review discards the complete pending session.
- Closing the AI modal from review behaves like Reject and discards it.
- Cancelling the initial prompt discards the empty pending session.
- Closing or cancelling the refinement form returns to review and keeps the
  pending steps because the user has not rejected the suggestion.
- Closing the review after returning from refinement discards all pending steps.

## State organization and testability

Keep history behavior separate from modal rendering and provider calls.

Suggested pure state module:

```ts
export interface DocumentHistoryState {
  committed: AiHistoryEntry[];
  pending: AiHistoryEntry[];
  activeSessionId: string | null;
}

export type DocumentHistoryAction =
  | { type: 'start-session'; sessionId: string }
  | { type: 'append-pending'; entry: AiHistoryEntry }
  | { type: 'commit-session' }
  | { type: 'discard-session' };
```

Implement transitions as a pure reducer or pure functions:

- `startHistorySession(state, sessionId)`;
- `appendPendingHistoryStep(state, entry)`;
- `commitPendingHistory(state)`;
- `discardPendingHistory(state)`;
- `findHistoryEntry(entries, id)`.

These functions must not call `Date.now()`, generate random IDs, access the DOM,
or mutate input arrays. The workflow layer should supply timestamps, IDs, and
request values. This makes ordering, commit/discard behavior, and refinement
chains deterministic in future tests.

Use small injectable factories at the workflow boundary:

```ts
export interface HistoryEnvironment {
  now(): number;
  createId(): string;
}
```

The production implementation can use `Date.now()` and `crypto.randomUUID()`.
A deterministic replacement can be supplied when automated tests are added.

## Header UI

- Add a header action group at the top right.
- Place `Document History` immediately before the Help/Info icon button.
- Use a visible text label so the feature is discoverable without relying on an
  unfamiliar icon.
- Optionally include a small count badge showing the number of committed steps.
  Do not count pending suggestions.
- Keep the button enabled when history is empty so the empty state is
  discoverable.
- Disable header actions while another modal is active, consistent with the
  current modal behavior.
- Give the button an accessible name and a clear visible focus style.

Suggested labels:

- Empty history: `Document History`
- With a count badge: `Document History` plus a visual count such as `3`
- Accessible name with count: `Open document history, 3 accepted changes`

## History list modal

### Layout

- Reuse `ModalFrame` for the backdrop, heading, focus trap, Escape handling, and
  close button.
- Use a title such as `Document History` and kicker such as `AI CHANGE LOG`.
- Make the list body scrollable while keeping the modal header and close control
  visible.
- Show a concise empty state when there are no committed items:
  `Accepted AI changes will appear here during this session.`
- Do not add persistence or a Clear History action in this stage.

### History rows

- Render each entry as a semantic `<button>` so mouse and keyboard users can
  open it.
- Use a two-column row:
  - timestamp with a stable minimum width;
  - prompt using the remaining width.
- Keep each item to one visual row.
- Apply `min-width: 0`, `white-space: nowrap`, `overflow: hidden`, and
  `text-overflow: ellipsis` to the prompt cell.
- Preserve the complete prompt as the button's accessible text; visual
  truncation must not truncate what screen readers receive.
- Add hover and focus styles without relying on color alone.
- Render newest entries first using `createdAt`, then `sequence` as the stable
  tie-breaker.

### Timestamp formatting

- Store epoch timestamps and format them only for display.
- Use `Intl.DateTimeFormat` with the user's locale.
- List rows may use a compact date/time form.
- The detail modal should display the full local date and time.
- Render timestamps using semantic `<time dateTime={isoTimestamp}>` elements.
- Keep formatting in a small pure utility that accepts a timestamp and optional
  formatter, allowing deterministic future tests.

## History detail modal

Selecting a history row transitions from the list dialog to a detail dialog in
the same modal overlay. Do not stack two backdrops or two simultaneous focus
traps. Model list and detail as separate dialog states so the detail still
behaves as another modal view from the user's perspective.

### Detail header and metadata

- Title: `AI change details`.
- Display the full prompt without ellipsis.
- Display the full formatted timestamp beside a semantic `<time>` element.
- Keep metadata above the diff and allow long prompts to wrap.
- Include a `Back to history` action that returns to the list at its prior
  scroll position when practical.
- The close button closes the complete history workflow and returns focus to
  the header `Document History` button.

### Side-by-side diff

- Extract the existing AI review diff columns into a reusable component instead
  of duplicating diff markup and color rules.
- Compute each history item's diff from `inputMarkdown` and `outputMarkdown`
  when its detail view opens, or memoize it by selected entry.
- Label columns `Input` and `Output`.
- Use the same visual semantics as the AI review:
  - removed input text highlighted red;
  - added output text highlighted green;
  - unchanged text shown normally.
- Preserve Markdown whitespace and line breaks.
- Use one shared vertical scroll container for both columns so corresponding
  input and output remain aligned, matching the current review modal.
- Keep the detail header, metadata, and footer actions outside the diff scroll
  region.
- Show `No input text — insertion point` for an empty initial insertion input.
- Show `No changes suggested` when input and output are identical.

## Dialog state changes

Extend the existing discriminated dialog state so Help, AI workflow, history
list, and history detail cannot conflict:

```ts
type DialogState =
  | { kind: 'closed' }
  | { kind: 'help' }
  | { kind: 'history-list' }
  | { kind: 'history-detail'; entryId: string }
  | { kind: 'ai'; view: AiView };
```

- Opening history does not alter committed or pending history state.
- History dialogs prevent contextual lightbulbs from appearing while open.
- Closing history does not change editor Markdown, caret position, or scroll.
- If a referenced detail item cannot be found, return safely to the list rather
  than rendering an empty or broken modal.
- Never allow history browsing during an active AI suggestion session; the
  modal state and disabled header controls already enforce this.

## Planned code organization

### `src/types.ts`

- Add the serializable `AiHistoryEntry` type.
- Reuse `SuggestionScope` rather than introducing a second scope model.
- Add concise TSDoc explaining the difference between a pending step and a
  committed accepted entry.

### `src/history/documentHistory.ts`

- Add the pure state model and start/append/commit/discard transitions.
- Add stable newest-first ordering behavior.
- Avoid React, DOM, clock, and ID-generation dependencies.
- Document inputs, outputs, and ordering assumptions without excessive
  commentary.

### `src/history/historyEnvironment.ts`

- Provide the production clock and ID factory.
- Keep this boundary replaceable for deterministic future tests.
- Fall back to a monotonic counter-based ID if `crypto.randomUUID()` is not
  available in the supported browser environment.

### `src/components/SuggestionDiff.tsx`

- Move `DiffColumn` and shared two-column rendering out of `App.tsx`.
- Accept input/output strings, labels, and optional empty-input text.
- Compute or receive `DiffSegment[]` through a narrow documented interface.
- Reuse this component in both live AI review and history detail.

### `src/components/DocumentHistoryModal.tsx`

- Render the newest-first history list and empty state.
- Render one accessible, ellipsized row per item.
- Receive entries and callbacks as props without owning history state.
- Keep timestamp formatting injectable or delegated to a pure utility.

### `src/components/HistoryDetailModal.tsx`

- Resolve and render one immutable history entry.
- Display full prompt, timestamp, and the reusable side-by-side diff.
- Provide explicit Back and Close callbacks.
- Keep the shared diff scrollable between fixed metadata and footer areas.

### `src/App.tsx`

- Add the header action group and `Document History` button.
- Extend `DialogState` for history list and detail views.
- Own or dispatch the in-memory history reducer.
- Start a pending session when the contextual AI prompt opens.
- Append one pending item after each successful initial/refinement response.
- Commit pending items only inside the successful Accept path.
- Discard pending items on Reject or complete AI-session close.
- Pass committed records to history components.
- Keep provider requests and document mutation separate from history state
  transitions.

### `src/App.css`

- Add readable header action-group and history-button styles.
- Add the single-row history list layout and ellipsis behavior.
- Add empty-state, history metadata, detail layout, and fixed-footer styles.
- Reuse existing modal and diff colors instead of introducing parallel visual
  conventions.
- Keep selectors grouped, consistently indented, and within reasonable line
  lengths.
- Preserve responsive behavior: timestamps and prompts must remain one row on
  narrow screens, and detail diff columns may stack only at the existing mobile
  breakpoint.

## Code documentation and readability

- Add concise TSDoc to exported history types, pure transitions, components,
  formatting utilities, and environment boundaries.
- Document method inputs and outputs where their meaning is not obvious from
  the type signature.
- Add targeted comments for non-obvious transactional behavior, especially why
  pending refinement steps are committed together or discarded together.
- Do not add comments that restate simple assignments, JSX, or clearly named
  operations.
- Use descriptive names such as `pendingHistorySteps`, `commitAcceptedSession`,
  and `selectedHistoryEntry` rather than generic names.
- Use semicolons consistently in TypeScript and TSX.
- Keep TypeScript, TSX, CSS, and Markdown consistently indented and readable at
  reasonable line widths.
- Keep history state transitions pure and UI components prop-driven so future
  unit and component tests do not require real provider calls or timers.
- Run linting, the production build, and whitespace checks after implementation.
- Do not add automated tests in this stage; the implementation should expose
  clean seams for adding them after the UI is accepted.

## Edge cases

- Empty history.
- Very long single-line or multiline prompts in list and detail views.
- Multiple records sharing the same millisecond timestamp.
- Empty input for insertion suggestions.
- Identical input and output.
- Large Markdown inputs and outputs requiring shared diff scrolling.
- Initial request failure followed by a successful retry.
- Refinement failure followed by Accept of the last valid proposal.
- Multiple successful refinements followed by Reject.
- Multiple successful refinements followed by Accept.
- Closing the modal from prompt, review, refinement, and loading states.
- Aborted requests resolving after a session was discarded.
- Opening and closing history without changing the editor caret or scroll.
- A selected history ID becoming unavailable because state was reset during a
  development hot reload.

## Implementation sequence

1. Add history entry types, environment boundaries, and pure state transitions.
2. Extract the live review diff into a reusable `SuggestionDiff` component.
3. Add pending-step creation to successful initial and refinement responses.
4. Commit the pending chain on Accept and discard it on Reject/session close.
5. Extend dialog state and add the header `Document History` action.
6. Implement the history list and detail modal components.
7. Add responsive list, metadata, diff, and header styles.
8. Review comments, naming, semicolons, indentation, and line lengths.
9. Run linting, the production build, and diff whitespace validation.

## Acceptance criteria

- The header displays `Document History` beside Help/Info.
- The history button opens a closable modal even when the list is empty.
- Empty history shows a concise explanatory state.
- Accepted AI steps appear newest first with timestamp and single-row ellipsized
  prompt text.
- Selecting a row opens a closable detail view with the complete prompt,
  timestamp, and shared-scroll input/output diff.
- The detail view uses the same red deletion and green addition semantics as the
  live AI review.
- Each successful refinement becomes a separate pending item with the previous
  proposal as input and refined proposal as output.
- Accept commits the initial step and every successful refinement from that
  session.
- Reject, review close, or cancellation before acceptance commits no items from
  that session.
- Failed and aborted requests never create history items.
- History remains available through subsequent accepted sessions but resets on
  page refresh.
- Browsing or closing history does not modify document content, editor caret, or
  scroll position.
- History logic is isolated in pure functions and UI components receive data
  through documented props, supporting straightforward future tests.
- New code is concisely documented, consistently formatted, properly indented,
  and passes the existing lint and production build commands.
