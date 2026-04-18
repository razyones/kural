/**
 * Prepares signatures for terminal display — collapses block-typed
 * params to "{…}" so multi-property shapes don't wrap, then adds
 * inline ANSI color to the resulting single-line source via the shared
 * cliui palette. It is the only module that owns signature display
 * preparation — no other module collapses block params or maps tokens
 * to terminal colors.
 *
 * The shared cliui palette feeds the theme so styling still emits
 * when the upstream library would otherwise skip output without TTY
 * detection. Illegal-syntax errors are swallowed so callers can pass
 * truncated or marker-spliced source without risking a render-time
 * throw.
 */

import { colors } from "./log.ts";
import { highlight } from "cli-highlight";

const NONE = 0;
const HIGHLIGHT_LANG = "typescript";

const THEME = {
  built_in: colors.cyan.bind(colors),
  type: colors.cyan.bind(colors),
  class: colors.cyan.bind(colors),
  title: colors.cyan.bind(colors),
  keyword: colors.blue.bind(colors),
  literal: colors.blue.bind(colors),
  symbol: colors.blue.bind(colors),
  number: colors.green.bind(colors),
  string: colors.green.bind(colors),
  regexp: colors.green.bind(colors),
  attr: colors.yellow.bind(colors),
  variable: colors.yellow.bind(colors),
  meta: colors.magenta.bind(colors),
  comment: colors.dim.bind(colors),
  punctuation: colors.dim.bind(colors),
  operator: colors.dim.bind(colors),
  params: colors.dim.bind(colors),
};

/**
 * Highlights a single-line TypeScript signature using cli-highlight
 * with a cliui-backed theme. Illegal-syntax errors are suppressed so
 * reconstructed signatures (which may contain the collapse-marker
 * ellipsis) never throw at render time.
 * @param signature - Reconstructed single-line signature
 * @returns ANSI-styled signature ready for terminal output
 * @kuralPure
 */
function highlightSignature(signature: string): string {
  return highlight(signature, {
    language: HIGHLIGHT_LANG,
    ignoreIllegals: true,
    theme: THEME,
  });
}

/**
 * Collapses block-typed params (object literal types) inside a
 * signature to "{…}" so multi-property param shapes don't wrap the
 * terminal. Outer arrow and return type are preserved.
 * @param signature - A reconstructed function signature
 * @returns A single-line signature with nested object types collapsed
 * @kuralPure
 */
function collapseSignature(signature: string): string {
  let depth = NONE;
  let result = "";
  for (let i = NONE; i < signature.length; i++) {
    const ch = signature[i];
    if (ch === "{") {
      if (depth === NONE) {
        result += "{\u2026}";
      }
      depth++;
      continue;
    }
    if (ch === "}") {
      if (depth > NONE) {
        depth--;
      }
      continue;
    }
    if (depth === NONE) {
      result += ch;
    }
  }
  return result;
}

export { collapseSignature, highlightSignature };
