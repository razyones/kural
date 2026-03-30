/**
 * The grid. Renders score breakdown tables using cliui's table API.
 * It is the only module that owns tabular score display — no other
 * module formats score data into rows and columns.
 */

import { SCORE_DECIMALS, formatDelta } from "./hero.ts";
import { colors, ui } from "./log.ts";

const NONE = 0;
const NO_VALUE = "\u2014";

type ScoreTableRow = {
  path: string;
  kind: string;
  self: number | null;
  children: number | null;
  subtree: number | null;
  overall: number | null;
  selfDelta?: number;
  childrenDelta?: number;
  subtreeDelta?: number;
  overallDelta?: number;
};

/**
 * Formats a score cell with cyan color and optional delta.
 */
function formatCell(value: number | null, delta?: number): string {
  if (value === null) {
    return colors.dim(NO_VALUE);
  }
  const scoreText = colors.cyan(value.toFixed(SCORE_DECIMALS));
  if (delta !== undefined && delta !== NONE) {
    return `${scoreText} ${formatDelta(delta).trim()}`;
  }
  return scoreText;
}

/** Pagination info for the table header. */
type TablePagination = {
  showing: number;
  total: number;
};

/**
 * Renders a score breakdown table with optional delta columns.
 */
function renderScoreTable(rows: ScoreTableRow[], pagination?: TablePagination): void {
  const pathHeader =
    pagination === undefined
      ? "Path"
      : `Path ${colors.dim(`(${String(pagination.showing)} of ${String(pagination.total)})`)}`;
  const table = ui.table();
  table.head([
    pathHeader,
    "Kind",
    { content: "Self (-1…1)", hAlign: "right" },
    { content: "Children (-1…1)", hAlign: "right" },
    { content: "Subtree (-1…1)", hAlign: "right" },
    { content: "Overall (-1…1)", hAlign: "right" },
  ]);
  table.fluidColumnIndex(NONE);

  for (const row of rows) {
    table.row([
      row.path,
      colors.dim(row.kind),
      { content: formatCell(row.self, row.selfDelta), hAlign: "right" },
      { content: formatCell(row.children, row.childrenDelta), hAlign: "right" },
      { content: formatCell(row.subtree, row.subtreeDelta), hAlign: "right" },
      {
        content: formatCell(row.overall, row.overallDelta),
        hAlign: "right",
      },
    ]);
  }

  table.render();
}

export { formatCell, renderScoreTable };
export type { ScoreTableRow, TablePagination };
