import type { SuggestionProvider, SuggestionRequest } from './provider';

/** Offline provider with predictable, scope-aware edits for UI review. */
export class MockSuggestionProvider implements SuggestionProvider {
  /** Simulates an abortable AI request and returns scoped Markdown output. */
  generateSuggestion({
    documentMarkdown,
    targetMarkdown,
    instruction,
    scope,
    signal,
  }: SuggestionRequest): Promise<string> {
    return new Promise((resolve, reject) => {
      let timer = 0;
      const abort = () => {
        window.clearTimeout(timer);
        reject(new DOMException('Request aborted', 'AbortError'));
      };

      if (signal?.aborted) {
        abort();
        return;
      }

      signal?.addEventListener('abort', abort, { once: true });
      timer = window.setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        const command = instruction.trim().toLowerCase();

        if (command.includes('[mock:error]')) {
          reject(new Error('Mock AI service unavailable.'));
          return;
        }
        if (command.includes('[mock:empty]')) {
          resolve('');
          return;
        }
        if (command.includes('[mock:unchanged]')) {
          resolve(targetMarkdown);
          return;
        }

        const subject = targetMarkdown || 'this location';
        if (command.includes('[mock:add]') || scope.kind === 'insertion') {
          resolve(`${subject}\n\n### Suggested addition\n\nA new idea for this text.`);
          return;
        }
        if (command.includes('[mock:remove]')) {
          resolve(targetMarkdown.split(/\s+/).slice(0, 2).join(' '));
          return;
        }
        if (command.includes('[mock:rewrite]')) {
          const rewrittenSubject = subject.replace(/\b(the|a|an)\b/gi, 'this');
          resolve(`${rewrittenSubject}\n\n> Mock rewrite applied: ${instruction.trim()}`);
          return;
        }

        const contextHint = documentMarkdown ? `\n\n> Context reviewed: ${documentMarkdown.split('\n')[0]}` : '';
        resolve(`${subject}\n\n> Mock revision: ${instruction.trim()}${contextHint}`);
      }, 600);
    });
  }
}
