/** Clock and identifier boundary used when successful AI steps are recorded. */
export interface HistoryEnvironment {
  now(): number;
  createId(): string;
}

let fallbackId = 0;

/** Browser-backed environment that can be replaced by deterministic test data. */
export const browserHistoryEnvironment: HistoryEnvironment = {
  now: () => Date.now(),
  createId: () => {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
    ) {
      return crypto.randomUUID();
    }

    fallbackId += 1;
    return `history-${Date.now()}-${fallbackId}`;
  },
};
