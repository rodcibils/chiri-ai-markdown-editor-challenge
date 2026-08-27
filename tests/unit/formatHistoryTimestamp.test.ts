import { describe, expect, it } from 'vitest';

import {
  formatHistoryTimestamp,
  toHistoryDateTime,
} from '../../src/history/formatHistoryTimestamp';

describe('history timestamp formatting', () => {
  it('formats with the supplied formatter and emits ISO time values', () => {
    const timestamp = Date.UTC(2026, 0, 2, 3, 4, 5);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      dateStyle: 'short',
      timeStyle: 'short',
    });

    expect(formatHistoryTimestamp(timestamp, formatter)).toBe('1/2/26, 3:04 AM');
    expect(toHistoryDateTime(timestamp)).toBe('2026-01-02T03:04:05.000Z');
  });
});
