# Chiri AI Document Editor

A single-page Markdown editor where users ask a local mock AI collaborator to propose changes to the whole document or a selected passage. Every proposal is shown as an inline diff and must be explicitly accepted or rejected.

## Stage 1 features

- Milkdown Crepe Markdown editing
- Whole-document and selection-based suggestions
- Inline added/removed diff review
- Accept, reject, and multi-turn refinement
- Read-only review mode to prevent stale proposals
- Deterministic offline mock provider
- Mock error, empty-response, and unchanged-response scenarios

## Run locally

```bash
npm install
npm run dev
```

Use a current Node.js LTS release. Stage 1 does not require an API key and makes no AI network requests.

## Test mock states

Include one of these tokens in the instruction to exercise a state:

- `[mock:error]` - provider failure
- `[mock:empty]` - empty provider response
- `[mock:unchanged]` - valid no-change response

Any other instruction returns deterministic Markdown with a visible mock revision. Refinement adds another deterministic revision to the previous proposal.

## Architecture

```text
Milkdown/Crepe
  -> Markdown and selection state
  -> SuggestionProvider interface
  -> MockSuggestionProvider (Stage 1)
  -> diffWordsWithSpace
  -> user review
  -> explicit accept/reject
```

The provider boundary is transport-neutral. Stage 2 can add an OpenRouter implementation without changing the editor, diff, or review workflow.

## Deliberate trade-offs

This showcase keeps state in memory and supports one document and one active proposal. It has no authentication, database, persistence, collaboration protocol, version history, or backend. The mock prioritizes predictable UX testing over semantic AI quality.

## With more time

Add the OpenRouter adapter behind the existing provider interface, then consider server-side key protection, persistence, version history, richer structural diffs, and tracked changes.
