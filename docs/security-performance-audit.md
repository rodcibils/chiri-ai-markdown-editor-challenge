# Security and Performance Audit

Date: 2026-08-28

## Executive summary

The latest implementation has a sound baseline security boundary. The
OpenRouter key remains server-only, requests use a fixed upstream URL, incoming
suggestion payloads are validated before billing, provider errors are normalized,
and AI output requires explicit user acceptance. The dependency audit found no
known vulnerabilities.

Two High findings from the previous audit are now resolved:

- refinements operate on the immediately preceding AI proposal while preserving
  the original application range; and
- the Markdown preview keeps one Crepe instance and applies debounced document
  updates instead of recreating the editor after every keystroke.

No Critical issue was found. Three open findings are High priority:

1. a publicly reachable suggestion endpoint can spend the shared OpenRouter
   budget without authenticating a user;
2. OpenRouter calls have no server-enforced deadline or process-wide concurrency
   bound; and
3. the page still eagerly loads about 1.66 MiB of production assets, while the
   built-in Express server does not compress or long-cache hashed assets.

The remaining Medium findings concern browser/server hardening, bounded provider
responses and input budgets, large-document diff/history/caret costs, and gaps in
server-side test assurance. These should be addressed before treating the app as
a production-ready public service.

## Scope and method

This review covered:

- application and server TypeScript;
- Vite, TypeScript, Vitest, and Playwright configuration;
- secret handling and environment-file rules;
- request validation, rate limiting, provider calls, and error mapping;
- Markdown preview lifecycle, diff computation, contextual-trigger measurement,
  and in-memory history;
- static production delivery behavior;
- installed dependencies and current npm advisories; and
- build, lint, unit/component coverage, and browser behavior.

Checks run during this audit:

```sh
npm audit --json
npm ls --depth=0
npm run lint
npm run build
npm run test:coverage
npm run test:e2e
```

Targeted source and Git searches were also used to look for exposed OpenRouter
key patterns, tracked environment files, and dangerous browser HTML-evaluation
sinks.

Observed results:

- `npm audit`: 0 known vulnerabilities across 671 dependencies;
- dependency resolution: passed;
- lint: passed;
- production build: passed without a chunk-size warning;
- unit/component tests: 56 passed across 20 files;
- client coverage: 84.61% statements, 74.14% branches, 84.80% functions,
  and 86.70% lines;
- browser tests: 16 passed across Chromium, Firefox, WebKit, and mobile Chromium;
- eager production assets referenced by `dist/index.html`: 23 files,
  1,700,602 raw bytes (about 1.66 MiB) and 532,085 gzip bytes (about 520 KiB);
- only the empty `.env.example` template is tracked; and
- no OpenRouter key prefix was found in current source or the scanned Git
  history.

The browser suite starts the Vite client and intercepts local API behavior; it
does not start the production Express/OpenRouter path or make a real provider
request.

This is a source and local-build audit, not a penetration test or load test of a
deployed environment. Reverse-proxy, TLS, identity-provider, OpenRouter-account,
network, and hosting-platform settings were not available for review. The secret
search was a targeted heuristic and is not a substitute for a dedicated secret
scanner across every historical object and external fork.

## Severity definitions

| Severity | Meaning |
| --- | --- |
| Critical | Immediate compromise, secret disclosure, or destructive impact is likely. |
| High | Material cost, availability, or user-impact risk; address before public deployment. |
| Medium | Meaningful hardening or scalability issue; schedule after High work. |
| Low | Defense-in-depth or limited-scope risk. |
| Informational | Positive control or accepted trade-off requiring no immediate fix. |

## Open findings summary

| ID | Severity | Area | Finding |
| --- | --- | --- | --- |
| SEC-01 | High when public | Cost/security | The billable AI route is unauthenticated and protected only by a per-process IP limiter. |
| SEC-02 | High | Availability | Provider calls have no server deadline or concurrency bound. |
| PERF-02 | High | Delivery | Chunk splitting removes the warning, but the large Milkdown graph is still eager and direct Express delivery is uncompressed. |
| SEC-03 | Medium | Browser/server | Production security headers and an explicit HTTPS/proxy contract are absent. |
| SEC-04 | Medium | Resource control | Provider response size and configured completion size are not independently bounded. |
| PERF-03 | Medium | AI cost/latency | Input tokens are not budgeted and target Markdown is duplicated inside document context. |
| PERF-04 | Medium | Diff UI | Large word-level diffs run synchronously and render an unbounded number of spans. |
| PERF-05 | Medium | Memory | Accepted AI history retains unbounded input/output snapshots. |
| PERF-06 | Medium | Editor | Trigger positioning creates and lays out a full textarea mirror repeatedly. |
| QA-01 | Medium | Assurance | Server coverage is omitted from reported coverage and HTTP controls lack integration tests. |
| SEC-05 | Low | AI safety | Prompt boundaries can be made more resistant to document-level instruction injection. |
| PRIV-01 | Informational | Privacy | Full document context is intentionally sent for scoped changes. |

## Detailed open findings

### SEC-01 — Public callers can spend the shared AI budget

Severity: **High for a public deployment; Low for loopback-only development**

Evidence:

- `server/index.ts:8-12` binds to `0.0.0.0`, although its startup message displays
  a loopback URL;
- `server/app.ts:18-33` exposes `POST /api/suggestions` without an authenticated
  user or signed session; and
- the only abuse control is the default in-memory IP limiter at 20 requests per
  minute.

Same-origin browser behavior and the lack of CORS prevent common cross-origin
browser calls, but do not stop scripts or direct HTTP clients. The limiter resets
on restart, is not shared across replicas, and can be distributed across source
addresses. Behind a proxy, an incorrect `trust proxy` setting can either group
all users together or allow address spoofing.

Actions:

1. Decide and document whether production is local-only or public.
2. For local-only use, bind to `127.0.0.1` by default and require an explicit
   configuration value to listen on external interfaces.
3. For public use, authenticate users or issue a server-validated signed session
   before allowing generation.
4. Enforce per-user quotas and retain an IP limit as a secondary control. Use a
   shared limiter store or an equivalent gateway/WAF rule for multiple replicas.
5. Configure an exact `trust proxy` hop count for the chosen host; do not enable
   proxy trust globally without matching the deployment topology.
6. Set provider/account spending limits and record request count, latency,
   status, model, and token usage without logging prompts, documents, responses,
   or credentials.
7. If cookie authentication is introduced, add appropriate CSRF protection and
   secure cookie attributes as part of that change.

Acceptance criteria:

- an unauthenticated public caller cannot trigger a billable provider request;
- quotas remain effective across restarts and replicas;
- the server's bind address and logged address agree; and
- tests prove rejected callers never invoke the injected provider client.

### SEC-02 — Provider calls have no deadline or concurrency limit

Severity: **High**

Evidence:

- `server/openRouterClient.ts:41-59` forwards only a caller-provided abort signal;
- `server/suggestionHandler.ts:26-49` aborts after browser disconnection but adds
  no independent deadline; and
- no process-wide gate limits simultaneous OpenRouter generations.

A slow or stalled upstream can hold connections and memory indefinitely. The
per-minute limiter does not prevent all allowed requests from executing at once,
so a small burst can exhaust sockets or upstream capacity.

Actions:

1. Add a configurable server deadline with a conservative bounded default, such
   as 45–60 seconds, and enforce a safe minimum and maximum.
2. Combine disconnect and deadline signals with `AbortSignal.any`, or an
   equivalent helper whose timeout is always cleaned up.
3. Distinguish client cancellation from deadline expiry and return a safe HTTP
   504 response for the latter.
4. Add a small process-wide concurrency semaphore. Reject saturated work with
   503/429 and `Retry-After`, or permit only a short bounded queue.
5. Do not automatically retry a timed-out billable call: it may already have
   consumed provider tokens.
6. Expose timeout, cancellation, saturation, and in-flight counts as sanitized
   metrics.

Acceptance criteria:

- a provider that never settles is aborted within the configured deadline;
- disconnect and timeout listeners/timers are removed on every exit path;
- concurrent provider calls never exceed the configured maximum; and
- timeout, cancellation, and saturation behavior is verified with injected
  offline fakes.

### PERF-02 — Large eager payload and unoptimized static delivery

Severity: **High when Express serves production directly; Medium behind a
compressed, correctly cached CDN**

Evidence:

- the production HTML eagerly module-preloads the Milkdown dependency chunks;
- the eager set measures 1,700,602 raw bytes and about 532,085 gzip bytes across
  23 files;
- `vite.config.ts:14-25` divides Milkdown into smaller chunks, which satisfies
  the warning threshold but does not defer those chunks; and
- `server/app.ts:35-37` uses default `express.static` without response
  compression or explicit immutable caching for hashed assets.

The Vite gzip column is a size estimate, not the payload sent by the current
Express process. Without a compressing proxy, clients receive roughly 1.66 MiB
before accounting for protocol overhead, then must parse and execute the editor
graph before the app is usable.

Actions:

1. Decide whether Node or an external proxy/CDN owns static delivery and document
   that production architecture.
2. Enable Brotli/gzip at that layer. If Node owns delivery, add and configure
   compression middleware or serve precompressed build artifacts.
3. Send long-lived `Cache-Control: public, max-age=31536000, immutable` headers
   for content-hashed assets and `no-cache` for `index.html`.
4. Split the lightweight raw editor shell from the Milkdown preview and load the
   preview dependency dynamically. Preserve an accessible loading/failure state.
5. Rebuild and inspect `dist/index.html`; verify Milkdown is no longer an initial
   preload when it is safe to defer.
6. Add performance budgets for initial raw transfer, compressed transfer, and
   main-thread startup, then measure on a throttled browser profile.

Acceptance criteria:

- production responses are actually compressed on the wire;
- repeated visits reuse immutable hashed assets while HTML revalidates;
- the raw editor becomes interactive before deferred preview code completes;
- preview behavior remains unchanged after loading; and
- a documented build/performance budget fails CI on material regression.

### SEC-03 — Missing production headers and HTTPS/proxy contract

Severity: **Medium**

Evidence:

- `server/app.ts` disables `X-Powered-By`, but sets no Content Security Policy,
  clickjacking control, `X-Content-Type-Options`, Referrer Policy, Permissions
  Policy, or HSTS; and
- `server/index.ts` starts plain HTTP and contains no documented trusted-proxy or
  TLS-termination enforcement.

These controls may be supplied by a deployment platform, but that responsibility
is not expressed or tested in this repository.

Actions:

1. Define whether headers and HTTPS redirects are owned by Express or the edge.
2. If Express owns headers, add a maintained header middleware such as `helmet`;
   otherwise codify equivalent platform configuration.
3. Inventory Milkdown styles, workers, links, and image behavior before creating
   a CSP. Start with report-only mode and then enforce the narrowest compatible
   directives.
4. Add `frame-ancestors 'none'` or the equivalent frame header, MIME sniffing
   protection, a restrictive Referrer Policy, and a minimal Permissions Policy.
5. Enable HSTS only after HTTPS is correctly terminated for the production host.
6. Test representative static and API responses for the expected headers.

Acceptance criteria:

- every production response has the documented header baseline;
- HTTP cannot be used accidentally in public production;
- CSP produces no unexplained violations during editor, preview, modal, and AI
  workflows; and
- proxy configuration is explicit and environment-specific.

### SEC-04 — Provider response and completion sizes are not fully bounded

Severity: **Medium**

Evidence:

- `server/openRouterClient.ts:61-80` buffers and parses the complete upstream JSON
  body before validating its shape;
- returned `message.content` has no server-side character or byte cap; and
- `server/config.ts:43-55` accepts any positive
  `OPENROUTER_MAX_COMPLETION_TOKENS` value without an upper bound.

The fixed HTTPS endpoint reduces the likelihood of a malicious response, and the
normal default of 2,000 completion tokens limits typical output. A provider,
proxy, or configuration failure can nevertheless consume excessive memory or
return a suggestion much larger than the UI is designed to diff and retain.

Actions:

1. Define maximum upstream response bytes and maximum suggestion characters.
2. Reject oversized `Content-Length` immediately and enforce the same limit while
   streaming when the header is missing or incorrect.
3. Abort the provider request once the response limit is crossed; do not call
   unrestricted `response.json()` first.
4. Clamp completion-token configuration to a documented safe range.
5. Validate the extracted suggestion before returning it to the browser.
6. Map oversized upstream output to a generic 502 response without returning
   provider content.

Acceptance criteria:

- an oversized declared or streamed response cannot exceed the configured
  memory budget;
- an oversized suggestion never reaches diff/history state; and
- boundary behavior is tested with local response streams only.

### PERF-03 — Input cost and context size are not budgeted

Severity: **Medium**

Evidence:

- `server/suggestionHandler.ts:11-13` permits a 100,000-character document and a
  separate 100,000-character target;
- `server/prompt.ts:14-31` includes both target Markdown and the complete document
  context; and
- whole-document scope sends the same Markdown in both sections.

Character limits do not map reliably to model tokens. A valid request can exceed
the selected model's context window, create avoidable latency/cost, or fail only
after reaching OpenRouter. The continuity benefit of full document context is an
intentional product choice, but it still needs a predictable budget.

Actions:

1. Define a model-specific maximum input budget and reserve space for system
   instructions plus the configured completion allowance.
2. Estimate or tokenize the final serialized prompt before calling the provider;
   reject over-budget input locally with a useful, non-sensitive response.
3. For document scope, include the document once rather than as both target and
   context.
4. For selection/refinement, preserve full context when it fits, but avoid
   repeating the target by marking its validated range inside one context block.
5. Clamp document, instruction, and completion settings together rather than as
   independent limits.
6. Record aggregate input/output token usage for cost monitoring without storing
   user text.

Acceptance criteria:

- no accepted request can exceed the configured model/context budget;
- whole-document content is serialized only once;
- scoped edits retain the required continuity context; and
- over-budget requests are rejected before a billable network call.

### PERF-04 — Large diffs block the UI and create unbounded DOM

Severity: **Medium**

Evidence:

- `src/diff/computeDiff.ts:5-9` runs `diffWordsWithSpace` synchronously;
- `src/components/SuggestionDiff.tsx:22-25` performs it during render through
  `useMemo`; and
- `src/components/SuggestionDiff.tsx:67-87` filters and renders every segment on
  both sides.

Adversarial or simply very different large strings can make word-level diffing
CPU-intensive and produce thousands of React spans, freezing the modal and
increasing memory use.

Actions:

1. Establish input-byte, segment-count, and render-time budgets for detailed
   word diffs.
2. Move expensive diff work to a Web Worker so modal controls remain responsive.
3. For inputs above the detailed-diff budget, use a bounded line-level or
   summarized comparison and clearly tell the user that the view was simplified.
4. Cap rendered segments or virtualize/chunk the comparison without breaking the
   shared scrolling behavior.
5. Benchmark identical, lightly edited, and completely different 10 KB and
   100 KB inputs.

Acceptance criteria:

- opening or switching a large comparison does not block the main thread beyond
  the agreed responsiveness budget;
- Accept, Reject, Refine, Back, and Close remain responsive;
- memory/DOM node counts stay bounded; and
- normal-size diffs preserve existing word-level colors and shared scrolling.

### PERF-05 — In-memory history grows without a bound

Severity: **Medium**

Evidence:

- `src/App.tsx:216-240` stores prompt, input, and output snapshots for every
  successful generation step;
- `src/history/documentHistory.ts:63-73` appends all accepted pending entries to
  committed history; and
- no entry count or aggregate byte limit evicts older data.

Each accepted refinement retains another pair of strings. A long editing session
can therefore keep many duplicated document fragments alive until the page is
reloaded.

Actions:

1. Define both a maximum entry count and approximate aggregate byte budget.
2. Enforce the limit in the reducer or a pure history-domain helper so it is
   independently testable.
3. Evict oldest committed sessions first. Keep all steps of the newest accepted
   session together so history never presents a partial refinement chain.
4. Consider storing compact deltas only if count/byte caps are insufficient;
   prioritize simple predictable limits first.
5. Expose a concise UI notice when old in-memory history has been discarded.

Acceptance criteria:

- committed plus pending history never exceeds documented budgets;
- acceptance/discard semantics remain atomic for refinement sessions;
- newest-first ordering remains correct after eviction; and
- reducer tests cover count limits, byte limits, and multi-step sessions.

### PERF-06 — Caret measurement repeatedly mirrors the full document

Severity: **Medium for large documents; Low for ordinary documents**

Evidence:

- `src/editor/measureTextareaOffset.ts:42-87` copies the textarea text into a new
  hidden DOM tree, appends it to `document.body`, forces layout, and removes it;
- `src/components/DocumentEditor.tsx:159-178` repeats that measurement while a
  contextual trigger is repositioned; and
- the textarea calls repositioning from its scroll handler.

This is accurate but allocates strings and DOM and forces synchronous layout.
Repeated scrolling or resizing with a visible trigger can cause jank as document
size grows.

Actions:

1. Coalesce scroll/resize repositioning to one measurement per animation frame.
2. Reuse one hidden mirror element instead of creating/removing it for every
   measurement.
3. Copy styles only after relevant size/font changes, not on every position read.
4. Avoid copying text after the measured offset unless it is necessary for the
   marker's first fragment.
5. Hide the trigger without remeasurement during rapid scroll if an accurate
   anchor cannot be produced within budget, then restore it after scroll settles.
6. Profile 10 KB and 100 KB documents while typing, selecting, and scrolling.

Acceptance criteria:

- scroll events cause at most one forced measurement per animation frame;
- the mirror is reused and removed on editor unmount;
- contextual positioning remains correct for wrapping, tabs, and both selection
  directions; and
- measured frame time stays within the agreed large-document budget.

### QA-01 — Server assurance is incomplete

Severity: **Medium**

Evidence:

- `vitest.config.ts:15-16` includes only `src/**/*.{ts,tsx}` in coverage;
- current server tests exercise request parsing, prompt construction, and two
  OpenRouter client outcomes, but not `createApp` or full HTTP behavior;
- the installed `supertest` dependency is not used; and
- `playwright.config.ts:21-24` starts only Vite, not the production Express
  server.

The reported coverage percentages therefore look healthier than total
client-plus-server coverage. Body limits, rate limiting, disconnect behavior,
safe error mapping, static headers, and future timeout/concurrency controls can
regress without an integration failure.

Actions:

1. Include `server/**/*.ts` in coverage, excluding only the minimal process
   bootstrap where justified.
2. Use the existing injected client and `supertest` to cover health, validation,
   body size, rate limiting, successful generation, safe upstream errors, 404,
   and malformed JSON without real network calls.
3. Expand `createOpenRouterClient` tests for provider HTTP failures, invalid JSON,
   aborts, response limits, and timeouts using injected fetch responses.
4. Add deterministic tests for the concurrency gate and cleanup paths introduced
   by SEC-02.
5. Set separate client and server thresholds so one side cannot mask the other.
6. Add at least one production-server smoke test using a fake generation client;
   do not require an API key or contact OpenRouter.

Acceptance criteria:

- all server routes and error classes have offline integration coverage;
- provider invocation counts prove invalid/limited requests are non-billable;
- coverage output explicitly reports server files; and
- CI remains deterministic without network or secret access.

### SEC-05 — Prompt boundaries can be strengthened

Severity: **Low**

Evidence:

- `server/prompt.ts:3-9` correctly tells the model to treat document content as
  untrusted data; but
- instruction, scope, target, and document are concatenated as plain labeled
  sections in one user message.

Document text can imitate those labels or include instructions aimed at the
model. This cannot be eliminated completely, but clearer structural boundaries
reduce accidental instruction confusion. Explicit review before application
keeps the residual risk Low.

Actions:

1. Serialize each field with explicit, length-aware boundaries or another
   unambiguous structured format.
2. State that only the dedicated instruction field is actionable and all target
   and context blocks are inert source data.
3. Preserve the existing requirement to return only replacement Markdown for the
   validated target.
4. Add adversarial prompt-construction tests containing fake section labels,
   role-like text, and instructions inside Markdown.
5. Continue requiring explicit user acceptance; never interpret model output as
   executable commands.

Acceptance criteria:

- embedded labels cannot alter the structural meaning of later fields;
- prompt tests preserve operation, scope, target, and context exactly; and
- AI output remains data that is reviewed before document application.

### PRIV-01 — Full document context leaves the browser

Severity: **Informational, accepted product trade-off**

Evidence:

- `server/prompt.ts:27-30` sends full `documentMarkdown` as context even for a
  selection or insertion request; and
- refinement builds a working full-document snapshot around the latest proposal.

This was intentionally retained to improve continuity. It means text outside the
visible edit target is disclosed to the configured provider and is subject to
that provider's processing and retention terms.

Actions before public use:

1. Tell users clearly that invoking AI sends the full current document context,
   not only the selected text.
2. Document the selected provider/model, applicable retention controls, and
   prohibited sensitive-data categories.
3. Confirm deployment logs and metrics never persist document, prompt, or
   response bodies.
4. Consider a future selection-only privacy mode if continuity requirements can
   be relaxed explicitly by the user.

## Resolved findings from the previous audit

### REL-01 — Refinement scope validation

Status: **Resolved**

- `src/ai/buildSuggestionRequest.ts:41-58` requires the latest proposal for a
  refinement request.
- `src/ai/buildSuggestionRequest.ts:72-98` integrates that proposal into a
  temporary working-document snapshot and creates a matching document/selection
  scope.
- `server/suggestionHandler.ts:142-167` validates refinement targets against that
  working snapshot.
- unit tests cover repeated selection/insertion refinement request construction
  and server validation of refinement operations.

The immutable application scope remains in application state, so final acceptance
still replaces only the originally captured editor range.

### PERF-01 — Preview editor recreated after every keystroke

Status: **Resolved**

- `src/components/DocumentEditor.tsx:473-497` keeps the Crepe instance in a ref
  and updates its Markdown through `replaceAll`;
- `src/components/DocumentEditor.tsx:499-563` creates one preview editor for the
  component lifecycle and destroys it once; and
- `src/components/DocumentEditor.tsx:565-583` coalesces updates behind a 150 ms
  delay.

Unit/component and cross-browser tests pass with the persistent preview. A
large-document browser benchmark is still recommended as part of PERF-06 and the
general performance budget, but editor recreation is no longer an open defect.

## Existing positive controls

- Secrets are loaded only by server code. `.env` and `.env.*` are ignored while
  the empty `.env.example` template remains tracked.
- The client calls a same-origin route and never receives the OpenRouter key.
- The provider URL is fixed, so request data cannot select an arbitrary upstream
  host.
- JSON request bodies are capped at 256 KiB, field types and offsets are checked,
  and targets must match their validated working document.
- Provider failures are converted to generic public errors; raw upstream bodies
  and credentials are not returned.
- Browser disconnects abort in-flight provider work.
- The editor is read-only while an AI session is open, reducing stale-range
  application risk.
- Generated text is displayed as a diff and applied only after explicit user
  acceptance.
- Markdown export is client-only, preserves the exact accepted source text, and
  introduces no provider request, persistence, or new dependency.
- No application use of `dangerouslySetInnerHTML`, `eval`, `new Function`, or
  `document.write` was found.
- Lint, build, unit/component tests, and the four-project browser suite pass.
- The current dependency audit reports zero known advisories.

## Recommended remediation order

### Phase 1 — Define and protect the production boundary

1. Decide local-only versus public deployment.
2. Implement SEC-01 authentication/quota/bind-address controls.
3. Implement SEC-02 deadline and concurrency controls.
4. Implement SEC-04 response and configuration bounds.
5. Add the corresponding offline server integration tests from QA-01.

### Phase 2 — Harden and optimize delivery

1. Establish the HTTPS, proxy, and header contract from SEC-03.
2. Add real compression and caching from PERF-02.
3. Defer the preview dependency and establish initial-load budgets.
4. Verify headers, compressed transfer, cache behavior, and startup timing in a
   production-like environment.

### Phase 3 — Bound large-document work

1. Add the input/context budget from PERF-03.
2. Bound or offload diff work from PERF-04.
3. Cap history retention from PERF-05.
4. Coalesce and reuse caret measurement work from PERF-06.
5. Add repeatable 10 KB and 100 KB browser benchmarks.

### Phase 4 — Improve assurance and AI defense-in-depth

1. Complete server coverage and production smoke testing from QA-01.
2. Strengthen prompt serialization and adversarial tests from SEC-05.
3. Publish the user-facing data-flow disclosure from PRIV-01.
4. Re-run this audit, dependency review, and performance budgets before public
   release.

## Definition of done for the remediation program

- No Critical or High finding remains open for the selected deployment model.
- Public billable requests require a validated identity/session and enforce
  distributed quotas.
- Every provider call has bounded time, concurrency, input, output, and memory.
- Production transport, headers, compression, and caching are documented and
  verified on the wire.
- Initial-load and large-document interaction budgets are measured and enforced.
- History and diff DOM/memory growth are bounded.
- Client and server coverage are reported separately, and all network behavior is
  tested with local fakes rather than real provider calls.
- Privacy documentation accurately states that AI requests include full document
  context.
