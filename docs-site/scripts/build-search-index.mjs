/**
 * Builds a pre-computed Orama search index with EmbeddingGemma vectors.
 *
 * Scans all markdown docs, extracts structured content (titles, headings,
 * content sections), computes 256-dim embeddings via EmbeddingGemma
 * (Transformers.js / ONNX), builds an Orama hybrid DB, and serializes
 * it to docs-site/src/data/search-index.json for instant client-side load.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { create, insert, save } from "@orama/orama";
import { pipeline } from "@huggingface/transformers";

const DOCS_SITE_ROOT = resolve(import.meta.dirname, "..");
const DOCS_DIR = join(DOCS_SITE_ROOT, "../docs");
const OUTPUT_PATH = join(DOCS_SITE_ROOT, "src/data/search-index.json");
const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIM = 384;
const JSON_INDENT = 2;
const MIN_CONTENT_LENGTH = 30;
const CONTENT_SLICE = 300;
const DESCRIPTION_SLICE = 500;

// ── Markdown helpers ──

function stripMarkdown(text) {
  return (
    text
      .replaceAll(/^import\s+.*$/gm, "")
      .replaceAll(/<[^>]+>/g, " ")
      .replaceAll(/```[\s\S]*?```/g, " ")
      // Tables: remove separator rows, convert content rows to readable text
      .replaceAll(/^\s*\|[\s:|-]+\|\s*$/gm, "")
      .replaceAll(
        /^\s*\|(.+)\|\s*$/gm,
        (_, cells) =>
          cells
            .split("|")
            .map((c) => c.trim())
            .filter(Boolean)
            .join(", ") + ". ",
      )
      // Block-level syntax
      .replaceAll(/^#{1,6}\s+/gm, "")
      .replaceAll(/^>\s?/gm, "")
      .replaceAll(/^-{3,}\s*$/gm, "")
      .replaceAll(/^(\s*)[-*]\s+/gm, "$1")
      .replaceAll(/^(\s*)\d+\.\s+/gm, "$1")
      // Inline syntax
      .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replaceAll(/\*{1,2}([^*]*)\*{1,2}/g, "$1")
      .replaceAll(/`([^`]*)`/g, "$1")
      .replaceAll(/\s+/g, " ")
      .trim()
  );
}

function slugify(text) {
  return text
    .toLowerCase()
    .replaceAll(/[^\w]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

function frontmatterTitle(file) {
  const src = readFileSync(file, "utf-8");
  const m = /^---\s*\n[\s\S]*?^title:\s*(.+)/m.exec(src);
  return m
    ? m[1].trim()
    : file
        .split("/")
        .pop()
        .replace(/\.mdx?$/, "");
}

// ── Scan docs ──

function scanDocs() {
  const pathMap = {};

  function buildPathMap(dir, urlPrefix) {
    const metaPath = join(dir, "meta.json");
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf-8")) : null;
    const order = meta?.pages ?? [];
    const seen = new Set();

    function addEntry(name) {
      if (seen.has(name)) {
        return;
      }
      seen.add(name);
      const full = join(dir, name);

      if (existsSync(full) && statSync(full).isDirectory()) {
        buildPathMap(full, `${urlPrefix}/${name}`);
        return;
      }

      for (const ext of [".mdx", ".md"]) {
        const filePath = join(dir, name + ext);
        if (existsSync(filePath)) {
          const rel = relative(DOCS_DIR, filePath);
          const slug = rel.replace(/\.mdx?$/, "").replace(/\/index$/, "");
          const key = slug === "index" ? "" : slug;
          pathMap[key] = rel;
          return;
        }
      }
    }

    for (const name of order) {
      addEntry(name);
    }
    for (const entry of readdirSync(dir)) {
      if (entry === "meta.json") {
        continue;
      }
      addEntry(entry.replace(/\.mdx?$/, ""));
    }
  }

  buildPathMap(DOCS_DIR, "");

  const entries = Object.entries(pathMap).map(([key, rel]) => {
    const filePath = join(DOCS_DIR, rel);
    const src = readFileSync(filePath, "utf-8");
    const fmMatch = /^---\s*\n([\s\S]*?)\n---/.exec(src);
    const fm = {};
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

    const headings = [];
    const contents = [];
    let currentHeading;
    let currentContent = "";

    for (const line of body.split("\n")) {
      const hMatch = /^##\s+(.+)/.exec(line);
      if (hMatch) {
        if (currentContent.trim()) {
          contents.push({
            heading: currentHeading,
            content: stripMarkdown(currentContent).slice(0, CONTENT_SLICE),
          });
        }
        const heading = stripMarkdown(hMatch[1].trim());
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
        content: stripMarkdown(currentContent).slice(0, DESCRIPTION_SLICE),
      });
    }

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

  return entries;
}

// ── Build index ──

async function main() {
  console.log("Scanning docs...");
  const entries = scanDocs();
  console.log(`Found ${entries.length} pages`);

  console.log(`Loading ${EMBEDDING_MODEL}...`);
  const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL);

  /** @param {string} text */
  async function embed(text) {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  }

  console.log("Creating Orama DB with vector schema...");
  const db = await create({
    schema: {
      page_id: "string",
      type: "string",
      url: "string",
      content: "string",
      embedding: `vector[${EMBEDDING_DIM}]`,
    },
  });

  const pageMeta = {};
  let docCount = 0;

  for (const entry of entries) {
    pageMeta[entry.url] = {
      breadcrumbs: entry.breadcrumbs,
      title: entry.title,
    };

    // Page entry
    const titleEmb = await embed(entry.title);
    await insert(db, {
      page_id: entry.url,
      type: "page",
      url: entry.url,
      content: entry.title,
      embedding: titleEmb,
    });
    docCount++;

    // Description entry
    if (entry.description) {
      const descEmb = await embed(entry.description);
      await insert(db, {
        page_id: entry.url,
        type: "text",
        url: entry.url,
        content: entry.description,
        embedding: descEmb,
      });
      docCount++;
    }

    // Heading entries
    for (const heading of entry.structuredData.headings) {
      const headingEmb = await embed(heading.content);
      await insert(db, {
        page_id: entry.url,
        type: "heading",
        url: `${entry.url}#${heading.id}`,
        content: heading.content,
        embedding: headingEmb,
      });
      docCount++;
    }

    // Content entries
    for (const section of entry.structuredData.contents) {
      if (!section.content || section.content.length < MIN_CONTENT_LENGTH) {
        continue;
      }
      const contentEmb = await embed(section.content);
      await insert(db, {
        page_id: entry.url,
        type: "text",
        url: section.heading ? `${entry.url}#${section.heading}` : entry.url,
        content: section.content,
        embedding: contentEmb,
      });
      docCount++;
    }

    process.stdout.write(`\r  Embedded ${docCount} documents...`);
  }
  console.log(`\n  Total: ${docCount} documents indexed`);

  console.log("Serializing index...");
  const rawData = save(db);

  const output = { rawData, pageMeta };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output));

  const sizeMB = (Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024).toFixed(2);
  console.log(`Wrote search index to ${OUTPUT_PATH} (${sizeMB} MB)`);
}

main().catch((err) => {
  console.error("Failed to build search index:", err);
  process.exit(1);
});
