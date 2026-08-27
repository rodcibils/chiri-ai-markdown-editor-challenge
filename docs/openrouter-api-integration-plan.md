# OpenRouter API Integration Plan

## Goal

Replace the production mock suggestion provider with a real OpenRouter-backed
provider while preserving the current editor, scope, diff, refinement, history,
and acceptance behavior.

The OpenRouter API key must remain a server-side secret. It must never appear in
the browser bundle, browser storage, request payloads sent by the browser, logs,
screenshots, tests, source control, or any variable prefixed with `VITE_`.

The existing mock remains available only as an injected deterministic test
double so all automated tests continue to run without API tokens or external
requests.

## Requirements confirmed from `docs/Instructions.pdf`

The assessment provides:

- an OpenRouter API key with a $5 spending cap;
- freedom to use any model available through OpenRouter;
- a requirement that the AI act as a collaborative editor that can suggest
  document or selection changes;
- visible diffs before mutation;
- accept, reject, and iterative refinement behavior;
- a README explaining how to run the project;
- no requirement for authentication, a database, Docker, or unrelated
  infrastructure.

The PDF does not prescribe a model, SDK, deployment host, request schema, or
secret-storage mechanism. This plan therefore chooses the smallest secure
server boundary compatible with the existing Vite application.

## Security decision: the browser must not call OpenRouter directly

Vite replaces `VITE_*` variables in client code at build time. Any API key read
by browser code is visible to users through the JavaScript bundle or developer
tools, regardless of whether its source file is ignored by Git.

Use this architecture:

```text
Browser
  -> POST /api/suggestions
  -> local/server-hosted API route
  -> reads process.env.OPENROUTER_API_KEY
  -> POST https://openrouter.ai/api/v1/chat/completions
  -> returns suggestion Markdown only
  -> existing diff/review/accept/refine workflow
```

Never implement this architecture:

```text
Browser -> OpenRouter with VITE_OPENROUTER_API_KEY
```

`.gitignore` protects a secret from accidental commits, while the server proxy
protects it from being delivered to the browser. Both protections are required.

## Selected server approach

Add a small Express server because the application needs a runtime that can own
the secret. It will:

- expose `POST /api/suggestions` on the same origin as the frontend;
- call OpenRouter with Node's built-in `fetch`;
- serve the built Vite assets in production;
- run beside the Vite development server locally;
- contain no authentication, database, Docker, or persistence;
- apply a small in-memory per-IP rate limit to protect the capped key from easy
  abuse when the showcase is publicly hosted.

The deployment target must support a Node process or an equivalent serverless
function. A static-only host cannot securely use a shared OpenRouter key. If the
chosen host is serverless, reuse the framework-independent request handler and
add a thin platform adapter rather than moving the key into the frontend.

## Dependencies to add

Runtime dependencies:

```sh
npm install express dotenv express-rate-limit
```

Development and server-test dependencies:

```sh
npm install --save-dev @types/express tsx concurrently \
  supertest @types/supertest
```

No OpenRouter or OpenAI SDK is required. A direct `fetch` call keeps the
integration small, makes the exact request visible, and follows OpenRouter's
OpenAI-compatible chat-completions API.

## Environment and secret handling

### Local environment file

Create and commit `.env.example` with names and safe placeholders only:

```dotenv
# Server-only secret. Never prefix this variable with VITE_.
OPENROUTER_API_KEY=

# Choose a chat-capable provider/model slug from https://openrouter.ai/models.
OPENROUTER_MODEL=

# Optional OpenRouter app attribution metadata.
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_APP_NAME=Chiri AI Document Editor

# Local API server configuration.
API_PORT=8787
```

Each developer creates their ignored local file:

```sh
cp .env.example .env.local
```

Then they paste their own key into `OPENROUTER_API_KEY` inside `.env.local` and
choose a current, chat-capable model slug for `OPENROUTER_MODEL`.

### Git protection

Update `.gitignore` explicitly:

```gitignore
.env
.env.*
!.env.example
```

Keep the existing `*.local` rule as additional protection. Verify before every
commit that `.env.local` is ignored:

```sh
git check-ignore -v .env.local
git status --short
```

Never place the real emailed key in `.env.example`, README examples, tests,
fixtures, source files, shell history examples, screenshots, or AI transcripts.
If a key is ever committed or printed publicly, revoke it in OpenRouter and
replace it; removing it from the latest Git commit is not sufficient.

### Deployment secrets

Configure `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in the hosting platform's
encrypted environment/secret settings. Do not upload `.env.local` to the host.

Fail server startup with a clear message when required variables are missing,
but log variable names only. Never log secret values or a partially masked key.

## OpenRouter request contract

The server will call:

```text
POST https://openrouter.ai/api/v1/chat/completions
```

Headers:

```text
Authorization: Bearer <server-only OPENROUTER_API_KEY>
Content-Type: application/json
HTTP-Referer: <OPENROUTER_SITE_URL, when configured>
X-OpenRouter-Title: <OPENROUTER_APP_NAME, when configured>
```

The authorization and chat-completion format follow the
[OpenRouter quickstart](https://openrouter.ai/docs/quickstart). The attribution
headers are optional for API execution and should be added only from server-side
configuration.

Request body:

```json
{
  "model": "<OPENROUTER_MODEL>",
  "messages": [
    {
      "role": "system",
      "content": "<Markdown editing contract>"
    },
    {
      "role": "user",
      "content": "<document, target, scope, and instruction>"
    }
  ],
  "temperature": 0.3,
  "max_completion_tokens": 2000
}
```

Use a conservative completion limit to protect the $5 budget and prevent
responses that are too large for the current review UI. Make the model
environment-configurable so it can be changed without rebuilding the client.
Do not automatically retry billable requests; an ambiguous timeout could have
already consumed tokens. Let the user explicitly retry through the existing UI.

## Prompt contract

The system instruction must require the model to:

- return only replacement Markdown;
- omit code fences around the complete response;
- omit explanations, preambles, diff markers, and commentary;
- honor the exact selection, insertion, or document scope;
- use the complete document only as context when editing a smaller target;
- preserve Markdown structure unless the user asks to change it;
- treat document content as content to edit, not as higher-priority system
  instructions;
- produce an empty response only when truly unable to comply.

The user message should delimit fields unambiguously:

```text
USER INSTRUCTION
<instruction>

SCOPE
<selection | insertion | document plus source offsets when useful>

TARGET MARKDOWN
<exact target sent by the existing workflow>

DOCUMENT CONTEXT
<complete Markdown document>
```

For an insertion, include the insertion position and empty target. For a
selection, include the selected Markdown and immutable offsets. For refinement,
the existing workflow already sends the latest AI proposal as
`targetMarkdown`; retain that behavior so refinement iterates over the previous
result rather than restarting from the original text.

## Internal API route

### Browser request

Continue using the existing `SuggestionRequest` fields but omit `AbortSignal`
from JSON serialization:

```json
{
  "documentMarkdown": "# Document...",
  "targetMarkdown": "Selected or latest proposed Markdown",
  "instruction": "Make it clearer",
  "scope": {
    "kind": "selection",
    "from": 10,
    "to": 42
  }
}
```

### Browser response

```json
{
  "suggestion": "Replacement Markdown returned by the model"
}
```

Use one shared TypeScript module for the serializable route request, success
response, and public error response. Keep `AbortSignal` in the client-only
`SuggestionRequest` interface.

### Validation

The server must reject:

- non-JSON requests;
- missing or whitespace-only instructions;
- invalid scope discriminators or coordinates;
- selection ranges outside the document;
- targets that do not match the captured selection when applicable;
- oversized documents, prompts, or request bodies;
- malformed OpenRouter responses;
- empty model content.

Use named constants for limits and return HTTP 400 or 413 without contacting
OpenRouter when validation fails.

## Server organization

Suggested files:

```text
server/
  config.ts
  index.ts
  openRouterClient.ts
  prompt.ts
  suggestionHandler.ts
src/
  ai/
    httpProvider.ts
    provider.ts
    suggestionApi.ts
tests/
  unit/
    ai/httpProvider.test.ts
    server/config.test.ts
    server/openRouterClient.test.ts
    server/prompt.test.ts
    server/suggestionHandler.test.ts
```

Responsibilities:

- `server/config.ts`: load `.env.local`, validate required variables, and return
  immutable configuration without logging values.
- `server/prompt.ts`: pure prompt construction from a validated request.
- `server/openRouterClient.ts`: call OpenRouter, parse content, and normalize
  upstream failures.
- `server/suggestionHandler.ts`: validate the internal request and map results
  to safe HTTP responses.
- `server/index.ts`: configure Express, JSON limits, rate limiting, route wiring,
  health check, and production static-file serving.
- `src/ai/suggestionApi.ts`: shared serializable internal route types.
- `src/ai/httpProvider.ts`: browser adapter implementing
  `SuggestionProvider` through same-origin `fetch('/api/suggestions')`.

Keep prompt construction and response parsing pure or dependency-injected so
they can be tested without network access.

## Client provider replacement

Add `HttpSuggestionProvider implements SuggestionProvider`:

- accept an endpoint that defaults to `/api/suggestions`;
- serialize all request fields except `signal`;
- pass the existing signal to browser `fetch`;
- require JSON success responses containing a non-empty `suggestion` string;
- parse safe server error bodies;
- map unavailable or malformed responses to concise user-facing errors;
- never know about `OPENROUTER_API_KEY`, the OpenRouter URL, or authorization
  headers.

Change the production default in `App` or `main.tsx` from
`MockSuggestionProvider` to `HttpSuggestionProvider`. Preserve the existing
optional provider injection on `App` for deterministic tests.

Move `MockSuggestionProvider` to test support, or keep it in `src/ai` only if an
explicit offline-development mode remains useful. It must not be selected by
the production entrypoint.

## Development and production commands

Add scripts similar to:

```json
{
  "dev": "concurrently -k npm:dev:client npm:dev:server",
  "dev:client": "vite",
  "dev:server": "tsx watch server/index.ts",
  "build": "tsc -b && vite build && tsc -p tsconfig.server.json",
  "start": "node dist-server/server/index.js"
}
```

Configure Vite to proxy `/api` to `http://127.0.0.1:8787` during development.
The browser should always call the relative same-origin route; do not add CORS
or expose the OpenRouter host to client code.

Add `tsconfig.server.json` with Node types, strict checking, readable output,
and no inclusion of browser test files.

## Error handling and cancellation

### Server mappings

- Missing local configuration: fail startup with setup instructions.
- Invalid browser request: 400.
- Oversized request: 413.
- Local rate limit exceeded: 429 with `Retry-After`.
- OpenRouter 401/403: 502 with a generic server-configuration message.
- OpenRouter 429: 429 with a user-safe retry message.
- Other OpenRouter 4xx: 502 without echoing the upstream body.
- OpenRouter 5xx or network failure: 502/503.
- Empty or malformed completion: 502.
- Client cancellation: abort the upstream request and do not send a late
  response.

Do not return upstream stack traces, raw bodies, request headers, provider
metadata, or the key to the browser.

### Existing UI behavior

Keep the current UI guarantees:

- initial failures preserve the entered prompt for retry;
- refinement failures return to the last valid review;
- closing an in-flight dialog aborts the request;
- late or stale responses cannot replace a newer request;
- no document mutation occurs before Accept;
- failed or aborted requests do not enter Document History.

Update mock-specific help text and prompt instructions so production users do
not see `[mock:*]` commands. The Help modal should state that suggestions use a
configured AI model, without exposing provider credentials or configuration.

## Cost and public endpoint controls

The emailed key already has a $5 OpenRouter spending cap. Preserve that cap and
add application-side safeguards:

- conservative request/document limits;
- conservative completion-token limit;
- low temperature to reduce unnecessary retries;
- one active upstream request per browser workflow;
- no automatic billable retries;
- in-memory per-IP rate limiting;
- configurable, pinned model slug;
- no endpoint that reveals key metadata or remaining credits;
- structured logs containing request ID, status, model, and duration only, not
  document text or prompts.

The rate limit protects against accidental or casual abuse but is not strong
authentication. Document that a publicly shared no-auth showcase can still
consume the capped budget.

## Offline testing strategy

No automated test may call OpenRouter.

### Client adapter tests

Use existing MSW support to test:

- exact `/api/suggestions` method and JSON payload;
- omission of `AbortSignal` from JSON;
- successful suggestion parsing;
- browser abort propagation;
- 400, 413, 429, 500, and malformed-response errors;
- no authorization header sent by the browser;
- no OpenRouter host requested by client code.

### Server tests

Build the Express app through a factory and test it with Supertest. Inject a
fake OpenRouter client or mock `fetch` with MSW. Cover:

- missing configuration without exposing values;
- every validation rule and size limit;
- prompt construction for insertion, selection, document, and refinement;
- exact OpenRouter URL, headers, model, messages, and token limit;
- optional attribution headers;
- successful response extraction;
- all upstream status mappings;
- string and malformed completion content;
- cancellation and timeout behavior;
- rate limiting;
- absence of secrets and upstream bodies in public errors and logs.

### App and browser tests

- Continue injecting scripted providers into App unit tests.
- Keep `onUnhandledRequest: 'error'` for Vitest.
- In Playwright, fulfill `/api/suggestions` locally with deterministic fixture
  responses.
- Keep blocking every non-loopback origin, so an attempted OpenRouter request
  fails the test.
- Add browser cases for success, retry, empty output, refinement, rejection,
  acceptance, and history without spending tokens.

The normal test and coverage commands must work without `.env.local` and without
`OPENROUTER_API_KEY`.

## README updates

Update README as part of implementation to explain:

- that production suggestions use OpenRouter through a server proxy;
- Node and package installation requirements;
- `cp .env.example .env.local`;
- required `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` variables;
- where to choose a model slug;
- that `OPENROUTER_SITE_URL` and `OPENROUTER_APP_NAME` are optional attribution;
- why the key must not use a `VITE_` prefix;
- how to verify `.env.local` is ignored;
- local `npm run dev`, production build/start, lint, unit, coverage, and E2E
  commands;
- how deployment secrets are configured conceptually;
- that tests always mock the internal endpoint and never consume tokens;
- how to rotate the key if it is exposed.

Do not paste or partially display the emailed API key in README.

## Implementation sequence

1. Add explicit environment ignores and commit `.env.example` with placeholders.
2. Add Express, dotenv, rate-limit, development-runner, and server-test
   dependencies.
3. Add shared internal API request/response/error types.
4. Add strict server configuration loading and validation.
5. Add pure scope-aware prompt construction.
6. Add the OpenRouter fetch client and sanitized upstream error mapping.
7. Add the validated, rate-limited `/api/suggestions` Express route.
8. Add production static serving, server TypeScript build, Vite proxy, and
   development/production scripts.
9. Add `HttpSuggestionProvider` and make it the production default.
10. Remove mock commands and offline wording from production UI while retaining
    the mock as a test double.
11. Add client, server, App, and browser tests with all external requests
    intercepted or rejected.
12. Update README setup, secret, deployment, testing, and troubleshooting
    sections.
13. Run secret scans and all verification commands.

## Verification commands

Before using a real key:

```sh
git check-ignore -v .env.local
npm run lint
npm run test:coverage
npm run build
npm run test:e2e
git diff --check
```

Perform one manual real-provider smoke test only after offline verification:

1. Put the key in ignored `.env.local`.
2. Start the application through `npm run dev`.
3. Make one short insertion request with a small prompt.
4. Confirm the browser request targets `/api/suggestions`, not OpenRouter.
5. Confirm browser request headers and built assets contain no key.
6. Confirm the response appears in the existing diff review.
7. Accept or reject it and verify editor/history behavior.
8. Inspect server logs to confirm prompt, document, authorization header, and key
   are absent.

Do not record the real key or full authorization header while documenting this
smoke test.

## Acceptance criteria

- Production browser code uses `HttpSuggestionProvider` and never imports or
  initializes the mock provider.
- The browser calls only same-origin `/api/suggestions` for AI work.
- Only server code reads `OPENROUTER_API_KEY`.
- No `VITE_*` variable contains the key.
- `.env.local` is ignored and `.env.example` contains placeholders only.
- Missing configuration fails clearly without leaking values.
- The server validates scope and input before making a billable request.
- OpenRouter responses produce Markdown-only suggestions in the existing review
  UI.
- Accept, Reject, Refine, cancellation, stale-response protection, and Document
  History behave as before.
- Errors are safe, actionable, and retryable where appropriate.
- Public requests are size-limited, completion-limited, and rate-limited.
- All automated tests run without a key, external AI request, or token usage.
- Client and server tests fail on any unhandled external request.
- README accurately documents local secret setup and production deployment.
- Lint, coverage, build, E2E, whitespace, and secret checks pass.
