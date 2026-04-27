declare module "virtual:docs-data" {
  import type { SerializedPageTree } from "fumadocs-core/source/client";

  export const pathMap: Record<string, string>;
  export const pageMeta: Record<string, { title: string; description: string }>;
  export const pageTree: SerializedPageTree;
  export const searchEntries: Array<{
    title: string;
    description: string;
    url: string;
    breadcrumbs?: string[];
    structuredData: {
      headings: Array<{ id: string; content: string }>;
      contents: Array<{ heading?: string; content: string }>;
    };
  }>;
}
