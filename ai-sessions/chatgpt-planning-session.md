# ChatGPT Planning Session --- Chiri Engineering Assessment

**Project:** Chiri AI Document Editor\
**Tool:** ChatGPT (GPT-5.6 Sol)\
**Purpose:** Planning, environment setup, technology selection, and
implementation strategy for the Chiri Engineering Assessment.\
**Export date:** August 28, 2026

> This transcript contains the challenge-related conversation used to
> plan and prepare the implementation. It does not include hidden
> system/developer instructions or internal reasoning.

------------------------------------------------------------------------

## User

I want you to review this code challenge instructions and I'll be asking
you questions about it, for now just read it for context.

## Assistant

I've read the full challenge and have it as context.

I also noted the evaluation criteria, the expected **4--6 hour scope**,
the mandatory use/documentation of AI during development, and the
optional ideas such as inline diffs, command palettes, version history,
and multi-turn refinement.

Ask me anything about it when you're ready.

------------------------------------------------------------------------

## User

How can I save the transcript of this conversation in order to share it
with them afterwards?

## Assistant

Yes. Since the challenge **explicitly requires you to save the AI
session/transcript and commit it to the repository**, this ChatGPT
conversation can serve as that evidence.

For this challenge, I'd recommend **not relying only on a ChatGPT share
link**. Put a static transcript directly in the Git repository, ideally
something like:

``` text
/
├── README.md
├── ai-sessions/
│   └── chatgpt-session.md
├── src/
└── ...
```

The simplest workflow is: when we're finished building the challenge,
ask me something like **"Create a Markdown transcript of our work on
this challenge that I can commit to the repo."** I can produce a clean
`.md` artifact containing the relevant conversation/workflow.

I'd preserve the useful parts rather than unrelated previous
conversations: your questions/prompts, my responses, architectural
decisions, iterations, debugging, trade-offs, and changes we made along
the way. That actually gives the reviewers what they're asking for:
evidence of **how you used AI to build the project**, not merely
evidence that ChatGPT was open.

You can also use ChatGPT's built-in **Share** feature for this
conversation as supplementary evidence, but I'd still commit the
Markdown transcript because their wording specifically says the session
should be **committed to the Git repository alongside the code**.

So we can simply continue doing the challenge **in this conversation**,
including architecture, implementation decisions, code, debugging, etc.
At the end, I can help you turn the relevant session into a polished
`ai-sessions/chatgpt-session.md` for the submission.

------------------------------------------------------------------------

## User

as we need the markdown feature, take a look at what dependency options
do we have in relation to this and thus, what web dev framework could we
use for this development

## Assistant

For this challenge, the Markdown editor dependency should probably drive
the framework choice more than the other way around. The brief
explicitly says **don't build a Markdown editor from scratch** and that
using something like Tiptap is fine. It also gives us freedom on
framework choice and explicitly mentions React, Vue, Svelte, or vanilla
JS.

The main options I'd consider are:

  ---------------------------------------------------------------------------------------
  Editor            Framework fit        Markdown          Extensibility   My take
                                                           for AI diffs    
  ----------------- -------------------- ----------------- --------------- --------------
  **Milkdown**      React, Vue, vanilla  Native/core       Excellent       **Best fit**
                                         concept                           

  **Tiptap**        React, Vue, vanilla  Supported, but    Excellent       Strong
                                         Markdown                          alternative
                                         extension is beta                 

  **CodeMirror 6**  React wrappers       Excellent as raw  Very good       Best if we
                    available            Markdown text                     want
                                                                           source-style
                                                                           editor

  **Lexical**       Mainly React         Markdown via      Very            More work than
                                         transformers      customizable    needed

  **ProseMirror**   Framework-agnostic   Possible          Maximum control Too low-level
                                                                           for 4--6h

  **MDXEditor**     React                Markdown-native   Good            Fast, but less
                                                                           control than
                                                                           Milkdown
  ---------------------------------------------------------------------------------------

### Milkdown + React + TypeScript

This is the one I would choose.

Milkdown is specifically designed as a **WYSIWYG Markdown editor**, and
internally it is built on top of **ProseMirror + Remark**. Its
plugin-driven architecture is a strong fit for Markdown editing and
future AI diff extensions.

It has first-class React integration:

``` bash
npm install @milkdown/react @milkdown/kit
```

or, if we want something ready-made very quickly:

``` bash
npm install @milkdown/crepe @milkdown/react @milkdown/kit
```

`Crepe` is Milkdown's batteries-included editor.

The important thing for our challenge is that we can retrieve the actual
Markdown and programmatically replace or insert Markdown.

That maps well onto an AI flow:

``` text
Milkdown document
       ↓
getMarkdown()
       ↓
AI request
       ↓
suggested Markdown
       ↓
calculate diff
       ↓
show proposal
       ↓
Accept / Reject / Refine
       ↓
update editor
```

And because Milkdown is based on ProseMirror, if we later want **inline
decorations for insertions/deletions**, we have a proper document model
beneath us rather than fighting a textarea.

### Tiptap + React + TypeScript

Tiptap would normally be one of my first choices for a rich editor, and
the challenge even mentions it explicitly.

Architecturally, Tiptap is excellent for the AI part because it is also
built over ProseMirror. We'd have excellent control over selections,
marks, decorations, ranges, commands, etc.

The downside for this challenge is that Tiptap's Markdown support is
less central than Milkdown's. For a **4--6 hour interview challenge
centered specifically around Markdown**, I wouldn't voluntarily make our
central requirement depend on a less Markdown-native path when Milkdown
is available.

So:

``` text
General rich-text product → Tiptap probably wins
Markdown-first product     → Milkdown probably wins
```

### CodeMirror 6 + React

There's another fundamentally different interpretation we could take.

Instead of a Notion/Google Docs-like editor, the user could literally
edit Markdown source with syntax highlighting.

CodeMirror is excellent for that kind of editor. This could make AI
diffs **very easy**, because the canonical document is always just a
string:

``` ts
const originalMarkdown: string
const suggestedMarkdown: string
```

But I think this loses some points against this particular wording:
**"Think Google Docs meets AI pair-writing."**

A CodeMirror implementation risks feeling like an **AI-assisted code
editor**, while Milkdown/Tiptap can feel like an actual document editor.

### Framework choice

I would therefore choose:

``` text
React
TypeScript
Vite
Milkdown
```

rather than Next.js.

The challenge asks for a single-page web app, no auth required, and
explicitly tells us not to add infrastructure we don't need. Vite is a
natural fit.

The stack I'd use:

``` text
React + TypeScript + Vite
        │
        ├── @milkdown/react
        ├── @milkdown/kit
        │
        ├── OpenRouter
        │
        ├── diff / diff-match-patch
        │
        └── plain React state initially
```

I wouldn't introduce Zustand until state complexity actually warrants
it.

One important architectural decision I'd make early is **not to let the
AI directly mutate the Milkdown document**. The AI produces a proposed
change; our application owns the diff and only modifies Milkdown after
the user accepts it. That clean separation naturally enforces the
challenge's core requirement that the user remains in control.

So my recommendation is **React + TypeScript + Vite + Milkdown**, with
Tiptap as our backup option.

------------------------------------------------------------------------

## User

Provide me with instructions of what dependencies I should install
locally on my machine in order to start developing this project and be
able to run it afterwards. We'll go with Milkdown, based on your
recommendation. Assume that no dependencies may be installed previously,
but they might already be.

## Assistant

Since we're going with **React + TypeScript + Vite + Milkdown**, I'd set
up the machine and project as follows. I'm keeping the initial
dependency set intentionally small because the challenge explicitly
values judgment and warns against unnecessary infrastructure.

### 1. Check whether Node.js is already installed

``` bash
node --version
npm --version
```

Use a supported Node LTS version. Node 22 LTS is a safe choice for this
project.

If Node is missing or outdated, install it through a version manager
such as `nvm`.

### 2. Check Git

``` bash
git --version
```

Git is needed because the challenge requires submitting the project
through GitHub/GitLab and committing the AI transcript.

### 3. Create the React + TypeScript project

``` bash
npm create vite@latest chiri-ai-editor -- --template react-ts
cd chiri-ai-editor
npm install
```

This gives us React, TypeScript, Vite, and the base tooling.

### 4. Verify the basic project

``` bash
npm run dev
```

Open the local URL printed by Vite, normally port 5173.

### 5. Install Milkdown

``` bash
npm install @milkdown/react @milkdown/kit
```

### 6. Install Milkdown Crepe

For this challenge I would also install:

``` bash
npm install @milkdown/crepe
```

Crepe gives us a more complete editor UI quickly, allowing us to spend
more of the challenge time on the AI collaboration experience rather
than basic editor controls.

### 7. Install the diff library

``` bash
npm install diff
```

We'll use it to compare the current Markdown against the AI-proposed
Markdown.

### 8. OpenRouter

We don't initially need an OpenRouter SDK. We can use native `fetch()`.

Configuration should live in `.env.local`, and the secret must not be
committed.

### 9. Don't install unnecessary dependencies yet

Don't preemptively install Zustand, Redux, Axios, React Router,
Tailwind, Next.js, etc. Add dependencies only when there is an actual
need.

### Initial dependency command

After creating the Vite project:

``` bash
npm install @milkdown/react @milkdown/kit @milkdown/crepe diff
```

Then verify:

``` bash
npm run dev
npm run build
npm run preview
```

This is enough to start implementing the challenge.

------------------------------------------------------------------------

## User

``` text
rodrigocibils@MacRodri chiri-challenge % node --version
v23.6.0
rodrigocibils@MacRodri chiri-challenge % npm --version
10.9.2
```

## Assistant

You're already fine on the basic runtime setup in terms of having Node
and npm installed.

You have:

``` text
Node: v23.6.0
npm:  10.9.2
```

Given you're already inside `chiri-challenge`, the next step is to
initialize the React + TypeScript Vite app there. If the folder is
empty:

``` bash
npm create vite@latest . -- --template react-ts
npm install
```

Then install:

``` bash
npm install @milkdown/react @milkdown/kit @milkdown/crepe diff
```

One note: Node 23 is a non-LTS release. It may work, but for an
interview project where we want fewer environment surprises, **Node 22
LTS would be the safer choice**.

------------------------------------------------------------------------

## User

Getting:

``` text
rodrigocibils@MacRodri chiri-challenge % npm install
npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: '@eslint/config-array@0.23.5',
npm warn EBADENGINE   required: { node: '^20.19.0 || ^22.13.0 || >=24' },
npm warn EBADENGINE   current: { node: 'v23.6.0', npm: '10.9.2' }
npm warn EBADENGINE }
...
added 1 package, and audited 154 packages in 655ms

42 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

## Assistant

This confirms the Node-version issue: **Node 23 falls into an
unsupported engine range for the current ESLint packages**.

The packages explicitly support:

``` text
^20.19.0 || ^22.13.0 || >=24
```

Your version:

``` text
v23.6.0
```

falls between the supported Node 22 and Node 24 ranges.

The installation technically succeeded, but I wouldn't continue with
Node 23. For a challenge submission, we want a standard, reproducible
environment without engine warnings.

Recommended fix: switch to Node 22 LTS.

First check whether you have `nvm`:

``` bash
nvm --version
```

If you do:

``` bash
nvm install 22
nvm use 22
```

Then verify:

``` bash
node --version
```

After switching, clean dependencies installed under Node 23 and
reinstall:

``` bash
rm -rf node_modules
rm package-lock.json
npm install
```

Then:

``` bash
npm run dev
```

If everything works, continue with:

``` bash
npm install @milkdown/react @milkdown/kit @milkdown/crepe diff
```

------------------------------------------------------------------------

## User

``` text
rodrigocibils@MacRodri chiri-challenge % nvm --version
zsh: command not found: nvm
```

## Assistant

Since you're on macOS with `zsh`, install `nvm` first.

If Homebrew is already available:

``` bash
brew install nvm
```

Create the nvm directory:

``` bash
mkdir ~/.nvm
```

Add the Homebrew nvm initialization to `~/.zshrc`:

``` bash
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"
```

Reload:

``` bash
source ~/.zshrc
```

Verify:

``` bash
nvm --version
```

Then:

``` bash
nvm install 22
nvm use 22
```

Verify Node and npm, then inside `chiri-challenge`:

``` bash
rm -rf node_modules
rm package-lock.json
npm install
npm run dev
```

------------------------------------------------------------------------

## User

Now, make me an implementation plan to be shared with a coding agent
detailing implementation steps for the given challenge. For now, let's
prioritize mandatory requirements, we will be adding optional ones after
completing what's 100% mandatory.

## Assistant

### Mandatory Implementation Plan --- Chiri AI Document Editor

The plan is intentionally scoped to the **mandatory requirements only**.

#### Goal

Build the smallest complete version that supports:

1.  User writes or edits Markdown.
2.  User asks AI to modify the full document or current selection.
3.  AI returns a proposed change.
4.  Application shows the difference between original and proposed
    content.
5.  User can Accept, Reject, or Refine.
6.  Editor is modified only after explicit acceptance.

Do not implement optional features such as version history, slash
commands, advanced tracked changes, persistence, authentication, or
multiple documents until this workflow is complete.

#### Technology Stack

Use:

-   React
-   TypeScript
-   Vite
-   Milkdown
-   Milkdown Crepe
-   `diff`
-   Native `fetch` for OpenRouter
-   React built-in state initially

#### Suggested structure

``` text
src/
├── components/
│   ├── DocumentEditor.tsx
│   ├── AiControls.tsx
│   ├── SuggestionPanel.tsx
│   └── DiffView.tsx
├── ai/
│   ├── openRouter.ts
│   └── prompts.ts
├── diff/
│   └── computeDiff.ts
├── types/
│   └── suggestion.ts
├── App.tsx
└── main.tsx
```

Do not over-engineer this structure.

#### Core data model

Track a suggestion with fields equivalent to:

``` ts
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

Important design rule: **the AI must never directly modify the editor**.
It only produces a proposal.

#### Step 1 --- Implement the Markdown editor

Create `DocumentEditor` using Milkdown/Crepe.

Requirements:

-   Render the editor.
-   Load initial Markdown.
-   Allow normal editing.
-   Keep Markdown synchronized with application state.
-   Allow programmatic content replacement after an accepted AI
    suggestion.

Do not add AI functionality until this works.

#### Step 2 --- Capture selection

Track the current editor selection.

If a non-empty selection exists, AI actions target the selection.
Otherwise they target the full document.

Show a small UI indication such as:

``` text
Editing: Selected text
```

or:

``` text
Editing: Entire document
```

#### Step 3 --- AI instruction UI

Create `AiControls` with:

``` text
[ Ask AI to change this... ]
[ Suggest changes ]
```

Disable submission when the instruction is empty or a request is already
loading.

#### Step 4 --- OpenRouter integration

Create `src/ai/openRouter.ts`.

Implement a function equivalent to:

``` ts
generateSuggestion({
  text,
  instruction
})
```

It should return proposed Markdown only.

Keep API configuration in environment variables and never commit
secrets.

#### Step 5 --- Prompt design

Create `src/ai/prompts.ts`.

Prompt the model to act as a Markdown editor, follow the instruction,
return revised Markdown only, avoid explanations/code fences, and
preserve content that does not need modification.

#### Step 6 --- Suggestion state flow

Implement:

``` text
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

with an error branch.

Store the original text before the request and the proposed text after
the response. Do not update the editor yet.

#### Step 7 --- Diff engine

Create `src/diff/computeDiff.ts`.

Use the `diff` package, starting with `diffWords()` or
`diffWordsWithSpace()`.

Normalize output to segments such as:

``` ts
interface DiffSegment {
  value: string
  type: 'unchanged' | 'added' | 'removed'
}
```

Do not implement Markdown AST diffs yet.

#### Step 8 --- Visible diff UI

Create `DiffView`.

Display removed, added, and unchanged content distinctly. Don't rely
solely on color; use treatments such as strikethrough for removals.

#### Step 9 --- Suggestion panel

Create `SuggestionPanel` showing:

``` text
AI suggestion

[diff]

[Accept] [Reject]

[Refine this suggestion...]
[Refine]
```

Treat the suggestion as a proposed edit rather than a chat message.

#### Step 10 --- Accept

For a full-document suggestion, replace the document with proposed
Markdown.

For a selection suggestion, replace only the selected range.

Then update Milkdown and clear suggestion state.

#### Step 11 --- Reject

Reject must leave the editor untouched and simply clear the suggestion.

#### Step 12 --- Refinement

Refinement is part of the required workflow.

Example:

``` text
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

The refinement request uses Proposal A as its input, while the visible
diff continues to compare the original content against the latest
proposal.

The document remains unchanged until Accept.

#### Step 13 --- Selection-based refinement

Preserve the original selection range and original selected text.

Refinements operate only on the proposed selected text.

When accepted, replace only the original selected range.

#### Step 14 --- Error handling

Handle at least:

-   Missing API configuration
-   Network errors
-   API errors
-   Empty AI responses

Do not expose secrets or raw internal stack traces.

#### Step 15 --- Conflicting editing

For the first mandatory implementation, prevent editing while a
suggestion is active rather than attempting to reconcile stale
suggestions with concurrently edited content.

#### Step 16 --- Basic layout

Use a simple single-page layout with:

-   Markdown editor
-   AI instruction control
-   AI suggestion/diff
-   Accept / Reject / Refine actions

Prioritize readability, hierarchy, intuitive controls, and obvious AI
state over visual perfection.

#### Step 17 --- Acceptance tests

Before optional features, manually verify:

-   Markdown editing works.
-   Full-document AI suggestions work.
-   Selection-based suggestions work.
-   AI never modifies content before acceptance.
-   Visible diff works.
-   Accept works.
-   Reject works.
-   Refinement works, including multiple refinements.
-   Selection acceptance modifies only selected content.
-   Errors are handled.
-   Production build succeeds.

#### Step 18 --- Production verification

Run:

``` bash
npm run build
npm run preview
```

Resolve TypeScript, lint, and build errors.

#### Step 19 --- README

Document:

-   What the app is
-   Implemented features
-   How to run locally
-   Node/environment requirements
-   Architecture
-   Trade-offs
-   What would be done with more time

#### Step 20 --- Save AI development sessions

Commit AI-session evidence under something like:

``` text
ai-sessions/
├── codex-development-session.md
└── chatgpt-planning-session.md
```

#### Mandatory definition of done

``` text
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

Only after this workflow is reliable should optional improvements be
added.

------------------------------------------------------------------------

## User

I'll use codex cli as coding agent - how can I save and export the
transcript to be added into the repo and shared as required?

## Assistant

Codex CLI stores interactive session information locally, so you can
preserve the coding-agent history and add a readable export to the
repository afterward.

For this challenge, I'd use this workflow:

1.  Do challenge work in one main Codex session as much as possible. If
    you close it, resume it rather than starting a new unrelated
    session.

2.  Locate the saved Codex session data under your Codex home directory
    (commonly `~/.codex/sessions/`).

3.  Do not blindly commit raw internal session data. Instead, convert
    the relevant session into a readable Markdown transcript such as:

``` text
ai-sessions/
└── codex-development-session.md
```

A readable transcript should preserve user prompts, Codex responses,
architectural decisions, debugging, and implementation iterations.

You can also use the macOS `script` command as a tool-independent
terminal backup:

``` bash
script codex-session.txt
codex
```

When finished:

``` bash
exit
```

For the final repository, a useful structure is:

``` text
chiri-challenge/
├── src/
├── README.md
├── ai-sessions/
│   ├── codex-development-session.md
│   └── chatgpt-planning-session.md
├── package.json
└── ...
```

Before committing any transcript, search it for secrets:

``` bash
grep -RniE "api[_-]?key|token|secret|OPENROUTER|sk-" ai-sessions/
```

Make sure the OpenRouter key or any other credential is not present.

------------------------------------------------------------------------

## User

when is the deadline for this challenge in Argentina time?

## Assistant

The challenge instructions themselves **do not specify a deadline**.
They only say that a focused **4--6 hour session** is preferred over a
sprawling weekend project.

If the deadline was provided separately, the exact date/time and
timezone are needed to convert it to Argentina time.

------------------------------------------------------------------------

## User

Due date: Monday, Aug. 31st, 12 noon PST.

## Assistant

That deadline should be treated as **Monday, August 31, 2026 at 4:00 PM
Argentina time (ART, UTC−3)**.

On August 31, the U.S. Pacific time zone normally observes daylight
saving time (PDT, UTC−7), so:

``` text
12:00 noon Pacific Daylight Time
→ 4:00 PM Argentina
```

They wrote "PST", but if they literally meant fixed PST (UTC−8), that
would correspond to 5:00 PM Argentina. In normal business usage people
often write "PST" when they mean Pacific Time generally, so **4:00 PM
Argentina is the safer deadline to use**.

------------------------------------------------------------------------

## User

I want you to export the transcript of this conversation to be added to
the git repo and shared with the challenge's team.

------------------------------------------------------------------------

# End of exported session

This file was generated from the challenge-related portion of the
ChatGPT conversation for inclusion with the engineering assessment
submission.
