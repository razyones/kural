/**
 * The bulletin board. Renders titled sections of list items to the terminal.
 * It is the only module that owns the bullet-heading-details display pattern —
 * no other module prints indented list items with dim detail lines.
 */

import { colors, logger } from "./log.ts";

const NONE = 0;
const BULLET = "\u25B8";

/** The leaf entry — one bullet heading with optional indented detail lines beneath it. */
type ListItem = {
  heading: string;
  details: string[];
};

/** The titled container — groups entries under a category heading with a count badge. */
type ListSection = {
  title: string;
  /** Total findings (before truncation). */
  total?: number;
  items: ListItem[];
};

/**
 * Renders non-empty sections as titled groups of list items.
 * @param sections - Titled sections to display
 * @kuralCauses writes section groups to stdout
 */
function printListSections(sections: ListSection[]): void {
  const active = sections.filter((s) => s.items.length > NONE);
  for (const section of active) {
    const count = section.total ?? section.items.length;
    logger.log(colors.yellow(`${section.title} (${count})\n`));
    for (const item of section.items) {
      logger.log(`  ${colors.bold(BULLET)} ${item.heading}`);
      for (const detail of item.details) {
        logger.log(colors.dim(`    ${detail}`));
      }
      logger.log("");
    }
  }
}

/**
 * Counts total items across all sections.
 * @param sections - Array of list sections
 * @returns Total number of items
 * @kuralPure
 */
function countListItems(sections: ListSection[]): number {
  let total = NONE;
  for (const section of sections) {
    total += section.total ?? section.items.length;
  }
  return total;
}

export { countListItems, printListSections };
export type { ListItem, ListSection };
