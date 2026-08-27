# Codex development session

This file records the AI-assisted planning and implementation decisions for Stage 1 of the Chiri challenge.

## User request

Implement the mandatory AI document-editor workflow, but do not call OpenRouter in the first implementation stage. Mock the provider closely enough that the real API can replace it later with minimal UI and state changes.

## Decisions made

- Use the installed React, TypeScript, Vite, Milkdown Crepe, and `diff` dependencies.
- Introduce a transport-neutral `SuggestionProvider` interface.
- Make `MockSuggestionProvider` asynchronous and abort-aware.
- Use documented instruction tokens for error, empty, and unchanged scenarios.
- Keep the editor read-only while a suggestion is being generated or reviewed.
- Apply proposals only through explicit Accept; Reject never changes the document.
- Preserve the original text for refinement diffs while sending the previous proposal into the next request.
- Defer the OpenRouter transport and API-key configuration to Stage 2.

## Result

The implementation includes the Crepe editor bridge, document/selection targeting, deterministic mock suggestions, inline diff rendering, accept/reject/refine state transitions, responsive styling, README documentation, and this session record.
