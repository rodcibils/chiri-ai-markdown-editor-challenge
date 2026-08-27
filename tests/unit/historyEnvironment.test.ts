import { describe, expect, it, vi } from 'vitest';

import { browserHistoryEnvironment } from '../../src/history/historyEnvironment';

describe('browserHistoryEnvironment', () => {
  it('uses crypto UUIDs when available', () => {
    const createId = vi.fn(() => 'uuid');
    vi.stubGlobal('crypto', { randomUUID: createId });

    expect(browserHistoryEnvironment.createId()).toBe('uuid');
    expect(createId).toHaveBeenCalledOnce();
  });

  it('falls back to unique counter IDs without crypto UUID support', () => {
    vi.stubGlobal('crypto', { randomUUID: undefined });

    const first = browserHistoryEnvironment.createId();
    const second = browserHistoryEnvironment.createId();

    expect(first).toMatch(/^history-/);
    expect(second).toMatch(/^history-/);
    expect(second).not.toBe(first);
  });
});
