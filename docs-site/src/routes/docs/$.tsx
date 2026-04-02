import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { createServerFn } from "@tanstack/react-start";
import { source } from "@/lib/source";
import browserCollections from "collections/browser";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { Suspense } from "react";
import { getMDXComponents } from "@/components/mdx";
import config from "../../../docs.config";

export const Route = createFileRoute("/docs/$")({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/") ?? [];
    const data = await getPageData({ data: slugs });
    await clientLoader.preload(data.path);
    return data;
  },
});

let cachedPageTree: Awaited<ReturnType<typeof source.serializePageTree>> | null = null;

async function getSerializedPageTree() {
  cachedPageTree ??= await source.serializePageTree(source.getPageTree());
  return cachedPageTree;
}

const getPageData = createServerFn({
  method: "GET",
})
  .inputValidator((slugs: string[]) => slugs)
  .middleware([staticFunctionMiddleware])
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) {throw notFound();}

    return {
      path: page.path,
      pageTree: await getSerializedPageTree(),
    };
  });

const mdxComponents = getMDXComponents();

const clientLoader = browserCollections.docs.createClientLoader({
  component({ frontmatter, default: MDX, toc }) {
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX components={mdxComponents} />
        </DocsBody>
      </DocsPage>
    );
  },
});

function Page() {
  const { pageTree, path } = useFumadocsLoader(Route.useLoaderData());

  return (
    <DocsLayout tree={pageTree} nav={{ title: config.name }} links={config.nav.links}>
      <Suspense>{clientLoader.useContent(path)}</Suspense>
    </DocsLayout>
  );
}
