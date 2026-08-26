# Mandatory Implementation Plan — Chiri AI Document Editor

## Goal

Build the smallest complete version of the challenge that satisfies all mandatory requirements before adding optional features.

The application must support this core workflow:

1. User writes or edits Markdown.
2. User asks the AI to modify either:
   - the full document, or
   - the current selection.
3. AI returns a proposed change.
4. The application shows the difference between the original and proposed content.
5. User can:
   - Accept the proposal
   - Reject the proposal
   - Refine the proposal with another instruction
6. The editor is only modified after the user accepts.

Do not implement optional features such as version history, slash commands, tracked-change decorations, advanced collaboration, persistence, authentication, or multiple documents until the mandatory workflow is complete.

---

# 1. Technology Stack

Use:

- React
- TypeScript
- Vite
- Milkdown
- Milkdown Crepe
- `diff`
- Native `fetch` for OpenRouter
- React built-in state only

Installed dependencies:

```bash
npm install @milkdown/react @milkdown/kit @milkdown/crepe diff
```

Avoid adding:

- Redux
- Zustand
- React Router
- Axios
- Tailwind
- Next.js
- databases
- authentication
- backend infrastructure unless required for API-key handling

Keep the implementation intentionally small.

---

# 2. Core Architecture

Organize the source code approximately as:

```text
src/
├── components/
│   ├── DocumentEditor.tsx
│   ├── AiControls.tsx
│   ├── SuggestionPanel.tsx
│   └── DiffView.tsx
│
├── ai/
│   ├── openRouter.ts
│   └── prompts.ts
│
├── diff/
│   └── computeDiff.ts
│
├── types/
│   └── suggestion.ts
│
├── App.tsx
└── main.tsx
```

Do not over-engineer this structure. Merge files if some abstractions remain trivial.

---

# 3. Define the Core Data Model

Create a suggestion model similar to:

```ts
export type SuggestionStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'

export interface AiSuggestion {
  originalText: string
  proposedText: string
  instruction: string
  scope: 'document' | 'selection'
  status: SuggestionStatus
}
```

The application should maintain:

```ts
documentMarkdown
selectedMarkdown
selectionRange
aiInstruction
suggestion
```

Important design rule:

> The AI must never directly modify the editor.

The AI only produces a proposal.

The document changes only when the user explicitly clicks **Accept**.

---

# 4. Implement the Markdown Editor First

Create `DocumentEditor`.

Use Milkdown / Crepe as the editor.

Initial requirements:

- Render the editor.
- Load an initial Markdown document.
- Allow normal user editing.
- Keep the current Markdown synchronized with React/application state.
- Expose a way to programmatically replace the editor content after an accepted AI suggestion.

Use a simple default document such as:

```md
# Welcome

Start writing here.
```

Do not add AI functionality yet.

Acceptance criteria:

- User can type Markdown.
- Formatting behaves correctly.
- Application can read the current Markdown.
- Application can programmatically update the editor.

---

# 5. Capture Text Selection

The mandatory specification allows AI suggestions for either the document or a selection.

Implement selection detection in Milkdown / ProseMirror.

Track:

```ts
selectedMarkdown
selectionFrom
selectionTo
```

Behavior:

- If a non-empty selection exists:
  - AI action targets the selection.
- If no selection exists:
  - AI action targets the entire document.

Show a small indication near the AI controls:

```text
Editing: Selected text
```

or:

```text
Editing: Entire document
```

Do not implement complex multi-block selection UI yet.

Acceptance criteria:

- Selecting text changes the AI target.
- Clearing the selection returns the target to the full document.

---

# 6. Build the AI Instruction UI

Create `AiControls`.

Minimum UI:

```text
[ Ask AI to change this...                     ]

[ Suggest changes ]
```

The input should accept arbitrary instructions such as:

```text
Make this paragraph more concise
```

```text
Rewrite this in a professional tone
```

```text
Improve clarity and grammar
```

If text is selected, the AI request operates on the selection.

Otherwise it operates on the whole document.

Validation:

- Disable submission while instruction is empty.
- Disable submission while request is loading.
- Show loading feedback.

Do not implement predefined AI actions yet.

---

# 7. Implement OpenRouter Integration

Create:

```text
src/ai/openRouter.ts
```

Implement one function:

```ts
generateSuggestion({
  text,
  instruction
})
```

Return only the proposed Markdown.

Use the provided OpenRouter API key.

Store configuration in:

```text
.env.local
```

Example:

```text
VITE_OPENROUTER_API_KEY=...
```

Ensure `.env.local` is excluded from Git.

For this assessment, if the API is called directly from the browser, document the security trade-off in the README:

- acceptable for a temporary showcase key
- not acceptable for a production application
- production implementation would proxy the request through a backend

---

# 8. Design the AI Prompt

Create:

```text
src/ai/prompts.ts
```

The model should receive something conceptually equivalent to:

```text
You are editing a Markdown document.

Follow the user's instruction and return the revised Markdown only.

Do not explain the changes.
Do not wrap the response in Markdown code fences.
Preserve parts of the content that do not need modification.

USER INSTRUCTION:
{instruction}

MARKDOWN:
{text}
```

The output must be predictable enough that the application can treat the response as Markdown.

Do not request JSON unless there is a concrete reason to do so.

The AI should produce:

```text
original Markdown
        ↓
AI
        ↓
proposed Markdown
```

rather than returning commentary about the change.

---

# 9. Create the Suggestion State Flow

Implement the following state machine:

```text
IDLE
  ↓
User submits instruction
  ↓
LOADING
  ↓
AI response
  ↓
READY
```

Possible error branch:

```text
LOADING
  ↓
ERROR
```

When a request begins, store:

```ts
originalText
instruction
scope
```

When the response arrives, store:

```ts
proposedText
```

Important:

Do not replace the current editor content at this stage.

---

# 10. Implement the Diff Engine

Create:

```text
src/diff/computeDiff.ts
```

Use the `diff` dependency.

Start with:

```ts
diffWords()
```

or:

```ts
diffWordsWithSpace()
```

Return segments such as:

```ts
interface DiffSegment {
  value: string
  type: 'unchanged' | 'added' | 'removed'
}
```

Convert the `diff` library output into this internal format.

Do not attempt structural Markdown AST diffs yet.

The priority is a clear, understandable proposal.

---

# 11. Implement the Visible Diff UI

Create `DiffView`.

Display:

- removed text distinctly
- added text distinctly
- unchanged text normally

Conceptually:

```text
The product is [very complicated] [simple and intuitive].
```

The UI should make it immediately obvious what will change.

Avoid showing only:

```text
Before
After
```

unless necessary.

A visible actual diff is closer to the mandatory requirement.

Accessibility:

- Do not rely solely on color.
- Removed content can use strikethrough.
- Added content can use underline/background styling or labels.

---

# 12. Implement the Suggestion Panel

Create `SuggestionPanel`.

When an AI suggestion exists, show:

```text
AI suggestion

[diff]

[Accept] [Reject]
```

The panel should be visually associated with the document, not presented as a generic chat conversation.

The suggestion represents a proposed edit, not an AI message.

---

# 13. Implement Accept

When the user presses:

```text
Accept
```

For a whole-document suggestion:

```ts
document = proposedText
```

For a selected-text suggestion:

replace only the selected range with:

```ts
proposedText
```

Then:

- update Milkdown
- clear the current suggestion
- clear loading/error state
- return to normal editing

Important:

The document should change exactly once.

Avoid triggering duplicate editor updates through both Milkdown and React synchronization.

---

# 14. Implement Reject

When the user presses:

```text
Reject
```

Do not modify the editor.

Simply clear the current suggestion:

```ts
setSuggestion(null)
```

The original document remains untouched.

Acceptance criteria:

- AI suggestion disappears.
- Document is exactly as it was before the AI request.

---

# 15. Implement Refinement

This is mandatory.

When a suggestion is active, show:

```text
[ Refine this suggestion... ]

[ Refine ]
```

Example:

Initial request:

```text
Make this more professional
```

AI produces Proposal A.

User then writes:

```text
Make it shorter too
```

The next AI call should use **Proposal A as the input**, not the original document.

Flow:

```text
Original
   ↓
AI instruction #1
   ↓
Proposal A
   ↓
Refinement instruction
   ↓
Proposal B
```

Then update the diff to compare:

```text
Original
vs.
Proposal B
```

The document itself remains unchanged until **Accept**.

This allows multiple refinement turns:

```text
Original
   ↓
Suggestion 1
   ↓
Suggestion 2
   ↓
Suggestion 3
```

while always preserving the original document for final comparison.

---

# 16. Handle Selected-Text Refinement Correctly

For selection-based editing, preserve:

```ts
originalSelectedText
selectionFrom
selectionTo
```

The refinement pipeline should operate only on:

```text
proposed selected text
```

When accepted:

```text
document before selection
+
final proposed selection
+
document after selection
```

Do not ask the AI to regenerate the entire document for a selection-based edit.

---

# 17. Handle Errors

Minimum error handling:

### Missing API key

Display:

```text
OpenRouter API key is not configured.
```

### Network error

Display:

```text
Unable to contact the AI service. Please try again.
```

### Empty AI response

Treat it as an error.

### API error

Display a useful but concise message.

Do not expose:

- API keys
- full request headers
- raw internal stack traces

Provide:

```text
Try again
```

or allow another submission.

---

# 18. Prevent Conflicting Editing During a Suggestion

Choose a simple interaction model.

Recommended:

Allow the document to remain visible, but while a suggestion is active either:

### Option A — preferred for simplicity

Temporarily prevent editing until:

- Accept
- Reject

or:

### Option B

Detect if the underlying document changed and invalidate the suggestion.

For the mandatory version, choose **Option A**.

This avoids having to reconcile a stale AI proposal with a document that changed in parallel.

---

# 19. Basic Visual Layout

Use a simple single-page layout.

Suggested:

```text
┌─────────────────────────────────────────────────────┐
│ Chiri AI Editor                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│                Markdown Editor                      │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ AI instruction                                      │
│ [ Improve this paragraph...                    ]    │
│ [ Suggest changes ]                                 │
├─────────────────────────────────────────────────────┤
│ AI Suggestion                                       │
│                                                     │
│ visible diff                                        │
│                                                     │
│ [Accept] [Reject]                                   │
│                                                     │
│ [Refine this suggestion...] [Refine]                │
└─────────────────────────────────────────────────────┘
```

This is only a structural guide.

The challenge does not require visual perfection.

Prioritize:

- readability
- clear hierarchy
- intuitive controls
- obvious AI state

---

# 20. UX Rules

Apply these rules consistently:

### Before AI request

User is editing.

### During AI request

Show loading feedback.

### After AI response

User is reviewing a proposed change.

### Accept

AI proposal becomes the document.

### Reject

Proposal disappears.

### Refine

Proposal changes, document does not.

At every point, the user should know:

```text
What is currently in my document?
What does the AI want to change?
Has the AI already changed anything?
What happens if I press Accept?
```

The answer to those questions should always be visually obvious.

---

# 21. Mandatory Acceptance Tests

Before implementing optional features, manually verify all of the following.

## Editor

- [ ] Application loads.
- [ ] User can type Markdown.
- [ ] Markdown content can be retrieved from Milkdown.
- [ ] Editor content can be programmatically replaced.

## Full document AI

- [ ] User enters an AI instruction.
- [ ] AI receives the current document.
- [ ] AI returns proposed Markdown.
- [ ] Document does not change automatically.
- [ ] Diff appears.
- [ ] Accept updates the document.
- [ ] Reject leaves document unchanged.

## Selection AI

- [ ] User selects text.
- [ ] UI recognizes selection mode.
- [ ] AI receives only selected content.
- [ ] Diff represents selected content.
- [ ] Accept replaces only the selected content.
- [ ] Content outside the selection stays unchanged.
- [ ] Reject changes nothing.

## Refinement

- [ ] User can refine a generated suggestion.
- [ ] Refinement uses the previous proposal as input.
- [ ] Diff updates.
- [ ] Original document remains unchanged.
- [ ] Multiple refinements work.
- [ ] Accept applies the latest proposal.

## Errors

- [ ] Missing API key handled.
- [ ] API error handled.
- [ ] Empty AI response handled.
- [ ] User can retry.

---

# 22. Production Build Verification

Run:

```bash
npm run build
```

Resolve all:

- TypeScript errors
- ESLint errors
- build errors

Then:

```bash
npm run preview
```

Verify the complete workflow in the production build.

---

# 23. README

Create a README containing at least:

## What this is

Short explanation of the collaborative AI Markdown editor.

## Features

Only list actually implemented functionality.

## Run locally

```bash
npm install
npm run dev
```

Include Node version requirements.

## Environment

Explain:

```text
VITE_OPENROUTER_API_KEY
```

Do not include the actual key.

## Architecture

Briefly explain:

```text
Milkdown
→ Markdown state
→ OpenRouter proposal
→ diff
→ user review
→ explicit accept
```

## Trade-offs

Mention deliberate scope choices.

Examples:

- No authentication
- No database
- No document persistence
- No version history
- Simple word-level diff
- AI proposal state kept locally
- Browser-side API integration used only because this is a showcase challenge, if applicable

## What I would do with more time

Put optional features here rather than implementing them before the mandatory functionality is solid.

---

# 24. Save the AI Development Session

The repository must contain the AI session used while building the project.

Create something like:

```text
ai-sessions/
└── chatgpt-session.md
```

Commit it alongside the project.

Do not remove failed approaches or architectural discussions solely to make the process look cleaner.

The purpose is to demonstrate how AI was used during development.

---

# 25. Definition of Done for the Mandatory Phase

Do not start optional requirements until all of the following work end-to-end:

```text
WRITE MARKDOWN
      ↓
SELECT TEXT OR USE WHOLE DOCUMENT
      ↓
ENTER AI INSTRUCTION
      ↓
GENERATE PROPOSAL
      ↓
SHOW VISIBLE DIFF
      ↓
 ┌────────────┬────────────┬────────────┐
 │   ACCEPT   │   REJECT   │   REFINE   │
 └────────────┴────────────┴────────────┘
```

The mandatory phase is complete when:

- Markdown editing works.
- Full-document suggestions work.
- Selection-based suggestions work.
- The proposed edit is visibly diffed.
- AI never silently modifies the document.
- Accept works.
- Reject works.
- Multi-turn refinement works.
- Errors are handled.
- Production build succeeds.
- README exists.
- AI-development transcript is committed.

Only then proceed to optional improvements.