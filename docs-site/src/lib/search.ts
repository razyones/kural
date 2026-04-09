import { createElement } from "react";
import { create, load, search } from "@orama/orama";
import { createContentHighlighter } from "fumadocs-core/search";
import { Sparkles } from "lucide-react";
import searchIndexRaw from "@/data/search-index.json?raw";

// Parse at runtime to bypass rolldown's JSON plugin recursion limit
// on the deeply nested Orama serialized database.
const searchIndex = JSON.parse(searchIndexRaw) as {
  pageMeta: Record<string, unknown>;
  rawData: unknown;
};

const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIM = 384;
const RESULT_LIMIT = 8;
const VECTOR_SIMILARITY = 0.5;
const TEXT_WEIGHT = 0.7;
const VECTOR_WEIGHT = 0.3;

type PageMeta = Record<string, { breadcrumbs?: string[]; title: string }>;

const pageMeta: PageMeta = searchIndex.pageMeta as PageMeta;

/** Restore pre-built Orama DB from serialized index — nearly instant. */
let db: Awaited<ReturnType<typeof create>> | null = null;
function getDB() {
  if (!db) {
    // eslint-disable-next-line no-async-promise-executor
    db = create({
      schema: {
        page_id: "string",
        type: "string",
        url: "string",
        content: "string",
        embedding: `vector[${EMBEDDING_DIM}]`,
      },
    }) as Awaited<ReturnType<typeof create>>;
    load(db, searchIndex.rawData as Parameters<typeof load>[1]);
  }
  return db;
}

/** Embedding model loading status — observable via subscribers. */
export type EmbedderStatus = "idle" | "loading" | "ready" | "error";
type StatusListener = (status: EmbedderStatus) => void;

let embedderStatus: EmbedderStatus = "idle";
const statusListeners = new Set<StatusListener>();

function setStatus(status: EmbedderStatus) {
  embedderStatus = status;
  for (const fn of statusListeners) fn(status);
}

export function getEmbedderStatus(): EmbedderStatus {
  return embedderStatus;
}

export function onEmbedderStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

/** Lazily load embedding model in the browser via Transformers.js. */
let embedderPromise: Promise<(text: string) => Promise<number[]>> | null = null;
function getEmbedder() {
  embedderPromise ??= (async () => {
    setStatus("loading");
    try {
      const { pipeline } = await import("@huggingface/transformers");
      const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL);
      setStatus("ready");
      return async (text: string) => {
        const output = await extractor(text, { pooling: "mean", normalize: true });
        return Array.from((output as { data: Float32Array }).data);
      };
    } catch {
      setStatus("error");
      throw new Error("Embedder failed to load");
    }
  })();
  return embedderPromise;
}

/** Preload the embedding model during idle time. */
export function preloadEmbedder(): void {
  getEmbedder();
}

/** Generation counter to skip stale embedding work. */
let searchGen = 0;

export async function searchDocs(query: string) {
  const gen = ++searchGen;
  const orama = getDB();
  const highlighter = createContentHighlighter(query);

  // Try hybrid search; fall back to fulltext if embedder not ready yet.
  let queryVector: number[] | null = null;
  try {
    const embedder = await Promise.race([
      getEmbedder(),
      new Promise<never>((_, reject) => {
        setTimeout(reject, 100);
      }),
    ]);
    // Skip embedding if a newer query has arrived
    if (gen === searchGen) {
      queryVector = await embedder(query);
    }
  } catch {
    // Embedder still loading — fulltext only this time
  }

  const results = queryVector
    ? await search(orama, {
        mode: "hybrid",
        term: query,
        vector: { value: queryVector, property: "embedding" },
        similarity: VECTOR_SIMILARITY,
        limit: RESULT_LIMIT,
        hybridWeights: { text: TEXT_WEIGHT, vector: VECTOR_WEIGHT },
      })
    : await search(orama, {
        term: query,
        tolerance: 1,
        limit: RESULT_LIMIT,
        boost: { content: 2 },
      });

  return results.hits.map((hit) => {
    const rawType = hit.document.type as "page" | "heading" | "text";
    const meta = pageMeta[hit.document.page_id as string];
    const highlighted = highlighter.highlightMarkdown(hit.document.content as string);
    const marks = [...highlighted.matchAll(/<mark>([^<]*)<\/mark>/g)].map((m) => m[1]);
    const MIN_KEYWORD_LEN = 4;
    const hasKeywordMatch = marks.some((m) => m.length >= MIN_KEYWORD_LEN);
    const isSemantic = queryVector !== null && !hasKeywordMatch;
    const baseCrumbs =
      rawType === "page"
        ? (meta?.breadcrumbs ?? [])
        : [...(meta?.breadcrumbs ?? []), meta?.title ?? ""];
    return {
      type: rawType === "heading" ? "text" : rawType,
      content: highlighted,
      breadcrumbs: isSemantic
        ? [
            ...baseCrumbs,
            createElement(
              "span",
              { className: "inline-flex items-center gap-0.5" },
              createElement(Sparkles, { className: "size-3" }),
              "semantic",
            ),
          ]
        : baseCrumbs,
      id: hit.id,
      url: hit.document.url as string,
    };
  });
}
