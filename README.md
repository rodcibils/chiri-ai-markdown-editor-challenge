# Chiri AI Document Editor

A single-page Markdown editor where users ask an AI collaborator to propose
changes at the cursor or for selected text. Every proposal is shown as a diff
and must be explicitly accepted or rejected.

## Features

- Milkdown Crepe Markdown editing
- Whole-document and selection-based suggestions
- Inline added/removed diff review
- Accept, reject, and multi-turn refinement
- In-memory history of accepted AI changes
- Read-only review mode to prevent stale proposals
- Server-protected OpenRouter suggestions
- Deterministic mock provider for automated tests

## Run locally

```bash
npm install
npm run dev
```

Use a current Node.js LTS release.

## OpenRouter API key setup

Each developer configures their own OpenRouter key as follows:

1. Copy the safe environment template:

   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and configure the required server-only values:

   ```dotenv
   OPENROUTER_API_KEY=
   OPENROUTER_MODEL=
   ```

   Paste your own key after the first `=` and choose a current model slug from the
   [OpenRouter model catalog](https://openrouter.ai/models).

3. Optionally adjust the app-attribution values:

   ```dotenv
   OPENROUTER_SITE_URL=http://localhost:5173
   OPENROUTER_APP_NAME=Chiri AI Document Editor
   ```

4. Confirm Git ignores the local secret file before committing:

   ```bash
   git check-ignore -v .env.local
   git status --short
   ```

`OPENROUTER_API_KEY` must never use a `VITE_` prefix. Vite exposes `VITE_*`
values to browser code, so an API key stored that way is public even when the
environment file itself is ignored. The real integration will send browser
requests to a same-origin server endpoint; only that server will read the key
and call OpenRouter.

Do not commit `.env.local`, paste the key into source code or tests, or include
it in screenshots and logs. Configure the same variable through the deployment
platform's encrypted secret settings for hosted environments. If a key is ever
exposed, revoke and replace it in OpenRouter immediately; deleting it from a
later Git commit does not make the original key safe.

Automated tests use injected mock providers and intercepted local responses. They
do not require an OpenRouter key or consume API tokens.

## Offline mock states

Include one of these tokens in the instruction to exercise a state:

- `[mock:error]` - provider failure
- `[mock:empty]` - empty provider response
- `[mock:unchanged]` - valid no-change response

Any other instruction returns deterministic Markdown with a visible mock
revision. Refinement adds another deterministic revision to the previous
proposal.

## Architecture

```text
Milkdown/Crepe
  -> Markdown and selection state
  -> SuggestionProvider interface
  -> HttpSuggestionProvider -> same-origin server proxy
  -> OpenRouter chat completions
  -> diffWordsWithSpace
  -> user review
  -> explicit accept/reject
```

The provider boundary is transport-neutral. Tests inject `MockSuggestionProvider`
without changing the editor, diff, or review workflow.

## Deliberate trade-offs

This showcase keeps the document and accepted-change history in memory and
supports one active proposal. It has no authentication, database, persistent
storage, or multi-user collaboration protocol. The server proxy protects the
OpenRouter key but does not provide user authentication.

## With more time

Consider persistence, richer structural diffs, user authentication, and tracked
changes.
