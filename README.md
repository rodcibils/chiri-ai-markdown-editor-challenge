# Chiri AI Document Editor

Chiri is a single-page Markdown editor for working with an AI collaborator. Write raw Markdown on the left, see its rendered result on the right, and request scoped suggestions at the cursor or for selected text. Every suggestion is shown as a diff and requires explicit acceptance before changing the document.

## Features

- Raw Markdown editing with a rendered Milkdown/Crepe preview.
- Contextual AI idea triggers at the cursor and beside a text selection.
- Selection/insertion scoped suggestions; use `Ctrl+A` / `Cmd+A` for the whole document.
- Colored diff review with Accept, Reject, and iterative Refine actions.
- In-memory history of accepted AI changes, including accepted refinements.
- Download the current raw Markdown document as a local `chiri-document.md` file.
- Server-protected OpenRouter integration with no API key in browser code.
- Deterministic mock provider for offline automated tests.

## Requirements

- Current Node.js LTS and npm.
- An OpenRouter account and API key for local AI generation. The key is not required for tests or for running the Vite client by itself.

## Installation and setup

From the repository root:

```bash
npm install
cp .env.example .env.local
```

Set these server-only values in `.env.local`:

```dotenv
OPENROUTER_API_KEY=your-server-only-key
OPENROUTER_MODEL=provider/model-slug
```

Optional values are documented in `.env.example`:

```dotenv
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_APP_NAME=Chiri AI Document Editor
API_PORT=8787
OPENROUTER_MAX_COMPLETION_TOKENS=2000
```

Never give `OPENROUTER_API_KEY` a `VITE_` prefix: Vite exposes `VITE_*` values to browser code. Local environment files are ignored by Git; only the empty `.env.example` template is tracked. Verify this before committing:

```bash
git check-ignore -v .env.local
git status --short
```

Never commit, log, screenshot, or paste the key into source code or tests. Use the deployment platform's encrypted secret store for hosted environments. If a key is exposed, revoke and replace it immediately.

## Build and run

Start the Vite client and Express API server together:

```bash
npm run dev
```

The client proxies `/api` to the Express server on port `8787` by default. The server requires the OpenRouter variables above.

Run only the client to inspect the editor UI without an API server:

```bash
npm run dev:client
```

AI requests will not work in client-only mode unless another compatible `/api` server is available.

Build production client and server output, then run the compiled server:

```bash
npm run build
npm start
```

The server serves the client from `dist/` and compiled server code from `dist-server/`. `npm run preview` serves the Vite build for client-only preview; it does not replace the API server.

## Using the editor

1. Type Markdown in the left **Raw Markdown** pane. The right **Rendered Preview** pane updates as you edit.
2. Leave the cursor still briefly. A lightbulb appears near the insertion point.
3. Or select text. A lightbulb appears near the end of the selection; only that captured text may be replaced.
4. Press the lightbulb, describe the desired change, and submit the prompt. The editor is read-only while the suggestion is generated.
5. Review the existing-versus-suggested diff. Choose **Accept**, **Reject**, or **Refine**. Refinement always starts from the latest proposal.
6. Open **Document History** to inspect accepted AI steps. History is in memory for the current page and is ordered newest first.
7. Open **Help** for a short explanation of the contextual controls.
8. Press the Download icon in the header to save the current accepted raw Markdown as `chiri-document.md`. Downloading is local and does not call OpenRouter.

The product intentionally sends the full document as model context even for a selection or insertion. Do not include sensitive content unless that data flow is acceptable for the configured provider.

## Offline mock behavior

Production uses the server-backed HTTP provider. Tests inject `MockSuggestionProvider`, which never calls OpenRouter. Include these tokens in an instruction to exercise deterministic states:

- `[mock:error]` — provider failure and retry flow.
- `[mock:empty]` — empty response validation.
- `[mock:unchanged]` — target returned unchanged.
- `[mock:add]` — visible added section.
- `[mock:remove]` — shortened target showing deletions.
- `[mock:rewrite]` — rewritten target containing the instruction.

Other instructions produce a visible mock revision. Refinement uses the previous proposal, so repeated review can be tested without API tokens.

## Architecture and data flow

```text
Raw Markdown textarea + selection state
  -> contextual trigger and captured scope
  -> SuggestionProvider interface
  -> HttpSuggestionProvider -> same-origin /api/suggestions
  -> Express validation and OpenRouter client
  -> side-by-side diff review
  -> explicit accept/reject
  -> in-memory accepted history
```

The provider interface is transport-neutral. Tests inject a mock while production uses the server proxy. Refinement uses the latest proposal as a working snapshot, while acceptance applies only to the original captured editor range.

## Folder structure

- `src/App.tsx` — application state and AI/history orchestration.
- `src/components/` — editor, preview, dialogs, diff, and icons.
- `src/ai/` — provider contract, HTTP/mock providers, and request construction.
- `src/history/` — pure in-memory history reducer and formatting.
- `src/diff/` — pure Markdown diff computation.
- `src/editor/` — textarea caret and selection measurement.
- `src/download/` — client-only Markdown Blob download utility.
- `src/types.ts` — shared client domain types.
- `server/` — Express routes, validation, prompt construction, configuration, and OpenRouter client.
- `tests/unit/` — Vitest unit/component tests; these are offline only.
- `tests/e2e/` — Playwright browser tests against the local Vite client.
- `docs/` — requirements, implementation plans, and audits.
- `AGENTS.md` — agent handoff, conventions, architecture invariants, and checklist.
- `.editorconfig` — indentation and whitespace defaults.

## Code style and contributor guidance

Read [AGENTS.md](AGENTS.md) before making changes. It is the repository source of truth for architecture invariants, security boundaries, testing, and agent handoff expectations. Key conventions are:

- Use two spaces, LF line endings, final newlines, and semicolons in TypeScript.
- Keep TypeScript, JSX, and CSS vertically readable; target roughly 100 characters per line and avoid multiple statements on one line.
- Use concise TSDoc/KDoc-style `/** ... */` comments for exported functions, components, public/non-obvious methods, and meaningful constants. Document inputs and outputs with `@param` and `@returns` where useful.
- Add short inner comments for non-obvious guards, cleanup, snapshots, browser workarounds, and security/performance decisions.
- Do not read or write React refs during render. Clean up timers, observers, fetches, and editor instances in effects.
- Keep secrets server-only and preserve offline provider injection in tests.
- Do not edit generated directories such as `node_modules/`, `dist/`, `dist-server/`, `coverage/`, or Playwright output.

## Verification commands

```bash
npm run lint
npm run build
npm run test
npm run test:coverage
npm run test:e2e
npm run verify
```

All tests must run without a real OpenRouter request. Server tests should inject a fake generation client and use local HTTP requests; browser tests should use provider injection or request interception.

## Known limitations and TODOs

The prioritized work is tracked in [`docs/security-performance-audit.md`](docs/security-performance-audit.md).

### High priority before public deployment

- **SEC-01:** Define the deployment boundary. Local-only deployments should bind to loopback; public deployments need authentication, per-user quotas, shared rate limiting, correct proxy trust, and spending monitoring.
- **SEC-02:** Add a server-enforced provider timeout, bounded concurrency, safe timeout/saturation responses, and cleanup tests.
- **PERF-02:** Compress static assets, cache hashed files correctly, and defer the heavy preview dependency where possible. Chunk splitting alone only hides the warning; it does not reduce eager startup work.

### Medium priority scalability and assurance

- **SEC-03:** Define HTTPS/TLS termination ownership and add security headers, including a compatible Content Security Policy.
- **SEC-04:** Bound upstream response bytes, returned suggestion characters, and the configured completion-token range before buffering or rendering.
- **PERF-03:** Budget model input tokens, avoid whole-document prompt duplication, and reject over-budget requests before billing.
- **PERF-04:** Bound or offload large diff computation and DOM rendering while preserving shared-scroll review behavior.
- **PERF-05:** Cap in-memory history by entries and bytes while keeping accepted refinement sessions atomic.
- **PERF-06:** Coalesce caret measurements per animation frame and reuse the hidden measurement mirror for large documents.
- **QA-01:** Include server files in coverage and add offline `supertest` integration tests for routes, limits, errors, cancellation, and concurrency.

### Low priority and product follow-up

- **SEC-05:** Strengthen prompt boundaries and add adversarial prompt tests for Markdown containing fake roles or section labels.
- **PRIV-01:** Document that full document context is sent to the provider and consider an explicit selection-only privacy mode in the future.
- Add persistence, export/import, authentication, multi-user collaboration, and richer structural diffs if the product grows beyond this showcase.

The previous refinement-validation failure and per-keystroke preview recreation are resolved; see the audit's resolved-findings section for evidence.
