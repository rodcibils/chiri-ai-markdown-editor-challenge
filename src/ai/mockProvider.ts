import type { SuggestionProvider, SuggestionRequest } from './provider'

/** Deterministic offline provider used to exercise the complete review workflow. */
export class MockSuggestionProvider implements SuggestionProvider {
  /**
   * Simulates an asynchronous AI call and returns Markdown-only output.
   * Reserved instruction tokens make failure states reproducible during manual testing.
   */
  generateSuggestion({
    markdown,
    instruction,
    signal,
  }: SuggestionRequest): Promise<string> {
    return new Promise((resolve, reject) => {
      let timer = 0

      const abort = () => {
        // Match the cancellation behavior expected from a future fetch request.
        window.clearTimeout(timer)
        reject(new DOMException('Request aborted', 'AbortError'))
      }

      if (signal?.aborted) {
        abort()
        return
      }

      signal?.addEventListener('abort', abort, { once: true })
      timer = window.setTimeout(() => {
        signal?.removeEventListener('abort', abort);

        const command = instruction.trim().toLowerCase();
        if (command.includes('[mock:error]')) {
          reject(new Error('Mock AI service unavailable.'))
          return;
        }
        if (command.includes('[mock:empty]')) {
          resolve('')
          return;
        }
        if (command.includes('[mock:unchanged]')) {
          resolve(markdown)
          return;
        }

        // Appending a valid Markdown block gives the diff UI a predictable change.
        const marker = markdown.includes('Mock revision:')
          ? `> Refinement applied: ${instruction.trim()}`
          : `> Mock revision: ${instruction.trim()}`
        resolve(`${markdown}\n\n${marker}`)
      }, 600);
    })
  }
}
