# Markdown Download Plan

Date: 2026-08-28

## Goal

Add an accessible Download button to the application header, beside Document
History and Help, so the user can save the editor's current raw Markdown as a
local `.md` file.

The downloaded file must contain the exact current source document, including
manual edits and accepted AI changes. It must not contain rendered HTML, pending
AI suggestions, history metadata, prompts, or any other application state.

## Scope

This work includes:

- a Download icon button in the header;
- a browser-only Markdown file download utility;
- a read boundary that obtains the latest raw Markdown without lifting every
  keystroke into `App`;
- accessible labels, focus behavior, responsive styling, and Help copy;
- unit, component, and browser tests that run offline;
- README, `AGENTS.md`, and relevant audit/documentation updates; and
- lint, build, coverage, browser-test, and formatting verification.

This work does not include:

- server-side file generation or storage;
- OpenRouter or other external requests;
- choosing a destination directory programmatically;
- a filename prompt, document title field, or filesystem-access API;
- exporting rendered HTML, PDF, history, or rejected/pending AI suggestions; or
- persistence beyond the browser's normal download behavior.

No new dependency should be required. Browser `Blob`, object URL, anchor
download, and existing test APIs are sufficient.

## Current-state considerations

- `DocumentEditor` owns the live Markdown in local React state.
- `App` owns header actions but currently receives only imperative mutation and
  selection-restoration methods through `EditorBridge`.
- Lifting the complete Markdown into `App` on every source edit would make the
  entire workflow rerender per keystroke and is unnecessary for a click-only
  export action.
- The existing header contains a visible Document History button followed by an
  icon-only Help button. Header actions are disabled while another modal is
  active.
- AI acceptance updates the editor through `replaceDocument` or
  `replaceSelection`, so the export read path must observe those changes as well
  as direct typing.

## User experience

### Header placement

- Add the Download button inside `.header-actions` between Document History and
  Help so the related global actions remain grouped.
- Use the existing circular `.header-icon-button` presentation.
- Add a dedicated `DownloadIcon` with the same dimensions and decorative SVG
  behavior as the existing Info and Lightbulb icons.
- Accessible name: `Download Markdown document`.
- Tooltip/title: `Download Markdown`.
- Keep the button enabled for an empty document; downloading an empty `.md` file
  is valid.
- Disable it until the editor bridge is ready and while any modal is open,
  matching the current header-action behavior and preventing export of a pending,
  unaccepted proposal.
- Preserve the existing visible focus ring, hover treatment, touch target, and
  mobile header layout.

### Download result

- Use the fixed filename `chiri-document.md` in this stage. A constant filename
  avoids unsafe user-derived filenames and makes behavior deterministic in tests;
  browsers may append a duplicate counter when needed.
- Encode content as a UTF-8 `Blob` with MIME type
  `text/markdown;charset=utf-8`.
- Preserve the source exactly. Do not trim whitespace, normalize line endings,
  add a title, append a newline, insert a byte-order mark, or serialize preview
  markup.
- Export the currently accepted editor document. An AI proposal visible in a
  modal is not part of the document until the user presses Accept.
- Trigger the normal browser download without navigating away or changing editor
  focus/selection.

## State and data-flow design

### Extend the editor bridge

Add a read method to `EditorBridge`:

```ts
/** Returns the exact latest raw Markdown, including committed bridge edits. */
getMarkdown(): string;
```

Inside `DocumentEditor`:

- add a `latestMarkdownRef` initialized from `defaultMarkdown`;
- update the ref in the source textarea change handler before updating React
  state;
- update it synchronously inside `replaceDocument` and `replaceSelection` before
  scheduling their state update; and
- implement `getMarkdown` by returning the ref value.

This keeps the export read current without reading `ref.current` during render,
without depending on whether React has committed a textarea update, and without
causing an `App` rerender for every keystroke. The ref is an imperative snapshot,
not a second source of truth for rendering; `rawMarkdown` remains the render
state.

Update `handleEditorReady` in `App` to store the bridge and mark the editor ready.
The ready flag is used only to prevent an early download click before the bridge
effect has run.

### Add a browser download boundary

Create `src/download/downloadMarkdown.ts` with:

- a documented filename constant;
- a documented `downloadMarkdown(markdown: string): void` function; and
- small internal helpers only where they improve lifecycle clarity or testing.

Expected browser sequence:

1. Create a Markdown `Blob` from the exact source string.
2. Create an object URL with `URL.createObjectURL`.
3. Create a hidden anchor with the object URL and fixed `.md` filename.
4. Append it temporarily to `document.body` for broad browser compatibility.
5. Call `click()` to start the native download.
6. Remove the anchor in a guaranteed cleanup path.
7. Revoke the object URL after the click has been handed to the browser, using a
   short scheduled cleanup rather than revoking it before download processing.

Keep DOM/download side effects in this module so `App` only coordinates current
document retrieval and the button action. The utility must not perform a fetch,
use the server, log document content, or retain the Blob/object URL.

### Wire the header action

In `App`:

- import `downloadMarkdown` and `DownloadIcon`;
- add a documented `handleMarkdownDownload` callback;
- read `editorRef.current?.getMarkdown()` only in the click handler;
- return safely if the bridge is unavailable;
- invoke the download helper exactly once per click; and
- render the button between Document History and Help.

Do not add the download action to `DialogState`: it is a one-shot side effect and
does not open a modal. Keep it disabled when `dialog.kind !== 'closed'` so the
download always represents the visible accepted document rather than an AI
proposal under review.

## Icon and CSS changes

### Download icon

Add `DownloadIcon` to `src/components/icons.tsx`:

- use a simple downward arrow entering a tray;
- inherit color through `currentColor`;
- use the existing `24 x 24` view box and stroke conventions;
- set `aria-hidden="true"` and `focusable="false"`; and
- document the component with concise TSDoc.

The button, not the SVG, owns the accessible name.

### Header styling

- Reuse `.header-icon-button` and `.header-icon`; avoid a duplicate button style.
- Verify three header actions do not overflow at the existing mobile breakpoint.
- Adjust only `.header-actions`, `.app-name`, or the responsive history label if
  measured browser behavior shows an actual collision.
- Preserve two-space CSS indentation and readable grouping.
- Do not reduce the icon buttons below their existing `38 x 38` touch target.

## Error and compatibility behavior

- The primary target is current evergreen browsers already covered by Playwright:
  Chromium, Firefox, and WebKit.
- An empty Markdown string is a valid download and must not be treated as an
  error.
- Object URLs and temporary anchors must be cleaned up even if `anchor.click()`
  throws.
- If object URL creation fails, allow the error to remain observable during
  development/tests and ensure no partial anchor remains. Do not silently send
  the document elsewhere as a fallback.
- Do not use the File System Access API because it is not consistently supported
  across the project's browser matrix and would introduce permission-specific UI.

## Security and privacy considerations

- The operation is entirely local to the browser and must not call
  `/api/suggestions`, OpenRouter, analytics, or another origin.
- Use a constant filename so Markdown content cannot inject path separators,
  control characters, or misleading extensions into `download`.
- Treat the Markdown as opaque Blob data; do not insert it into HTML.
- Revoke object URLs promptly so document data is not retained through a stale
  browser URL longer than necessary.
- Download only the accepted current document. Pending/rejected suggestions and
  prompt/history metadata remain excluded.
- Update the security/performance audit's positive-control/data-flow notes to
  record that export is client-only and introduces no provider disclosure.

## Test plan

All tests remain offline and must not require an OpenRouter key.

### Download utility unit tests

Add `tests/unit/downloadMarkdown.test.ts` and stub browser object-URL/anchor APIs.
Cover:

- filename is exactly `chiri-document.md`;
- anchor receives the object URL and `.md` filename;
- click occurs exactly once;
- Blob type is `text/markdown;charset=utf-8`;
- Blob text exactly matches multiline Markdown, Unicode, leading/trailing
  whitespace, and final-newline state;
- an empty document is downloadable;
- the temporary anchor is removed;
- the object URL is revoked after the scheduled cleanup; and
- cleanup still occurs when the click throws.

Use fake timers or an injected scheduling seam only where necessary to make URL
revocation deterministic. Restore every global/DOM mock after each test.

### DocumentEditor component tests

Extend `tests/unit/components/DocumentEditor.test.tsx` to verify
`EditorBridge.getMarkdown()` returns:

- initial Markdown immediately after readiness;
- the latest direct textarea edit;
- the result of `replaceDocument` without stale state; and
- the complete document after `replaceSelection`, including insertion scope.

These tests protect the exact export source independently of the download DOM
mechanism.

### App workflow tests

Extend `tests/unit/App.test.tsx`:

- add `getMarkdown` to the mocked bridge;
- mock the download module rather than invoking browser download APIs;
- verify the header button has the accessible name and Download icon;
- verify one click exports the exact value returned by the bridge;
- verify the button is disabled while Help, History, or AI review is open;
- verify download does not call the suggestion provider; and
- verify the action is available again after the modal closes or an AI change is
  accepted.

### Icon tests

Extend `tests/unit/components/icons.test.tsx` to include `DownloadIcon`, verify its
class, and update the expected SVG count.

### Playwright browser test

Add a browser test that:

1. loads the local app with all external requests blocked;
2. replaces the textarea contents with distinct multiline Unicode Markdown;
3. waits for the browser `download` event while pressing the Download button;
4. verifies the suggested filename ends in `.md` and equals
   `chiri-document.md`; and
5. reads the temporary Playwright download and verifies byte-for-byte text
   equality with the textarea value.

Run this across the existing Chromium, Firefox, WebKit, and mobile Chromium
projects. Extend the responsive-layout test to confirm the Download button stays
inside the viewport and remains reachable on narrow screens.

## Documentation updates

### README

Update `README.md` to:

- add Markdown download to Features;
- add the Download button to the numbered usage instructions;
- state that export is local, contains only current accepted raw Markdown, and
  does not call OpenRouter;
- add `src/download/` to the folder structure; and
- keep each README paragraph and list item on one physical line, per the current
  repository formatting preference.

### Agent guide

Update `AGENTS.md` to:

- add `src/download/` to the directory overview;
- record that file export is browser-only and must preserve exact Markdown;
- document that object URLs and temporary DOM nodes require cleanup; and
- keep the download boundary easy to mock without external requests.

### Help modal and tests

Add one concise Help item explaining that the header Download icon saves the
current accepted Markdown to the device. Do not mention implementation details,
Blobs, object URLs, or API internals. Update the Help modal component test for the
new user-facing copy.

### Security/performance audit

Update `docs/security-performance-audit.md` only where current-state statements
change:

- note the client-only exact-Markdown download as a positive privacy/control
  behavior; and
- confirm it introduces no server request, persistence, or new dependency.

Do not rewrite unrelated severity findings as part of this feature.

## Expected file changes

- `src/App.tsx`
- `src/App.css` only if responsive verification requires an adjustment
- `src/components/DocumentEditor.tsx`
- `src/components/HelpModal.tsx`
- `src/components/icons.tsx`
- `src/download/downloadMarkdown.ts` (new)
- `tests/unit/App.test.tsx`
- `tests/unit/components/DocumentEditor.test.tsx`
- `tests/unit/components/HelpModal.test.tsx`
- `tests/unit/components/icons.test.tsx`
- `tests/unit/downloadMarkdown.test.ts` (new)
- `tests/e2e/editor.spec.ts`
- `tests/e2e/responsive-layout.spec.ts`
- `README.md`
- `AGENTS.md`
- `docs/security-performance-audit.md`

No server source, API contract, environment variable, or package dependency
change is expected.

## Implementation order

1. Add the exact-current-Markdown read method and its component tests.
2. Add the isolated browser download utility and lifecycle tests.
3. Add the Download icon and update icon tests.
4. Wire the guarded App header action and update App tests.
5. Update Help copy and its test.
6. Verify/adjust responsive header CSS and add Playwright download coverage.
7. Update README, `AGENTS.md`, and the narrow audit notes.
8. Run the complete verification suite and inspect the final diff.

## Verification commands

```sh
npm run lint
npm run build
npm run test:coverage
npm run test:e2e
npm run verify
git diff --check
git status --short
```

`npm run verify` repeats lint, build, coverage, and browser tests; it is listed as
the final all-in-one gate. No command should contact OpenRouter during testing.

## Acceptance criteria

- A Download icon button appears between Document History and Help.
- The button has the accessible name `Download Markdown document`, a tooltip,
  visible focus styling, and remains usable in the existing mobile layout.
- Pressing it downloads exactly one file named `chiri-document.md`.
- The file uses Markdown UTF-8 content and exactly matches the current raw editor
  value, including whitespace, Unicode, and accepted AI changes.
- Pending or rejected AI suggestions, prompts, rendered HTML, and history data are
  never included.
- Empty documents download successfully.
- Downloading performs no server, OpenRouter, or external request.
- Temporary anchors and object URLs are always cleaned up.
- The editor does not cause an `App` rerender solely to publish every keystroke
  for download.
- Existing edit, preview, AI, refinement, history, focus, and modal behavior is
  unchanged.
- Unit/component tests, coverage thresholds, Playwright projects, lint, build,
  and `git diff --check` all pass.
- README, Help, `AGENTS.md`, and the relevant audit notes accurately document the
  new behavior.
