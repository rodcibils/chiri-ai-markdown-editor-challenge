# Refinement Request Validation Fix Plan

## Summary

Fix real-provider refinement by sending an internally consistent working
document snapshot containing the latest AI proposal. The server will validate
the proposal against that temporary snapshot, while acceptance and history
continue using the original immutable editor scope.

No server-side session state or real OpenRouter calls will be introduced.

## Contract and implementation changes

- Add a required `operation: "initial" | "refinement"` field to the client
  provider request, serialized API request, and server request types.
- Introduce a pure request-building helper that produces the model-facing
  document, target, and scope:
  - initial selection: original document, selected target, original selection;
  - initial insertion: original document, empty target, original insertion;
  - initial document: complete document as both document and target;
  - refined selection: replace the original selection with the latest proposal
    in a temporary document and target its updated range;
  - refined insertion: insert the latest proposal into a temporary document and
    represent it as a selection covering that proposal;
  - refined document: use the latest proposal as the temporary document and
    document target.
- Update the application to send the working request to the provider while
  retaining the original scope in the suggestion and history entries.
- Ensure every refinement uses the immediately previous proposal so refinement
  can be repeated indefinitely.
- Require and validate the operation on the server. Refinement requests must use
  selection or document scope, and their target must match the working snapshot.
- Add the operation to the OpenRouter prompt and identify refinement targets as
  the latest proposal being revised.
- Keep full-document context for continuity, including the latest proposal at
  its working location.

## Test plan

- Test request construction for initial and repeated refinement across
  insertion, selection, and document scopes.
- Verify HTTP serialization includes the operation and excludes `AbortSignal`.
- Verify server validation accepts consistent refinements and rejects unknown
  operations, refinement insertion scope, and target/range mismatches.
- Verify repeated refinement always targets the immediately previous proposal,
  while acceptance still modifies only the original captured editor range.
- Verify successful steps retain correct history input/output and rejection
  discards the complete pending chain.
- Verify the OpenRouter prompt distinguishes initial generation from refinement.
- Use injected providers and fake fetch responses only; do not make external
  requests.
- Run `npm run lint`, `npm test`, and `npm run build`.

## Assumptions and acceptance criteria

- The server remains stateless and validates internal request consistency rather
  than attempting to prove proposal ancestry.
- The original document remains unchanged until acceptance.
- The latest proposal is integrated only into a temporary request snapshot.
- Refinement offsets sent to the server refer to the temporary snapshot;
  application offsets remain the original captured offsets.
- Existing prompt, review, accept, reject, history, cancellation, and error
  behavior remains unchanged.
- Repeated selection and insertion refinement succeeds through the real HTTP
  provider without HTTP 400 validation failures.
