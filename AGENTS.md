# Agent Guide for Chiri

This file is the repository-level handoff for coding agents and future
maintainers. Read it before changing code. Keep it updated when architecture,
commands, or non-obvious invariants change.

## Project at a glance

Chiri is a React + TypeScript Markdown editor. The UI has a raw Markdown
textarea on the left, a read-only Milkdown/Crepe preview on the right, contextual
AI idea triggers, AI review/refinement dialogs, and in-memory accepted-change
history.

The server is an Express + TypeScript proxy. Browser code calls only the
same-origin `/api/suggestions` route. The server owns the OpenRouter credential
and calls the fixed OpenRouter chat-completions endpoint. Never move the API key
into browser code or a `VITE_*` variable.

Important directories:

- `src/App.tsx` — application state and AI/history workflow orchestration.
- `src/components/` — editor, preview, dialogs, diff, and icons.
- `src/ai/` — provider contract, HTTP provider, mock provider, and request
  construction.
- `src/history/` — pure in-memory history reducer and environment boundary.
- `src/diff/` — Markdown comparison logic.
- `src/editor/` — textarea caret/selection measurement.
- `server/` — validation, prompt construction, OpenRouter client, and Express
  routes.
- `tests/unit/` — Vitest tests that must not call the real network.
- `tests/e2e/` — Playwright browser tests against the local Vite client.
- `docs/` — requirements, implementation plans, and security/performance audits.

Read `docs/Instructions.pdf` when a task concerns the required product behavior
or external API contract. Read the most relevant plan and the latest audit
before extending an existing feature.

## Architecture and invariants

Preserve these boundaries unless the task explicitly changes them:

1. `SuggestionProvider` is the client-side seam. Production uses
   `HttpSuggestionProvider`; tests inject a fake or the deterministic mock.
2. `HttpSuggestionProvider` sends JSON to the same-origin server route and never
   accepts or exposes an API secret.
3. The server validates document, target, instruction, operation, scope, offsets,
   and size before invoking a provider.
4. Refinement requests use the latest AI proposal as their working target. The
   original application scope remains immutable so accepting a proposal changes
   only the captured editor range.
5. The preview creates one Crepe instance per component lifecycle. Markdown
   updates use the editor replacement action and a short debounce; do not add a
   Markdown-dependent mount effect that destroys/recreates Crepe per keystroke.
6. AI output is data: show it in a diff and require explicit Accept before
   applying it. Rejecting or closing a session must not commit history.
7. History entries are pending during a refinement chain and become visible only
   after final acceptance. History is in-memory and disappears on page reload.
8. Full document context is currently intentionally sent to the provider for
   continuity. Do not silently change that privacy/product trade-off.
9. Markdown must be rendered through the existing safe editor/rendering path.
   Do not introduce `dangerouslySetInnerHTML`, `eval`, `new Function`, or raw
   HTML injection for convenience.

## Code style and readability

The repository favors deliberately readable TypeScript and CSS over compressed
one-line code.

- Use two spaces for indentation, LF line endings, and a final newline.
- Terminate TypeScript/JavaScript statements with semicolons.
- Prefer a maximum line width of about 100 characters. Break function calls,
  object literals, JSX props, unions, and CSS declarations when they become
  difficult to scan. Keep unavoidable URLs or generated-like literals intact.
- Use one logical statement or expression per line where practical. Avoid
  semicolon-separated statements on one line.
- Keep JSX props and nested conditional expressions vertically aligned.
- Format CSS with one selector per logical block, two-space indentation, and
  readable spacing between related rules and media queries.
- Preserve the existing single-quote TypeScript convention unless a string
  requires otherwise.
- Prefer named constants for timing, size, and UI limits. Explain non-obvious
  values at their declaration or use site.
- Keep pure domain helpers separate from React effects and network boundaries so
  they remain easy to test.

### KDoc/TSDoc comments

TypeScript does not have Kotlin KDoc; use TSDoc/JSDoc block comments (`/** ... */`)
with the same purpose. Add a concise comment for:

- every exported function, class, interface, type with non-obvious semantics,
  React component, and public method;
- private/internal methods whose purpose, lifecycle, side effects, or invariant
  is not obvious from the name;
- callbacks passed across a component or service boundary; and
- constants whose value represents a product, security, or performance decision.

For public or non-trivial methods, document inputs and outputs with `@param` and
`@returns`; add `@throws` when callers can observe an exception. Explain the
contract and constraints, not every obvious line. Inside function bodies, add
short comments where they clarify *why* an ordering, cleanup, guard, snapshot,
or browser workaround is required. Do not narrate straightforward assignments
or duplicate the method name in prose.

Before finishing a change, scan new/modified methods for missing comments and
scan comments for stale names, limits, or behavior.

## React and lifecycle guidance

- Do not read or write `ref.current` during render. Use event handlers or effects.
- Keep effect dependency arrays correct; do not suppress hook lint rules to make
  an effect compile.
- Cancel timers, animation frames, observers, fetches, and editor instances in
  cleanup paths.
- Keep raw editor updates immediate and preview work bounded/debounced.
- Preserve focus and the captured selection/caret when closing AI dialogs or
  applying a suggestion.
- Maintain accessible labels, dialog titles, keyboard focus behavior, and visible
  error/retry states when changing UI.

## Server and security guidance

- Keep `OPENROUTER_API_KEY` server-only in ignored `.env.local` or deployment
  secret storage. Never print it, commit it, put it in tests, or include it in
  screenshots/logs.
- Keep the upstream URL fixed and normalize provider failures to safe public
  errors. Do not return upstream response bodies to the browser.
- Preserve request body, field, scope, and response-size limits. Any new limit
  should have a named constant, a safe default, and boundary tests.
- Any upstream request must have disconnect handling, a server deadline, and a
  bounded concurrency policy once those controls are implemented.
- Do not log prompts, documents, AI responses, credentials, or authorization
  headers. Metrics may contain aggregate counts, latency, status, model, and
  token totals.
- Treat Markdown and model output as untrusted data. Explicit user review is
  required before applying AI output.

## Testing and verification

Tests are offline by design. Do not make a real OpenRouter request from unit,
component, or browser tests.

Use the existing scripts:

```sh
npm run lint
npm run build
npm run test
npm run test:coverage
npm run test:e2e
npm run verify
```

When changing server behavior, prefer an injected `SuggestionGenerationClient`
and local `supertest` requests. When changing browser behavior, use the existing
provider injection or request interception. Add tests for successful behavior,
errors, cancellation/cleanup, boundaries, and repeated refinement where
applicable. Do not lower coverage thresholds to hide untested code.

If a dependency is missing, report the exact package and installation command to
the user instead of silently changing the lockfile or assuming network access.

## Change checklist

Before handing off a change:

- confirm the change matches the relevant requirement/plan and does not overwrite
  unrelated user work;
- keep code, comments, indentation, semicolons, and CSS readable;
- verify new public/non-obvious methods have concise TSDoc and useful inner
  comments;
- preserve secrets and generated-directory exclusions;
- run the narrowest relevant tests, then lint/build when practical;
- inspect `git diff --check` and `git status --short`; and
- mention any command that could not run, any dependency the user must install,
  and any remaining risk.

Do not edit `node_modules`, `dist`, `dist-server`, `coverage`, Playwright output,
or other generated artifacts as part of a source change.
