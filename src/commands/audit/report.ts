/**
 * The narrator. Builds display context and delegates to each audit's own
 * formatter. It is the only module that bridges audit results to terminal
 * output — no other module knows how to resolve node labels or build
 * formatting context.
 */

import type { CodeNode, NodeMap } from "../../sost/tree.ts";
import { MAX_DISPLAY, findRootNode } from "../../audits/types.ts";
import type { AuditReport } from "../../audits/detect.ts";
import type { FormatCtx } from "../../audits/types.ts";
import type { ListSection } from "../../ui/list.ts";
import { colors } from "../../ui/log.ts";
import { relative } from "node:path";
import { stripKeyPrefix } from "../../utils/paths.ts";

const NONE = 0;

const KIND_LABELS: Record<string, string> = {
  directory: "Directory",
  file: "File",
  type: "Type",
  function: "Function",
};

function kindPrefix(node: CodeNode): string {
  return KIND_LABELS[node.kind] ?? "";
}

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

    return { title: definition.title, total, items };
  });
}

export { formatReport };
