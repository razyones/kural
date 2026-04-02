import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";
import { createServerFn } from "@tanstack/react-start";

const searchAPI = createFromSource(source);

export const searchDocs = createServerFn({ method: "GET" })
  .inputValidator((query: string) => query)
  .handler(async ({ data: query }) => {
    return searchAPI.search(query);
  });
