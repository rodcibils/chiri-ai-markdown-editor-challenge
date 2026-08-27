# Security and Performance Audit

Date: 2026-08-27

## Executive summary

The application has a sound basic trust boundary: the OpenRouter credential is
kept on the server, the upstream URL is fixed, request fields are validated,
the editor is locked while a proposal is reviewed, and AI output is not applied
without explicit user acceptance. The current dependency tree also has no known
advisories according to `npm audit` at the time of this review.

The audit found no critical issue, but it found five high-priority issues:

1. Real-API refinement requests fail server validation after the first model
   response.
2. A publicly reachable suggestion endpoint can be used by unauthenticated
   callers to spend the shared OpenRouter budget.
3. Upstream requests have no server-side deadline or concurrency limit.
4. The Markdown preview destroys and recreates a full Crepe editor after every
   keystroke.
5. The production page eagerly loads about 1.66 MiB of assets and the built-in
   Express server does not compress them.

The recommended implementation order is described under **Remediation plan**.

## Scope and method

The review covered:

- all application and server TypeScript;
- Vite, TypeScript, test, and Playwright configuration;
- production static-file behavior;
- secret-handling and environment-file rules;
- request validation, rate limiting, provider calls, and error handling;
- Markdown rendering, diff computation, contextual-trigger measurement, and
  in-memory history;
- the installed dependency graph and current npm advisories;
- production build output and test coverage.

Commands run during the audit:

```sh
npm audit --json
npm run build
npm run test:coverage
npm ls --depth=0
```

Observed results:

- `npm audit`: 0 known vulnerabilities across 671 dependencies;
- build: passed without a chunk-size warning;
- tests: 39 passed across 17 files;
- reported client coverage: 81.76% statements, 71.60% branches, 81.08%
  functions, and 83.73% lines;
- eager production assets referenced by `dist/index.html`: 23 files,
  1,698,743 raw bytes and approximately 531,561 gzip bytes.

This is a source and local-build audit, not a penetration test of a deployed
environment. Git history and hosting-platform settings were not scanned.

## Severity definitions

| Severity | Meaning |
| --- | --- |
| Critical | Immediate compromise, secret disclosure, or destructive impact is likely. |
| High | Material cost, availability, correctness, or user-impact risk; address before public deployment. |
| Medium | Meaningful hardening or scalability issue; schedule after high-priority work. |
| Low | Defense-in-depth, maintainability, or limited-scope risk. |
| Informational | Positive control, accepted trade-off, or observation requiring no immediate change. |

## Findings summary

| ID | Severity | Area | Finding |
| --- | --- | --- | --- |
| REL-01 | High | Correctness | Refinement requests are rejected by scope validation. |
| SEC-01 | High when public | Cost/security | The billable AI endpoint is unauthenticated and protected only by a per-process IP limiter. |
| SEC-02 | High | Availability | OpenRouter calls have no server deadline or concurrency bound. |
| PERF-01 | High | Editor | The preview recreates Crepe on every source change. |
| PERF-02 | High | Delivery | Chunk splitting hides the size warning but the page still eagerly loads about 1.66 MiB; Express adds no compression. |
| SEC-03 | Medium | Browser/server | Production security headers and an explicit HTTPS deployment contract are absent. |
| SEC-04 | Medium | Resource control | Upstream response and returned suggestion sizes are not independently bounded. |
| PERF-03 | Medium | AI cost/latency | Input token cost is not budgeted and document-scope text is duplicated in the prompt. |
| PERF-04 | Medium | Diff UI | Large word-level diffs run synchronously and render an unbounded number of spans. |
| PERF-05 | Medium | Memory | Accepted history grows without an entry or byte limit. |
| PERF-06 | Medium | Editor | Caret measurement creates and lays out a full document mirror during trigger repositioning. |
| QA-01 | Medium | Assurance | Server code is excluded from coverage and HTTP controls lack integration tests. |
| SEC-05 | Low | AI safety | Prompt delimiting can be strengthened against document-level prompt injection. |
| PRIV-01 | Informational | Privacy | Full document context is sent for scoped changes as an explicit continuity trade-off. |

## Detailed findings

### REL-01 — Refinement requests fail server validation

Severity: **High**

Evidence:

- `src/App.tsx:252-269` sends the latest AI proposal as `targetMarkdown` during
  refinement while retaining the original document and scope.
- `server/suggestionHandler.ts:130-152` requires an insertion target to remain
  empty and a selection target to equal the original document slice.

The first selection or insertion request is valid. After the provider returns a
proposal, refinement sends that proposal as the target. It no longer equals the
captured selection, and it is no longer empty for an insertion. The server
therefore returns HTTP 400 before OpenRouter is called. A direct validation
check reproduced both failures.

Recommended change:

1. Add an explicit request mode such as `operation: "initial" | "refinement"`.
2. For initial requests, retain the strict captured-document validation.
3. For refinement requests, validate the immutable original scope separately
   and treat the latest proposal as a refinement target rather than as the
   original document slice.
4. Consider fields such as `originalTargetMarkdown` and
   `workingTargetMarkdown` so the contract is unambiguous.
5. Add route-level tests covering selection and insertion refinement chains.

Acceptance criteria:

- initial targets cannot claim text outside their captured scope;
- a refinement operates on the immediately previous proposal;
- repeated refinement works for selection and insertion scopes;
- the final accepted value is still applied only to the original immutable
  editor range.

### SEC-01 — Public callers can spend the shared AI budget

Severity: **High for a public deployment; Low for loopback-only development**

Evidence:

- `server/index.ts:8-12` binds the server to all interfaces;
- `server/app.ts:18-33` exposes the billable endpoint without authentication;
- the only abuse control is the default in-memory, per-IP rate limiter at 20
  requests per minute.

Same-origin browser behavior and the lack of CORS reduce drive-by browser
requests, but they do not stop scripts, bots, or direct HTTP clients. The
in-memory limiter resets on restart, is not shared across replicas, and can be
bypassed using multiple source addresses. Behind a reverse proxy, the default
Express client-IP behavior may instead group every user under the proxy address
unless `trust proxy` is configured correctly.

Recommended change:

1. Decide and document whether the application is local-only or publicly
   hosted.
2. If local-only, bind to `127.0.0.1` by default and require an explicit setting
   to listen publicly.
3. If public, add an authenticated or signed user/session boundary and enforce
   per-user quotas in addition to IP limits.
4. Use a shared rate-limit store or hosting-platform/WAF controls when running
   more than one process.
5. Configure `trust proxy` with an explicit hop count for the selected host;
   never enable it indiscriminately.
6. Add a maximum concurrent generation count and retain the OpenRouter account
   spending cap.
7. Record request counts, duration, status, model, and token usage without
   logging prompts, documents, responses, or credentials.

### SEC-02 — No upstream timeout or concurrency limit

Severity: **High**

Evidence:

- `server/openRouterClient.ts:41-59` relies only on the caller's abort signal;
- `server/suggestionHandler.ts:25-49` aborts when the browser disconnects but
  has no independent deadline;
- there is no process-wide limit on simultaneous OpenRouter calls.

A slow or stalled upstream can hold a connection and memory indefinitely while
the user waits. Multiple such requests can exhaust server sockets and consume
all available work. The per-minute limiter does not prevent the allowed
requests from running concurrently.

Recommended change:

1. Add a bounded server timeout, for example 45–60 seconds.
2. Combine the disconnect signal with the deadline signal using
   `AbortSignal.any`, or an equivalent helper with deterministic cleanup.
3. Map deadline expiry to a safe HTTP 504 response and keep client cancellation
   distinct.
4. Add a small process-wide concurrency gate; return 503 or queue only for a
   short bounded period when saturated.
5. Do not automatically retry billable calls because a timed-out request may
   already have consumed tokens.

### PERF-01 — Preview editor recreated after every keystroke

Severity: **High**

Evidence:

- `src/components/DocumentEditor.tsx:471-518` creates a new `Crepe` instance in
  an effect whose dependency is the complete Markdown string;
- cleanup destroys the previous instance on every source edit.

Each keystroke schedules asynchronous editor creation, parsing, DOM creation,
and destruction. Fast typing can leave multiple create/destroy operations in
flight. The cost grows with document size and can produce input lag, visual
flicker, garbage-collection pressure, and difficult lifecycle races.

Recommended change:

1. Create the preview editor once and store it in a ref.
2. Update its document through Milkdown's replacement transaction, such as the
   provided `replaceAll` action, instead of recreating the editor.
3. Debounce preview parsing by approximately 100–250 ms while keeping the raw
   textarea update immediate.
4. Ensure only the final pending update runs and destroy the editor once on
   component unmount.
5. Add a performance regression test or browser benchmark using 10 KB and
   100 KB documents with sustained typing.

### PERF-02 — Large eager payload and no production compression

Severity: **High**

Evidence:

- the production HTML eagerly module-preloads Milkdown chunks;
- the measured eager asset set is 1,698,743 raw bytes and approximately
  531,561 gzip bytes across 23 files;
- `vite.config.ts:14-25` splits Milkdown by maximum chunk size, which removes the
  warning but does not make those chunks lazy;
- `server/app.ts:35-37` uses default `express.static`, which does not dynamically
  gzip or Brotli-compress responses;
- hashed assets use the static middleware's default zero cache lifetime.

The current chunking satisfies the warning threshold but does not materially
reduce initial download or parse cost. When served directly by this Node
process, the theoretical gzip size shown by Vite is not the actual transferred
size unless an external proxy adds compression.

Recommended change:

1. Replace full Crepe in the read-only preview with a minimal Markdown renderer
   or a minimal Milkdown configuration; disabled Crepe features may still be
   present in the dependency graph.
2. Lazy-load the preview/editor dependency if the initial raw editor can render
   first without it.
3. Add response compression through the deployment proxy or the `compression`
   package, and verify `Content-Encoding` in an HTTP integration test.
4. Serve hashed `/assets/*` files with a long immutable cache policy while
   keeping `index.html` short-lived or `no-cache`.
5. Add a total initial-transfer budget, not only a per-chunk threshold. A
   reasonable first target is below 300 KiB gzip for eagerly loaded JavaScript.
6. Add a bundle-analysis command so future regressions identify the importing
   modules rather than merely increasing the warning limit.

### SEC-03 — Missing security headers and HTTPS deployment contract

Severity: **Medium**

Evidence:

- `server/app.ts:14-16` disables `X-Powered-By` but sets no other browser
  security policy;
- `index.html` contains no Content Security Policy;
- the application listens over plain HTTP and the README does not require TLS
  termination for public deployment.

No direct XSS sink was found in application code. React renders diff and history
text safely, Milkdown displays raw HTML Markdown as text, and the installed
Milkdown commonmark link implementation allowlists link protocols. These are
good controls, but security headers provide defense in depth against future
rendering changes, framing, MIME confusion, and accidental external resource
loads.

Recommended change:

1. Add `helmet` or equivalent explicit headers.
2. Start with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`,
   `form-action 'self'`, `script-src 'self'`, and a deliberately tested
   `style-src`/`img-src` policy compatible with Milkdown.
3. Add `Referrer-Policy`, `X-Content-Type-Options`, and a restrictive
   `Permissions-Policy`.
4. Require HTTPS termination at the hosting platform or reverse proxy and
   enable HSTS only when every public route is HTTPS.
5. Add header assertions to HTTP integration tests.

Suggested dependency:

```sh
npm install helmet
```

### SEC-04 — Upstream response and suggestion sizes are not bounded

Severity: **Medium**

Evidence:

- `server/openRouterClient.ts:61-71` parses the entire upstream response and
  returns any non-empty string;
- `server/openRouterClient.ts:77-82` calls `response.json()` without a byte cap;
- `server/config.ts` accepts any positive maximum-completion-token value.

The default completion limit reduces normal response size, but configuration
mistakes or malformed upstream responses can still allocate large buffers. A
large suggestion also expands diff CPU, DOM node count, and history memory.

Recommended change:

1. Clamp completion tokens to a documented safe range during configuration
   loading.
2. Enforce a maximum upstream response byte count before or while consuming the
   stream; do not trust `Content-Length` alone.
3. Enforce a maximum returned suggestion length before sending it to the
   browser.
4. Return a safe error when a limit is exceeded and test boundary values.

### PERF-03 — Input token cost is not budgeted

Severity: **Medium**

Evidence:

- `server/suggestionHandler.ts:10-12` limits characters but not estimated model
  tokens or cost;
- `server/prompt.ts:14-26` includes both target Markdown and the complete
  document;
- for document scope, those fields contain the same document, so it is sent
  twice.

A 100,000-character document can create a large, slow, and relatively expensive
request. Output-token limits do not limit input cost. Large prompts can also
exceed the context window of a configured model.

Recommended change:

1. Retain full document context for selection and insertion continuity, as
   currently chosen, but calculate or conservatively estimate input tokens.
2. Reject oversized requests before billing with a clear user message.
3. Do not duplicate document text in document scope; include it once as the
   editable target.
4. Make document and instruction limits model-aware and clamp them server-side.
5. Capture OpenRouter usage totals for cost monitoring without storing content.

### PERF-04 — Large diffs block the main thread

Severity: **Medium**

Evidence:

- `src/diff/computeDiff.ts:5-9` performs a word-level diff synchronously;
- `src/components/SuggestionDiff.tsx` creates one React span per diff segment;
- validated documents and targets may contain up to 100,000 characters.

Highly divergent large strings can make diff computation expensive and can
produce thousands of DOM elements. Because this happens during rendering, the
modal may freeze before the user can reject or close the proposal.

Recommended change:

1. Establish a diff input and segment budget.
2. Use a line-level diff or summarized fallback above the word-level budget.
3. Move expensive diff work to a Web Worker if full large-document diffs remain
   a requirement.
4. Virtualize or progressively render very large diff output.
5. Benchmark worst-case unrelated 100 KB inputs, not only small prose edits.

### PERF-05 — In-memory history grows without a bound

Severity: **Medium**

Evidence:

- `src/history/documentHistory.ts:60-75` appends every accepted initial and
  refinement step;
- each entry retains prompt, input Markdown, and output Markdown;
- no entry-count or total-byte eviction policy exists.

Long sessions or repeated large-document refinements can retain many complete
string copies. This is page-local and disappears on reload, but it can still
degrade the active tab substantially.

Recommended change:

1. Define both an entry limit and approximate byte budget.
2. Evict the oldest complete accepted session when either limit is exceeded.
3. Consider storing compact patches plus periodic snapshots if long history is
   a future requirement.
4. Show a concise UI notice when old in-memory history is evicted.

### PERF-06 — Contextual-trigger measurement causes layout work

Severity: **Medium**

Evidence:

- `src/editor/measureTextareaOffset.ts:42-87` creates a hidden element, copies
  text, inserts it into the document, reads layout, and removes it;
- trigger repositioning invokes this work on scrolling and resizing while the
  lightbulb is visible.

This is an O(document length) text/DOM operation followed by forced layout. On
large documents, frequent scroll events can cause noticeable jank.

Recommended change:

1. Throttle scroll and resize measurement to one animation frame.
2. Reuse a single mirror element rather than recreating it.
3. Copy only the text needed to locate the active line when accurate wrapping
   can be retained, or hide the trigger during rapid scrolling and recalculate
   after scrolling settles.
4. Measure the handler with a 100 KB wrapped document before and after changes.

### QA-01 — Server security controls are outside coverage

Severity: **Medium**

Evidence:

- `vitest.config.ts:13-16` includes only `src/**/*` in coverage;
- current server tests exercise request parsing and two OpenRouter-client cases;
- there are no integration tests for the Express route, rate limiting, JSON
  limits, abort behavior, error mapping, headers, or static caching.

The displayed coverage percentage can therefore remain above threshold even if
critical server paths are untested.

Recommended change:

1. Include `server/**/*.ts` in coverage with explicit thresholds.
2. Use the already installed `supertest` dependency for route tests.
3. Inject a fake generation client and fake upstream `fetch`; never make real
   OpenRouter calls in automated tests.
4. Cover valid initial/refinement requests, every validation branch, 429/5xx
   mapping, malformed upstream JSON, timeouts, disconnects, concurrency limits,
   security headers, compression, and cache policy.
5. Keep an outbound-network guard in tests so accidental real requests fail.

### SEC-05 — Prompt delimiting can be strengthened

Severity: **Low**

Evidence:

- `server/prompt.ts:14-26` concatenates instruction, scope, target, and document
  under plain-text headings;
- document content can contain the same headings or imperative language.

The system prompt already says document content is untrusted. The model has no
tools, output is displayed as text/Markdown, and the user must explicitly
accept it, so the residual security impact is low. Still, delimiters alone do
not guarantee that a model will obey scope instructions.

Recommended change:

1. Serialize the data fields in an unambiguous structured format and label the
   document and target as quoted data.
2. Keep instructions in the system message that forbid treating quoted content
   as commands.
3. Treat every model response as untrusted and retain explicit review.
4. Do not add tools, automatic URL fetching, or automatic document mutation
   without a new threat review.

### PRIV-01 — Full document context is sent for scoped edits

Severity: **Informational / accepted trade-off**

The browser sends the complete document for insertion and selection requests,
and the server includes it in the OpenRouter prompt. This improves continuity
but shares more content than the exact edit target. The current product decision
is to retain this behavior.

Recommended safeguards:

- clearly disclose that AI requests send the current document to the configured
  provider before real users enter sensitive content;
- never log document, prompt, target, or model output;
- add a future privacy option for target-only or bounded-context requests if the
  product handles sensitive documents;
- define retention and data-processing expectations before deployment beyond a
  local showcase.

## Existing controls that should be preserved

- The API key is read only by `server/config.ts` and is not prefixed with
  `VITE_`.
- `.env`, `.env.*`, and local files are ignored while `.env.example` contains no
  secret.
- The upstream host is a constant, so user input cannot create an SSRF target.
- Incoming JSON has a 256 KB parser limit and field-level validation.
- Scope coordinates are checked for initial requests.
- `X-Powered-By` is disabled and public errors do not expose upstream bodies or
  credentials.
- AI requests are abortable when the modal closes or the browser disconnects.
- The editor becomes read-only during review, preventing a proposal from being
  silently applied to an edited source range.
- AI output is reviewed and explicitly accepted before mutation.
- React renders prompts, diffs, and history as text rather than using
  `dangerouslySetInnerHTML`.
- Milkdown's installed commonmark implementation neutralizes unsafe explicit
  link schemes, and raw HTML Markdown is rendered as text.
- Automated tests use injected fakes and do not consume API tokens.
- The lockfile is committed and the current npm advisory result is clean.

## Remediation plan

### Phase 1 — Correctness and spend protection

1. Fix the refinement request contract and add selection/insertion route tests.
2. Define the deployment threat model: loopback-only or public.
3. Add upstream deadline, bounded concurrency, and clear 503/504 handling.
4. Add model-aware input/output limits and avoid document-scope duplication.
5. For public hosting, add authenticated/session quotas and a shared or edge
   rate limiter with correct proxy identity configuration.

### Phase 2 — Editor performance

1. Keep one preview instance and update it through transactions.
2. Debounce preview parsing without delaying source input.
3. Add diff size budgets and a large-input fallback.
4. Bound in-memory history by entry count and bytes.
5. Throttle and reuse contextual-trigger measurement infrastructure.

### Phase 3 — Delivery and browser hardening

1. Reduce the preview dependency graph or lazy-load it.
2. Enable Brotli/gzip at the proxy or with `compression`.
3. Add immutable caching for hashed assets and safe caching for HTML/API data.
4. Add Helmet with a tested CSP and related headers.
5. Document HTTPS as mandatory for public deployment.

Potential dependencies:

```sh
npm install helmet compression
npm install --save-dev rollup-plugin-visualizer
```

Compression and shared rate limiting may instead be provided by the selected
hosting platform. Do not add a Redis dependency until a multi-process/public
deployment actually requires it.

### Phase 4 — Verification and observability

1. Include server files in coverage and add isolated HTTP integration tests.
2. Add performance fixtures for typing, preview updates, diffing, and history.
3. Enforce an eager-transfer budget in CI.
4. Add privacy-safe metrics for request count, latency, status, saturation, and
   token usage.
5. Run `npm audit` in CI and add secret scanning such as Gitleaks for the full
   Git history.

## Completion checklist

- [ ] Refinement succeeds repeatedly for selection and insertion scopes.
- [ ] Public deployment cannot anonymously consume an unbounded shared budget.
- [ ] Every upstream request has a deadline and concurrency control.
- [ ] Preview typing does not recreate the editor instance.
- [ ] Worst-case diff and history memory have explicit limits.
- [ ] Production assets are compressed and hashed assets are cached immutably.
- [ ] Eager JavaScript is measured as a total and meets an agreed budget.
- [ ] Security headers and HTTPS behavior are covered by tests.
- [ ] Server code contributes to coverage thresholds.
- [ ] Automated tests make no real external requests.
- [ ] Dependency and secret scans run in CI.
