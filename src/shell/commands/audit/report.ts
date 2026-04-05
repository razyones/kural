/**
 * The narrator. Builds display context and delegates to each rule's own
 * formatter. It is the only module that bridges diagnostic results to
 * terminal output — no other module knows how to resolve node labels
 * or build formatting context.
 */

import type { CodeNode, NodeMap } from "../../../analysis/tree/tree.ts";
import { MAX_DISPLAY, findRootNode } from "../../../analysis/audits/types.ts";
import type { AuditReport } from "../../../analysis/audits/detect.ts";
import type { FormatCtx } from "../../../analysis/audits/types.ts";
import type { ListSection } from "../../ui/list.ts";
import { colors } from "../../ui/log.ts";
import { relative } from "node:path";
import { stripKeyPrefix } from "../../../utils/paths.ts";

const NONE = 0;

const KIND_LABELS: Record<string, string> = {
  directory: "Directory",
  file: "File",
  type: "Type",
  function: "Function",
};

/**
 * Maps a node's structural kind to its human-readable category prefix for audit output.
 * @param node - The code node to get a kind prefix for
 * @returns The human-readable kind label, or empty string if unknown
 * @kuralPure
 */
function kindPrefix(node: CodeNode): string {
  return KIND_LABELS[node.kind] ?? "";
}

/**
 * Resolves a node key into a root-relative path label that anchors audit findings to their source location.
 * @param key - The unique node key to look up
 * @param nodes - The full code node map for resolution
 * @param rootPath - Absolute project root path for relative display, or null for absolute paths
 * @returns A formatted label string suitable for terminal display
 * @kuralPure
 */
function nodeLabel(key: string, nodes: NodeMap, rootPath: string | null): string {
  const node = nodes.get(key);
  if (!node) {
    return key;
  }
  const path = stripKeyPrefix(node.key);
  if (node.kind === "directory") {
    return (rootPath === null ? path : relative(rootPath, path) || node.name) + "/";
  }
  if (node.kind === "file") {
    return rootPath === null ? path : relative(rootPath, path) || node.name;
  }
  return node.name;
}

/**
 * Converts an audit report into list sections for terminal display.
 * Each audit's own format function renders its findings.
 * Truncates per section to `limit` items and appends a "and N more..." line.
 * @param report - Ordered audit results with definitions
 * @param nodes - Full code node map for label resolution
 * @param limit - Max findings per section (0 = show all)
 * @returns List sections with formatted items
 * @kuralPure
 */
function formatReport(
  report: AuditReport,
  nodes: NodeMap,
  limit: number = MAX_DISPLAY,
): ListSection[] {
  const root = findRootNode(nodes);
  const rootPath = root === null ? null : stripKeyPrefix(root.key);
  const labelNode = (key: string): string => nodeLabel(key, nodes, rootPath);

  return report.map(({ definition, findings }) => {
    const total = findings.length;
    const showAll = limit === NONE;
    const visible = showAll ? findings : findings.slice(NONE, limit);
    const hidden = total - visible.length;

    const items = visible.map((finding) => {
      const node = nodes.get(finding.key);
      const ctx: FormatCtx = {
        finding,
        label: node
          ? `"${labelNode(finding.key)}" ${colors.cyan(`[${finding.hash}]`)}`
          : finding.name,
        prefix: node ? kindPrefix(node) : "",
        location:
          node !== undefined && node.parentKey !== null
            ? ` in ${colors.dim(labelNode(node.parentKey))}`
            : "",
        labelNode,
        rootPath,
      };
      return definition.format(ctx);
    });

    if (hidden > NONE) {
      items.push({
        heading: colors.dim(`... and ${hidden} more (use --expand to show all)`),
        details: [],
      });
    }

    const titleWithId = `${definition.title} ${colors.dim(`[#${definition.name}]`)}`;
    return { title: titleWithId, total, items };
  });
}

export { formatReport };
