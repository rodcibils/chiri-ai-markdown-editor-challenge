/** Formats an epoch timestamp with a caller-provided locale formatter. */
export function formatHistoryTimestamp(
  timestamp: number,
  formatter: Intl.DateTimeFormat,
): string {
  return formatter.format(new Date(timestamp));
}

/** Converts an epoch timestamp to the machine-readable value used by `<time>`. */
export function toHistoryDateTime(timestamp: number): string {
  return new Date(timestamp).toISOString();
}
