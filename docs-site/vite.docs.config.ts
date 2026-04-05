import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import type { Plugin } from "vite";

/**
 * Generates a virtual module `virtual:docs-data` that embeds the
 * slug-to-path mapping at build time. This lets the SPA resolve
 * page paths on static hosting without server functions.
 */
function docsDataPlugin(): Plugin {
  const virtualId = "virtual:docs-data";
  const resolvedId = "\0" + virtualId;

  return {
    name: "docs-data",
    resolveId(id) {
      if (id === virtualId) {
        return resolvedId;
      }
    },
    async load(id) {
      if (id !== resolvedId) {
        return;
      }
      const { readdirSync, readFileSync, statSync, existsSync } = await import("node:fs");
      const { join, relative } = await import("node:path");
      const docsDir = join(import.meta.dirname, "../docs");
      const pathMap: Record<string, string> = {};

      type TreeNode =
        | { type: "page"; name: string; url: string; icon?: string; $ref: { file: string } }
        | { type: "folder"; name: string; icon?: string; children: TreeNode[] };

      // Resolve Lucide icon names to SVG strings at build time
      const { icons } = await import("lucide-react");
      const { renderToString } = await import("react-dom/server");
      const { createElement } = await import("react");
      function resolveIcon(name: string | undefined): string | undefined {
        if (!name || !(name in icons)) {
          return;
        }
        return renderToString(createElement(icons[name as keyof typeof icons], { strokeWidth: 1 }));
      }

      /** Extract title and icon from YAML frontmatter. */
      function frontmatter(file: string): { title: string; icon?: string } {
        const src = readFileSync(file, "utf-8");
        const titleMatch = /^---\s*\n[\s\S]*?^title:\s*(.+)/m.exec(src);
        const iconMatch = /^---\s*\n[\s\S]*?^icon:\s*(.+)/m.exec(src);
        const title = titleMatch
          ? titleMatch[1].trim()
          : file
              .split("/")
              .pop()!
              .replace(/\.mdx?$/, "");
        return { title, icon: iconMatch ? iconMatch[1].trim() : undefined };
      }

      /** Build tree for a directory, ordered by meta.json if present. */
      function buildTree(dir: string, urlPrefix: string): TreeNode[] {
        const metaPath = join(dir, "meta.json");
        const meta = existsSync(metaPath)
          ? (JSON.parse(readFileSync(metaPath, "utf-8")) as {
              pages?: string[];
              title?: string;
              icon?: string;
            })
          : null;
        const order: string[] = meta?.pages ?? [];
        const seen = new Set<string>();
        const nodes: TreeNode[] = [];

        function addEntry(name: string): void {
          if (seen.has(name)) {
            return;
          }
          seen.add(name);
          const full = join(dir, name);

          // Directory → folder node
          if (existsSync(full) && statSync(full).isDirectory()) {
            const folderMeta = join(full, "meta.json");
            const fm = existsSync(folderMeta)
              ? (JSON.parse(readFileSync(folderMeta, "utf-8")) as {
                  title?: string;
                  icon?: string;
                })
              : null;
            const folderIcon = resolveIcon(fm?.icon);
            const folder: TreeNode = {
              type: "folder",
              name: fm?.title ?? name,
              children: buildTree(full, `${urlPrefix}/${name}`),
            };
            if (folderIcon) {
              folder.icon = folderIcon;
            }
            nodes.push(folder);
            return;
          }

          // File → page node
          for (const ext of [".mdx", ".md"]) {
            const filePath = join(dir, name + ext);
            if (existsSync(filePath)) {
              const rel = relative(docsDir, filePath);
              const slug = rel.replace(/\.mdx?$/, "").replace(/\/index$/, "");
              const key = slug === "index" ? "" : slug;
              const url = key === "" ? "/docs" : `/docs/${key}`;
              pathMap[key] = rel;
              const fm = frontmatter(filePath);
              const pageIcon = resolveIcon(fm.icon);
              const page: TreeNode = {
                type: "page",
                name: fm.title,
                url,
                $ref: { file: rel },
              };
              if (pageIcon) {
                page.icon = pageIcon;
              }
              nodes.push(page);
              return;
            }
          }
        }

        // Add ordered entries first, then remaining files
        for (const name of order) {
          addEntry(name);
        }
        for (const entry of readdirSync(dir)) {
          if (entry === "meta.json") {
            continue;
          }
          const name = entry.replace(/\.mdx?$/, "");
          addEntry(name);
        }
        return nodes;
      }

      const children = buildTree(docsDir, "");
      const pageTree = {
        $fumadocs_loader: "page-tree",
        data: { $id: "root", name: "Docs", children },
      };

      // Build search entries with structured data (headings + content)
      function stripMarkdown(text: string): string {
        return text
          .replaceAll(/^import\s+.*$/gm, "")
          .replaceAll(/<[^>]+>/g, " ")
          .replaceAll(/```[\s\S]*?```/g, " ")
          .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replaceAll(/\*{1,2}([^*]*)\*{1,2}/g, "$1")
          .replaceAll(/`([^`]*)`/g, "$1")
          .replaceAll(/\s+/g, " ")
          .trim();
      }

      function slugify(text: string): string {
        return text
          .toLowerCase()
          .replaceAll(/[^\w]+/g, "-")
          .replaceAll(/^-|-$/g, "");
      }

      const searchEntries = Object.entries(pathMap).map(([key, rel]) => {
        const filePath = join(docsDir, rel);
        const src = readFileSync(filePath, "utf-8");
        const fmMatch = /^---\s*\n([\s\S]*?)\n---/.exec(src);
        const fm: Record<string, string> = {};
        if (fmMatch) {
          for (const line of fmMatch[1].split("\n")) {
            const [k, ...rest] = line.split(":");
            if (k && rest.length > 0) {
              fm[k.trim()] = rest.join(":").trim();
            }
          }
        }
        const body = fmMatch ? src.slice(fmMatch[0].length) : src;
        const url = key === "" ? "/docs" : `/docs/${key}`;

        // Extract headings and content sections
        const headings: Array<{ id: string; content: string }> = [];
        const contents: Array<{ heading?: string; content: string }> = [];
        let currentHeading: string | undefined;
        let currentContent = "";

        for (const line of body.split("\n")) {
          // Only index h2 headings — skip h3/h4 (too granular)
          const hMatch = /^##\s+(.+)/.exec(line);
          if (hMatch) {
            if (currentContent.trim()) {
              contents.push({
                heading: currentHeading,
                content: stripMarkdown(currentContent).slice(0, 300),
              });
            }
            const heading = stripMarkdown(hMatch[1].trim());
            // Skip code-like headings (camelCase, snake_case, backticks)
            if (/^[a-z].*[A-Z]|_|`/.test(heading)) {
              currentContent = "";
              continue;
            }
            const id = slugify(heading);
            headings.push({ id, content: heading });
            currentHeading = id;
            currentContent = "";
          } else {
            currentContent += line + "\n";
          }
        }
        if (currentContent.trim()) {
          contents.push({
            heading: currentHeading,
            content: stripMarkdown(currentContent).slice(0, 500),
          });
        }

        // Build breadcrumbs from URL path
        const segments = key.split("/").filter(Boolean);
        const breadcrumbs =
          segments.length > 1
            ? segments
                .slice(0, -1)
                .map((s) => s.replaceAll("-", " ").replaceAll(/\b\w/g, (c) => c.toUpperCase()))
            : undefined;

        return {
          title: fm.title ?? key,
          description: fm.description ?? "",
          url,
          breadcrumbs,
          structuredData: { headings, contents },
        };
      });

      return [
        `export const pathMap = ${JSON.stringify(pathMap)};`,
        `export const pageTree = ${JSON.stringify(pageTree)};`,
        `export const searchEntries = ${JSON.stringify(searchEntries)};`,
      ].join("\n");
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  server: {
    port: 3000,
  },
  plugins: [
    mdx(await import("./source.config")),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          enabled: true,
          crawlLinks: true,
        },
      },
    }),
    react(),
    nitro(),
    docsDataPlugin(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: "tslib/tslib.es6.mjs",
    },
  },
});
