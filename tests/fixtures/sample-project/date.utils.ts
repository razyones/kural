/** Date utility functions. */

const DATE_START = 0;
const DATE_END = 10;

/** Formats a date as YYYY-MM-DD. */
export function formatDate(date: Date): string {
  return date.toISOString().slice(DATE_START, DATE_END);
}

/** A date range. */
export type DateRange = {
  start: Date;
  end: Date;
};
