/** String formatting helpers. */

const ARRAY_FIRST = 0;
const AFTER_FIRST = 1;

/** Capitalizes the first letter of a string. */
export function capitalize(str: string): string {
  return str.charAt(ARRAY_FIRST).toUpperCase() + str.slice(AFTER_FIRST);
}

/** A formatting configuration object. */
export type FormatConfig = {
  locale: string;
  currency: string;
};
