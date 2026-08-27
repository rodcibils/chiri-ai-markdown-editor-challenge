# Persistent Markdown Preview Plan

## Goal

Stop destroying and recreating the read-only Crepe preview whenever the raw
Markdown changes. The source textarea must remain immediately responsive while
the rendered preview updates shortly after typing pauses.

The implementation will keep one Crepe instance for each mounted preview and
update its document through Milkdown's installed `replaceAll` action. No new
dependency is required.

## Current problem

`MarkdownPreview` creates Crepe inside an effect that depends on `markdown`.
Every keystroke therefore performs a complete lifecycle:

1. destroy the current editor;
2. construct and asynchronously create another editor;
3. parse the complete document;
4. recreate editor plugins and DOM;
5. restore read-only mode.

Fast typing can leave several asynchronous create/destroy operations in flight.
The cost grows with the document and may cause input lag, flicker, unnecessary
garbage collection, and lifecycle races.

## Implementation design

### Persistent editor lifecycle

- Keep the preview container, Crepe instance, readiness state, latest Markdown,
  applied Markdown, debounce timer, and disposed state in refs.
- Construct Crepe once in a mount-only effect using the initial Markdown and the
  existing disabled-feature configuration.
- Call `crepe.create()` once and set the instance to read-only after creation.
- If Markdown changed while creation was pending, apply only the latest value
  immediately after the instance becomes ready.
- Destroy the instance once during unmount and clear every pending timer.
- Guard asynchronous completion with both a disposed flag and instance identity
  so a Strict Mode cleanup cannot update or destroy a later instance.

### Preview updates

- Import `replaceAll` from `@milkdown/kit/utils`.
- Keep raw textarea state updates synchronous and unchanged.
- Schedule preview replacement with a 150 ms trailing debounce whenever the
  Markdown prop changes after the initial render.
- On timeout, apply `crepe.editor.action(replaceAll(latestMarkdown, true))`.
- Use `flush: true` because the preview is read-only and does not need undo
  history; recreating only the editor state prevents an unbounded preview undo
  stack without rebuilding Crepe or its plugins.
- Skip replacement when the requested Markdown equals the last successfully
  applied value.
- Cancel an older timer before scheduling another so rapid typing parses only
  the newest source value.
- If an update arrives before Crepe is ready, retain it in the latest-value ref
  rather than starting another editor.

### Failure and race handling

- Treat creation and replacement as internal preview work; they must never
  mutate the raw Markdown value.
- Prevent promise completion or timers from acting after unmount.
- Keep the current preview mounted if a later replacement fails. Development
  diagnostics may log a concise error, but must not include document content.
- Do not retry failed replacements in a loop. The next source change may attempt
  another update.
- Ensure a delayed replacement cannot overwrite a newer Markdown value by
  reading the latest ref when the timer executes.

### Code organization and readability

- Keep `MarkdownPreview` private to `DocumentEditor` unless extracting it is
  necessary for isolated testing.
- Define a named `PREVIEW_UPDATE_DELAY_MS = 150` constant near the existing
  editor timing constants.
- Extract small helpers only where they clarify instance creation, Markdown
  replacement, or timer cleanup.
- Add concise TSDoc for lifecycle helpers and inner comments around readiness
  and Strict Mode race protection.
- Preserve semicolons, existing indentation, and readable line widths.

## Test plan

Update the existing Crepe mock so it exposes `editor.action` and mock
`replaceAll` from `@milkdown/kit/utils`. All tests remain offline.

Add or update component tests for these cases:

1. Initial render constructs and creates one Crepe instance with the initial
   Markdown and enables read-only mode after creation.
2. Multiple source edits within 150 ms do not construct another Crepe instance
   and produce one replacement containing only the latest Markdown.
3. No replacement runs before the debounce duration expires.
4. A source change after the debounce window produces another replacement on
   the same instance.
5. A bridge-driven document or selection replacement updates the existing
   preview through the same debounced path.
6. Markdown changes received while `crepe.create()` is pending are coalesced and
   the latest value is applied once creation completes.
7. Reapplying the already rendered Markdown does not dispatch a redundant
   replacement.
8. Unmount clears a pending timer and destroys the instance exactly once.
9. A delayed creation completion after unmount performs no read-only or
   replacement action and safely destroys only its own instance.
10. A Strict Mode mount/cleanup cycle leaves no stale timer or instance capable
    of updating the active preview.

Run:

```sh
npm run lint
npm test -- --run
npm run build
```

## Acceptance criteria

- Normal typing creates no additional Crepe instances.
- Raw Markdown input remains immediate; preview updates trail by at most the
  selected 150 ms debounce plus parsing/rendering time.
- Rapid typing renders only the latest coalesced value.
- AI-accepted edits and direct source edits use the same preview update path.
- Read-only preview behavior and existing Markdown rendering remain unchanged.
- No timer, editor instance, or asynchronous callback survives component
  unmount.
- Existing contextual AI trigger, selection restoration, scrolling, and editor
  bridge behavior continue to pass their tests.

## Out of scope

- Replacing Crepe with a different Markdown renderer.
- Reducing the Milkdown bundle or changing Vite chunking.
- Changing the 1-second contextual AI trigger delay.
- Synchronizing source and preview scroll positions.
- Adding a Web Worker for Markdown parsing.

Those are separate performance or product changes and should not be mixed into
this lifecycle fix.
