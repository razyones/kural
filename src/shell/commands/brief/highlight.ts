/**
 * Wraps cli-highlight so the brief renders TypeScript signatures
 * with proper terminal syntax colors. It is the only module that
 * speaks to the syntax-highlighter — no other module decides which
 * library colors brief code segments.
 *
 * The library defaults to chalk for token styling, but chalk skips
 * ANSI when it can't detect TTY support — so we substitute a theme
 * built from the shared cliui color palette, which always emits.
 * @kuralHelper
 * @kuralResidual misplaced [5d082c29]
 */

import { colors } from "../../ui/log.ts";
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
