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
      const { readdirSync, statSync } = await import("node:fs");
      const { join, relative } = await import("node:path");
      const docsDir = join(import.meta.dirname, "../docs");
      const pathMap: Record<string, string> = {};

      function walk(dir: string): void {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) {
            walk(full);
          } else if (/\.mdx?$/.test(entry)) {
            const rel = relative(docsDir, full);
            const slug = rel.replace(/\.mdx?$/, "").replace(/\/index$/, "");
            const key = slug === "index" ? "" : slug;
            pathMap[key] = rel;
          }
        }
      }
      walk(docsDir);
      return `export const pathMap = ${JSON.stringify(pathMap)};`;
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
