/**
 * Adds inline ANSI color to single-line TypeScript source so the
 * shared cliui palette governs how tokens look on screen. It is the
 * only module that owns this token-to-color mapping — no other module
 * styles inline source for terminal output.
 *
 * The shared cliui palette feeds the theme so styling still emits
 * when the upstream library would otherwise skip output without TTY
 * detection. Illegal-syntax errors are swallowed so callers can pass
 * truncated or marker-spliced source without risking a render-time
 * throw.
 */

import { colors } from "./log.ts";
import { highlight } from "cli-highlight";

const HIGHLIGHT_LANG = "typescript";

const cyan = (text: string): string => colors.cyan(text);
const dim = (text: string): string => colors.dim(text);
const blue = (text: string): string => colors.blue(text);
const green = (text: string): string => colors.green(text);
const magenta = (text: string): string => colors.magenta(text);
const yellow = (text: string): string => colors.yellow(text);

const THEME = {
  built_in: cyan,
  type: cyan,
  class: cyan,
  title: cyan,
  keyword: blue,
  literal: blue,
  symbol: blue,
  number: green,
  string: green,
  regexp: green,
  attr: yellow,
  variable: yellow,
  meta: magenta,
  comment: dim,
  punctuation: dim,
  operator: dim,
  params: dim,
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

export { highlightSignature };
