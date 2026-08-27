# Stage 1 Plan — Mocked AI Document Editor

## Summary

Implement every mandatory UI and editing behavior from `docs/Instructions.pdf`, but use a deterministic asynchronous mock instead of OpenRouter. Stage 1 must make no network requests, require no API key, and consume no tokens.

Mandatory behavior:

- Edit Markdown in Milkdown Crepe.
- Request AI changes for the current selection or the entire document.
- Review a visible diff before any change is applied.
- Accept, reject, or repeatedly refine a proposal.
- Keep the interaction editor-centric rather than presenting a chatbot.
- Provide the required README and committed AI-development transcript.

Do not add optional version history, slash commands, persistence, authentication, database, routing, or backend functionality in this stage.

## Implementation Changes

### Editor and application workflow

- Replace the Vite starter with a responsive workspace using the installed Milkdown Crepe packages.
- Synchronize Markdown and selection changes through Milkdown listeners.
- A collapsed selection targets the complete document; a non-empty selection targets only the serialized selection.
- Snapshot the ProseMirror `{ from, to }` range when submitting.
- Lock the editor while generating or reviewing a suggestion so the proposal cannot become stale.
- Apply changes only after explicit acceptance:
  - Full-document proposals use Milkdown’s `replaceAll`.
  - Selection proposals use `replaceRange` with the captured range.
- Reject clears the proposal without dispatching an editor change.
- Refinement sends the current proposal through the provider again while preserving the original text for the displayed diff.
- Abort pending requests during unmount or replacement, and ignore stale responses.

### Provider boundary and mock implementation

Define a transport-neutral contract:

```ts
interface SuggestionRequest {
  markdown: string
  instruction: string
  signal?: AbortSignal
}

interface SuggestionProvider {
  generateSuggestion(request: SuggestionRequest): Promise<string>
}
```

- The application imports a configured `suggestionProvider`, never the mock directly.
- Implement `MockSuggestionProvider` with the same asynchronous Promise, cancellation, validation, and error behavior expected from a future OpenRouter provider.
- Use a fixed delay of approximately 600 ms so loading and disabled states can be tested.
- Normal instructions return Markdown-only output with a deterministic revision marker; repeated refinements modify the previous proposal.
- Support documented test commands:
  - `[mock:error]` rejects with a safe provider error.
  - `[mock:empty]` returns an empty response so application validation can reject it.
  - `[mock:unchanged]` returns the input unchanged.
- Keep output cleanup and empty-response validation in the shared application pipeline so a future OpenRouter response follows the same path.
- Do not add an OpenRouter endpoint, API-key environment variable, or browser network transport in Stage 1.
- Stage 2 should require only a new `SuggestionProvider` implementation and a provider-composition change.

### Suggestion state and diff

Define:

```ts
type SuggestionScope =
  | { kind: 'document' }
  | { kind: 'selection'; from: number; to: number }

type RequestStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AiSuggestion {
  originalMarkdown: string
  proposedMarkdown: string
  scope: SuggestionScope
  instructions: string[]
}
```

- Use the installed `diff` package with `diffWordsWithSpace`.
- Render unchanged, added, and removed segments inline with semantic markup, text decoration, labels, and color.
- Treat unchanged output as a successful “No changes suggested” state.
- On an initial request failure, retain the instruction and unlock the editor for retry.
- On refinement failure, retain the previous valid proposal and keep the editor locked; the user may retry, accept, or reject it.

### Interface and layout

- Keep the Milkdown editor as the primary surface.
- Show whether AI will edit “Selected text” or “Entire document.”
- Provide an instruction input, “Suggest changes,” loading state, visible proposal diff, Accept, Reject, refinement input, and Refine action.
- Disable empty submissions and duplicate submissions during loading.
- Ensure responsive layout, keyboard focus indicators, accessible labels, status announcements, and readable light/dark styling.

### Documentation and submission artifacts

- Replace the template README with the editor overview, local setup, commands, Stage 1 mock architecture, mock test commands, no-network guarantee, provider replacement instructions, deliberate exclusions, and future improvements.
- Add the actual Codex development transcript under `ai-sessions/` before submission.
- Do not commit an API key, build output, or `.env.local`.

## Public Interfaces

- `SuggestionProvider.generateSuggestion()` is the stable AI boundary.
- `MockSuggestionProvider` is the only Stage 1 provider implementation.
- `SuggestionScope`, `AiSuggestion`, and `DiffSegment` are shared application types.
- The editor exposes `replaceDocument`, `replaceSelection`, and `setReadOnly`.
- No server API, environment configuration, or persistence schema is introduced.

## Test Plan

- Add Vitest as a development dependency and test normal mock output, refinement, delay/loading behavior, abort handling, reserved error/empty/unchanged commands, empty-output validation, and diff normalization.
- Manually verify Markdown editing, document and selection scope detection, inline/formatted/multi-block selections, no pre-acceptance mutation, full-document accept, selection-only accept, exact reject behavior, multi-turn refinement, locking, retry/error states, keyboard navigation, and narrow-screen usability.
- Confirm browser developer tools show no AI-related network request.
- Run `npm test`, `npm run lint`, and `npm run build`, then exercise the complete workflow through the production preview.

## Assumptions

- Stage 1 validates collaboration UX and state correctness, not AI response quality.
- Mock responses are deterministic and Markdown-only.
- The application supports one in-memory document and one active suggestion.
- Browser-side OpenRouter integration and its security trade-offs are deferred entirely to Stage 2.
- The future real provider will preserve the Stage 1 interface, so editor, diff, accept/reject, refinement, and error UI require no structural changes.
