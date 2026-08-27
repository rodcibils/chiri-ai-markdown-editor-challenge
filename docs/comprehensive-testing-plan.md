# Comprehensive Offline Testing Plan

## Goal

Add automated tests for the complete application with high confidence in its
domain logic, React behavior, editor integration, accessibility, and responsive
layout. Tests must be deterministic and must never call OpenRouter or any other
real-world endpoint.

The suite will have two complementary layers:

1. Vitest and React Testing Library for fast unit, component, and application
   workflow tests in JSDOM.
2. Playwright for behavior that depends on a real browser, including textarea
   selection geometry, focus, scrolling, responsive layout, and the real
   Milkdown preview.

This stage adds tests only around the current offline provider boundary. When a
real provider is introduced later, the same provider interface and network
interception setup will allow its transport behavior to be tested with local
responses rather than API tokens.

## Current project assessment

The project currently has ESLint, TypeScript, Vite, and production build
scripts, but no test runner or test-specific dependencies.

Important existing boundaries to preserve and test:

- `SuggestionProvider` already separates the application workflow from an AI
  implementation.
- `MockSuggestionProvider` is asynchronous, abortable, scope-aware, and
  supports explicit success and failure commands.
- `documentHistoryReducer` is pure and separates pending suggestions from
  committed accepted history.
- `HistoryEnvironment` isolates timestamps and identifiers.
- `computeDiff`, timestamp helpers, and textarea measurement are standalone
  functions.
- `EditorBridge` isolates document mutation from the application workflow.
- `ModalFrame`, history modals, and `SuggestionDiff` are prop-driven reusable
  components.
- `DocumentEditor` contains browser-sensitive timer, selection, geometry,
  scrolling, and Milkdown lifecycle behavior.

## Dependencies to install

Install the following development dependencies because none are currently in
`package.json`:

```sh
npm install --save-dev vitest @vitest/coverage-v8 jsdom \
  @testing-library/react @testing-library/dom \
  @testing-library/user-event @testing-library/jest-dom \
  @playwright/test msw @axe-core/playwright
```

Purpose of each dependency:

- `vitest`: Vite-compatible unit and component test runner.
- `@vitest/coverage-v8`: fast source-mapped statement, branch, function, and
  line coverage.
- `jsdom`: DOM environment for React component tests.
- `@testing-library/react`: behavior-oriented React rendering and queries.
- `@testing-library/dom`: explicit peer dependency shared by the Testing
  Library packages.
- `@testing-library/user-event`: realistic typing, clicking, tabbing, and
  keyboard interactions.
- `@testing-library/jest-dom`: readable DOM and accessibility assertions.
- `@playwright/test`: real-browser end-to-end and layout testing.
- `msw`: intercepts request APIs in unit/component tests and makes unhandled
  network requests fail.
- `@axe-core/playwright`: automated accessibility checks in the rendered app.

After installing the npm packages, install the browser binaries used by the
end-to-end projects:

```sh
npx playwright install chromium firefox webkit
```

The existing React and TypeScript type packages are sufficient; no additional
Jest type package is needed. Use versions compatible with the installed Vite,
React, TypeScript, and Node versions and commit the resulting lockfile changes.
Vitest 4 is compatible with Vite 8, provided the local Node version satisfies
Vitest's Node 20+ requirement.

References for the selected tools:

- [Vitest coverage](https://main.vitest.dev/guide/coverage)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Library user interactions](https://testing-library.com/docs/user-event/intro/)
- [Playwright configuration](https://playwright.dev/docs/test-configuration)
- [Playwright network interception](https://playwright.dev/docs/network)

## Configuration and scripts

### Vitest configuration

Create `vitest.config.ts` with:

- the React Vite plugin;
- `environment: 'jsdom'`;
- `tests/setup/unit.ts` as the setup file;
- automatic mock restoration and DOM cleanup;
- test discovery under `tests/unit/**/*.test.{ts,tsx}`;
- V8 coverage with text, JSON, LCOV, and HTML reports;
- coverage inclusion for every runtime `src/**/*.{ts,tsx}` file;
- narrow exclusions only for `src/main.tsx` and type-only `src/types.ts`.

`main.tsx` is exercised by browser smoke tests, and `types.ts` has no runtime
statements. Do not exclude difficult application or editor modules merely to
raise the percentage.

Start with enforceable aggregate thresholds for the current unit suite:

| Metric | Initial minimum |
| --- | ---: |
| Statements | 80% |
| Lines | 80% |
| Functions | 80% |
| Branches | 70% |

Pure domain modules should reach 100% branch coverage. Raise aggregate
thresholds toward 90% statements/lines/functions and 85% branches after the
browser-only workflow coverage is expanded, but do not write assertions that
exist only to execute lines without verifying behavior. Browser-only behavior
is additionally gated by Playwright rather than counted in the JSDOM V8 report.

### Unit test setup

Create `tests/setup/unit.ts` to:

- load `@testing-library/jest-dom/vitest`;
- start an MSW Node server before tests;
- configure `onUnhandledRequest: 'error'`;
- reset request handlers and mocks after every test;
- close the server after the suite;
- provide small deterministic JSDOM shims for `ResizeObserver` and
  `requestAnimationFrame`;
- clean up any fake timers after each test.

Keep browser shims minimal. Geometry that JSDOM cannot represent faithfully
must be covered in Playwright rather than hidden behind unrealistic global
polyfills.

### Playwright configuration

Create `playwright.config.ts` with:

- tests under `tests/e2e`;
- a local Vite `webServer` and a fixed loopback `baseURL`;
- reuse of the local server outside CI;
- traces and screenshots retained only on failure;
- no retries locally and a small bounded retry count in CI;
- `forbidOnly` in CI;
- desktop Chromium, Firefox, and WebKit projects;
- one mobile Chromium viewport project for responsive checks.

Add a shared Playwright fixture that allows only the loopback application
origin. Abort and report every unexpected HTTP or HTTPS request to another
origin. Future AI endpoint tests must explicitly fulfill the endpoint route
with local fixture data before navigation.

### Package scripts

Add the following scripts to `package.json`:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "test:e2e:headed": "playwright test --headed",
  "test:all": "npm run test:coverage && npm run test:e2e",
  "verify": "npm run lint && npm run build && npm run test:all"
}
```

Keep generated `coverage/`, `playwright-report/`, `test-results/`, and trace
artifacts out of version control through `.gitignore`.

## Testability improvements before adding tests

Make small dependency-boundary changes without altering production behavior:

1. Allow `App` to receive an optional `SuggestionProvider` and
   `HistoryEnvironment`, with the current browser-backed mock defaults used by
   `main.tsx`.
2. Allow tests to use a smaller initial Markdown value when useful, while the
   production default remains unchanged.
3. Add a reusable scripted test provider that returns queued resolutions or
   rejections and records every `SuggestionRequest`.
4. Add deterministic history fixtures with fixed IDs, sequence values, and
   timestamps.
5. Extract narrow workflow helpers only when a branch cannot be tested through
   observable UI behavior, such as selecting the replacement operation for a
   `SuggestionScope`.
6. Mock `@milkdown/crepe` in JSDOM component tests so they verify constructor,
   create, read-only, update, and destroy interactions without importing its
   complete browser editor implementation.
7. Keep at least one Playwright path using the actual Milkdown package, ensuring
   the component mock cannot conceal integration failures.

Do not add test-only branches to production UI, expose internal React state, or
weaken encapsulation solely to satisfy coverage.

## No-real-network guarantee

Apply defense in depth so tests remain safe after the real provider is added:

- Unit and component tests receive a scripted `SuggestionProvider`; they never
  instantiate a network provider.
- MSW fails every unhandled request. Handlers return local deterministic data
  and must not proxy requests onward.
- End-to-end tests run the application in explicit mock-provider mode.
- Playwright allows only local Vite document, asset, and module requests and
  aborts every other origin.
- Do not load API keys, `.env.local`, or CI secrets in any test configuration.
- Assert the exact provider request payload, including document context,
  selected target, insertion target, prompt, scope, and abort signal.
- Add a regression test that fails if an AI action attempts `fetch`, XHR, or a
  cross-origin browser request unexpectedly.
- When the real provider is implemented later, test its serialization,
  response parsing, HTTP errors, empty responses, and abort behavior using MSW
  fixtures only.

Local browser requests to the Vite test server are expected; the prohibition is
specifically against OpenRouter and all other external services.

## Unit test matrix

### Diff computation

Test `src/diff/computeDiff.ts` for:

- identical and empty strings;
- additions, removals, and replacements;
- preserved Markdown whitespace and line breaks;
- punctuation, Unicode, and multiline Markdown;
- reconstruction of each visible input/output side from returned segments.

### Document history state

Test `src/history/documentHistory.ts` for:

- initial state;
- starting a session without mutating committed history;
- clearing stale pending steps when a new session starts;
- accepting entries only for the active session ID;
- immutable pending append behavior;
- atomic commit of an initial suggestion and all refinements;
- discard after rejection or close;
- no-change steps remaining recordable after acceptance;
- newest-first timestamp ordering;
- sequence tie-breaking for identical timestamps;
- lookup success and missing IDs;
- no mutation of caller-owned arrays or records.

### History timestamp and environment helpers

Test timestamp helpers with explicit locale and timezone formatters so expected
text does not depend on the developer machine. Verify valid ISO output.

Stub `crypto.randomUUID`, the clock, and the fallback path to verify that
browser history IDs are unique and deterministic under controlled inputs.

### Mock suggestion provider

Use fake timers to verify:

- the simulated delay and unresolved loading period;
- default revision output and document context marker;
- insertion behavior with an empty target;
- `[mock:add]`, `[mock:remove]`, and `[mock:rewrite]` transformations;
- `[mock:unchanged]`, `[mock:empty]`, and `[mock:error]` results;
- trimming and case-insensitive command detection;
- an already-aborted signal;
- abort while the timer is pending;
- timer cleanup and no resolution after abort;
- repeated refinement input being the previous proposal rather than the
  original selected text.

### Textarea offset measurement

Test `src/editor/measureTextareaOffset.ts` with controlled element metrics:

- offsets below zero and beyond the string length are clamped;
- relevant computed styles are copied to the mirror;
- textarea scroll offsets are subtracted;
- numeric and fallback line heights;
- empty content uses a measurable marker;
- the temporary mirror is removed after measurement.

Use Playwright for the real wrapping and cursor-position accuracy checks.

## Component test matrix

### Modal frame

Verify:

- accessible dialog role, title relationship, and close label;
- preferred initial focus and fallback first focusable element;
- forward and reverse Tab trapping;
- Escape dismissal;
- click-based dismissal;
- restoration of prior focus without ancestor scrolling;
- cleanup after transitions between history list and detail views.

### Suggestion diff

Verify:

- input/output headings and filtered segment rendering;
- red deletion and green addition classes;
- unchanged content;
- insertion-point placeholder;
- identical-content message;
- Markdown whitespace preservation in rendered text.

Avoid large structural snapshots; assert roles, labels, content, and semantic
classes directly.

### History list modal

Verify:

- empty state;
- one semantic button per committed entry;
- compact localized timestamp and complete prompt in the DOM;
- entry callback receives the ID and current list scroll position;
- initial scroll restoration when returning from details;
- initial keyboard focus on the newest row;
- long prompts remain a single visually ellipsized row in browser tests.

### History detail modal

Verify:

- complete prompt and full semantic timestamp;
- exact input/output passed into the reusable diff;
- insertion and no-change states;
- Back and Close callbacks;
- initial focus on Back;
- metadata, diff, and footer layout in browser tests with large content.

### Help modal and icons

Verify concise user guidance, keyboard dismissal through `ModalFrame`, and
accessible labeling of icon-only controls in their parent components.

### Document editor

Use fake timers and a mocked textarea measurement helper to verify:

- initial raw Markdown and preview creation;
- typing updates the raw value and recreates the read-only preview;
- old preview instances are destroyed after updates and unmounting;
- the insertion lightbulb appears only after the idle interval;
- continued typing, focus loss, movement, or changed selection cancels it;
- a text selection shows its lightbulb immediately;
- forward and backward selections use the correct active endpoint;
- full-document selection is passed as a selection scope;
- trigger activation captures immutable document text and offsets;
- contextual actions stay hidden while disabled or read-only;
- pointer selection does not show an intermediate trigger;
- scrolling and resizing refresh or hide the trigger anchor;
- anchor values clamp to editor edges and flip above the endpoint when needed;
- `replaceSelection` changes only the captured range;
- zero-width insertion and complete document replacement;
- selection restoration, caret placement, and focused read-only transitions;
- editor-only scroll restoration after accepted changes.

## Application workflow tests

Render `App` with a scripted provider, deterministic history environment, and a
test editor bridge. Verify behavior through visible UI and bridge calls:

### Header and help

- Header controls render and disable while another modal is active.
- Help opens, closes, traps focus, and leaves the document unchanged.
- Document History opens while empty and shows its empty state.

### Initial suggestion flow

- Insertion and selection triggers show the correct copy and fixed scope note.
- Whitespace-only prompts cannot be submitted.
- Submitted prompts are trimmed.
- Loading text and disabled controls appear while the provider is unresolved.
- The provider receives the exact document, target, prompt, scope, and signal.
- Empty provider output becomes a user-facing validation error.
- Provider failure preserves the initial prompt and permits retry.
- Close or Cancel aborts an in-flight request and ignores late results.
- A stale earlier response cannot replace a newer response.

### Review actions

- Review displays the existing and suggested scoped Markdown.
- Accept invokes the correct editor bridge operation exactly once.
- Insertion uses a zero-width range at the captured caret.
- Selection replacement uses immutable captured offsets.
- Reject and close never mutate the document.
- The editor is read-only during the workflow and enabled afterward.
- Focus and the captured range are restored after cancel or rejection.
- Accepted content places the caret at the end of the applied content.

### Refinement

- Refine opens an empty prompt every time.
- Cancel and the refine close button return to the preceding review.
- Refinement sends the latest AI proposal as `targetMarkdown`.
- Successful refinements replace the reviewed proposal without changing the
  original comparison baseline.
- Refinement failures return to the last valid review and can be retried.
- Repeated refinements can continue indefinitely.
- Accept applies only the latest proposal.

### Transactional history

- A successful initial request remains pending until acceptance.
- Every successful refinement creates a separate pending step with its actual
  input and output.
- Accept commits the complete chain newest-first.
- Reject or closing review discards the complete pending chain.
- Failed requests and aborted requests never produce history entries.
- Older accepted sessions remain after a newer session is rejected.
- History list prompts and timestamps correspond to the submitted steps.
- Detail views show the exact input/output for the selected step.
- Back restores list scroll; Close restores focus to Document History.
- A missing detail ID falls back safely to the history list.

## Real-browser end-to-end tests

Run the following critical scenarios against the locally served application and
the real Milkdown dependency:

1. Initial editor renders as a full-screen raw/preview split without unwanted
   editor toolbars or extra preview controls.
2. Typing headings, bold text, lists, and multiline Markdown updates the
   rendered preview.
3. The insertion lightbulb appears after inactivity at the visible caret and
   disappears after new input.
4. Forward, backward, multiline, and full-document selections anchor the
   selection lightbulb near the endpoint where selection finished.
5. Trigger position remains visible near viewport edges and updates on editor
   scrolling.
6. Mock insertion, rewrite, add, remove, unchanged, empty, and error flows show
   the expected loading, retry, diff, and application behavior.
7. Multiple refinements use the previous proposal, clear each refinement
   prompt, and apply only the final accepted result.
8. Accept returns to the source caret instead of scrolling the whole page to the
   bottom, and the contextual lightbulb can appear again afterward.
9. Reject and closing review preserve the source document and selection.
10. Accepted refinement chains appear in Document History; rejected chains do
    not.
11. Large live and saved-history diffs use one shared scroll region while their
    header, prompt/date metadata, and action footer remain visible.
12. Long history prompts ellipsize in list rows but display completely in
    details; Back restores list position.
13. Escape, Tab, Shift+Tab, close buttons, and focus restoration work throughout
    Help, prompt, review, refine, history list, and history detail dialogs.
14. Desktop split layout and narrow-screen stacked layout remain usable without
    clipped actions or horizontal page overflow.
15. Axe finds no serious or critical accessibility violations in the editor,
    Help modal, AI prompt/review, and history views.

Run the full critical workflow on Chromium, Firefox, and WebKit. Restrict the
mobile project to responsive, modal, and primary AI/history smoke scenarios to
keep runtime reasonable.

Prefer semantic locators such as role, accessible name, and label. Use explicit
layout and scroll assertions for the regressions previously found in the modal
and editor. Use screenshots only for a small number of stable responsive views;
do not make the suite depend primarily on broad pixel snapshots.

## CSS and layout verification

CSS is not represented by JavaScript coverage percentages, so verify its
important contracts in Playwright:

- editor panes fill available viewport height;
- desktop and mobile split directions;
- readable dark preview text;
- no unwanted Milkdown toolbar/icon content;
- lightbulb anchoring and edge clamping;
- modal maximum sizes at desktop and mobile viewports;
- shared diff scrolling;
- fixed review/history metadata and action footer regions;
- history prompt ellipsis;
- visible keyboard focus styles;
- no document-level scroll jump after applying an AI edit.

Test behavior and bounding relationships rather than duplicating exact CSS
property values in assertions.

## Test data and utilities

Create small reusable helpers under `tests/support`:

- `createScriptedProvider`: queue success, failure, empty, unchanged, and
  deferred results while recording calls.
- `deferredPromise`: control asynchronous loading and stale-response cases.
- `createHistoryEntry`: deterministic entry factory with override support.
- `createEditorBridgeSpy`: records document, selection, focus, and read-only
  operations.
- `renderApp`: renders `App` with deterministic dependencies and returns a
  configured `userEvent` instance.
- Playwright fixtures for network blocking, editor selection, mock command
  submission, and modal navigation.

Keep fixtures explicit and narrowly scoped. Avoid one oversized helper that
hides the actions and assertions important to each test.

## Reliability rules

- Use fake timers only for the one-second contextual trigger and 600 ms mock
  provider delay; use controlled promises for application loading states.
- Configure `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` in
  tests that combine user events and fake timers.
- Never use arbitrary sleeps in unit or browser tests.
- Prefer role/label queries over classes and test IDs.
- Add a test ID only when no stable semantic or user-visible locator exists,
  primarily for geometry containers.
- Fix timestamps, IDs, locale, timezone, and viewport dimensions where output
  depends on them.
- Restore mocks, timers, DOM mutations, and request handlers after every test.
- Treat console errors, unhandled promise rejections, page errors, and external
  network attempts as failures.
- Keep tests independent and runnable in any order.
- Do not lower coverage thresholds to merge untested behavior; document any
  genuinely browser-only branch and cover it in Playwright.

## Suggested file organization

```text
tests/
  setup/
    unit.ts
  support/
    createEditorBridgeSpy.ts
    createHistoryEntry.ts
    createScriptedProvider.ts
    deferredPromise.ts
    renderApp.tsx
  unit/
    ai/
      mockProvider.test.ts
    components/
      DocumentEditor.test.tsx
      DocumentHistoryModal.test.tsx
      HelpModal.test.tsx
      HistoryDetailModal.test.tsx
      ModalFrame.test.tsx
      SuggestionDiff.test.tsx
    diff/
      computeDiff.test.ts
    editor/
      measureTextareaOffset.test.ts
    history/
      documentHistory.test.ts
      formatHistoryTimestamp.test.ts
      historyEnvironment.test.ts
    App.test.tsx
  e2e/
    accessibility.spec.ts
    ai-workflow.spec.ts
    editor.spec.ts
    history.spec.ts
    responsive-layout.spec.ts
  fixtures/
    browser.ts
playwright.config.ts
vitest.config.ts
```

## Implementation sequence

1. Install and lock the test dependencies and Playwright browser binaries.
2. Add Vitest, JSDOM, MSW, Playwright, coverage, and ignore configuration.
3. Add package scripts and verify an empty smoke test runs in both test layers.
4. Add provider/environment injection and deterministic test factories.
5. Test pure diff, history, timestamp, environment, provider, and measurement
   modules.
6. Test reusable modal, diff, Help, and history components.
7. Test `DocumentEditor` with controlled timers, geometry, and mocked Milkdown.
8. Test complete `App` workflows using the scripted provider and editor bridge.
9. Add browser network blocking and real Milkdown/editor smoke coverage.
10. Add browser AI, refinement, history, scrolling, focus, responsive, and
    accessibility scenarios.
11. Generate the first coverage report, close meaningful gaps, and set the
    final thresholds no lower than the initial targets.
12. Run the complete verification command and review test naming, comments,
    indentation, semicolons, and line lengths.

## Acceptance criteria

- `npm test` runs the deterministic Vitest suite without network access.
- `npm run test:coverage` enforces the agreed thresholds and includes uncovered
  runtime source files in its report.
- `npm run test:e2e` passes against the local app in the configured browser
  projects.
- Any unexpected external request fails the relevant test with the attempted
  URL visible in its error.
- No test requires an API token, OpenRouter account, external server, or remote
  fixture.
- Pure history and diff logic has complete branch coverage.
- Initial, error, retry, accept, reject, close, abort, stale-response, and
  indefinite refinement behaviors are automated.
- Pending refinement chains are committed only on final acceptance and are
  completely discarded otherwise.
- Raw Markdown, real rendered preview, contextual triggers, caret restoration,
  modal focus, and responsive scrolling are verified in a real browser.
- History list/detail behavior, newest-first ordering, full metadata, large diff
  scrolling, and focus restoration are covered.
- Serious and critical accessibility violations fail browser tests.
- `npm run lint`, `npm run build`, `npm run test:coverage`,
  `npm run test:e2e`, and `git diff --check` all pass.
- Test code follows the project's semicolon, indentation, concise-comment, and
  readable-line-length conventions.
