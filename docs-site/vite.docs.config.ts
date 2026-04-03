import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import type { Plugin, ResolvedConfig } from "vite";

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
        | { type: "page"; name: string; url: string; $ref: { file: string } }
        | { type: "folder"; name: string; children: TreeNode[] };

      /** Extract title from YAML frontmatter. */
      function frontmatterTitle(file: string): string {
        const src = readFileSync(file, "utf-8");
        const m = /^---\s*\n[\s\S]*?^title:\s*(.+)/m.exec(src);
        return m
          ? m[1].trim()
          : file
              .split("/")
              .pop()!
              .replace(/\.mdx?$/, "");
      }

      /** Build tree for a directory, ordered by meta.json if present. */
      function buildTree(dir: string, urlPrefix: string): TreeNode[] {
        const metaPath = join(dir, "meta.json");
        const meta = existsSync(metaPath)
          ? (JSON.parse(readFileSync(metaPath, "utf-8")) as {
              pages?: string[];
              title?: string;
            })
          : null;
        const order: string[] = meta?.pages ?? [];
        const seen = new Set<string>();
        const nodes: TreeNode[] = [];

        function addEntry(name: string): void {
          if (seen.has(name)) return;
          seen.add(name);
          const full = join(dir, name);

          // Directory → folder node
          if (existsSync(full) && statSync(full).isDirectory()) {
            const folderMeta = join(full, "meta.json");
            const fm = existsSync(folderMeta)
              ? (JSON.parse(readFileSync(folderMeta, "utf-8")) as {
                  title?: string;
                })
              : null;
            nodes.push({
              type: "folder",
              name: fm?.title ?? name,
              children: buildTree(full, `${urlPrefix}/${name}`),
            });
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
              nodes.push({
                type: "page",
                name: frontmatterTitle(filePath),
                url,
                $ref: { file: rel },
              });
              return;
            }
          }
        }

        // Add ordered entries first, then remaining files
        for (const name of order) addEntry(name);
        for (const entry of readdirSync(dir)) {
          if (entry === "meta.json") continue;
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
          .replace(/^import\s+.*$/gm, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/```[\s\S]*?```/g, " ")
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/\*{1,2}([^*]*)\*{1,2}/g, "$1")
          .replace(/`([^`]*)`/g, "$1")
          .replace(/\s+/g, " ")
          .trim();
      }

      function slugify(text: string): string {
        return text
          .toLowerCase()
          .replace(/[^\w]+/g, "-")
          .replace(/^-|-$/g, "");
      }

      const searchEntries = Object.entries(pathMap).map(([key, rel]) => {
        const filePath = join(docsDir, rel);
        const src = readFileSync(filePath, "utf-8");
        const fmMatch = /^---\s*\n([\s\S]*?)\n---/.exec(src);
        const fm: Record<string, string> = {};
        if (fmMatch) {
          for (const line of fmMatch[1].split("\n")) {
            const [k, ...rest] = line.split(":");
            if (k && rest.length) fm[k.trim()] = rest.join(":").trim();
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
                .map((s) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
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

/**
 * Workaround for nitro@3 + TanStack Start prerender incompatibility.
 *
 * Two issues combine to break prerendering:
 *
 * 1. Nitro's preview server spawns a child process that uses
 *    `fetch(req, { viteEnv: "ssr" })` — a Vite-dev-only API that
 *    crashes in production (nitrojs/nitro#3905).
 *
 * 2. Nitro's main plugin skips preview mode (`apply: !isPreview`),
 *    so the SSR environment's outDir is never configured. TanStack
 *    Start's preview handler then looks in `dist/server/` instead
 *    of `.nitro/vite/services/ssr/`.
 *
 * This plugin strips nitro's broken preview handler and sets the
 * correct SSR outDir so TanStack Start's own preview handler can
 * import the SSR module directly via .fetch().
 *
 * The tslib alias in `resolve.alias` works around a Rolldown CJS
 * interop bug where tslib's UMD sets `__esModule: true` without a
 * `default` export, causing `__toESM(...).default` to be undefined.
 *
 * Remove when nitro ships the fetchViteEnv fix (landed in nitro-nightly).
 */
function fixNitroPrerender(): Plugin {
  return {
    name: "fix-nitro-prerender",
    enforce: "post",
    config() {
      return {
        environments: {
          ssr: {
            build: {
              outDir: ".nitro/vite/services/ssr",
            },
          },
        },
      };
    },
    configResolved(config) {
      for (const p of config.plugins) {
        if (p.name === "nitro:preview" && "configurePreviewServer" in p) {
          delete (p as Record<string, unknown>).configurePreviewServer;
        }
      }
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
    fixNitroPrerender(),
    docsDataPlugin(),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: "tslib/tslib.es6.mjs",
    },
  },
});
