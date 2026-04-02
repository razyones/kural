import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogFooter,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
} from "fumadocs-ui/components/dialog/search";
import type { SharedProps } from "fumadocs-ui/contexts/search";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { useDocsSearch } from "fumadocs-core/search/client";
import { searchDocs } from "@/lib/search";
import appCss from "@/styles/app.css?url";
import config from "../../docs.config";

export const Route = createRootRoute({
  component: RootComponent,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: config.name },
      { name: "description", content: config.description },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
});

function KuralSearchDialog(props: SharedProps) {
  const { search, setSearch, query } = useDocsSearch({
    client: { search: (q) => searchDocs({ data: q }) },
    delayMs: 300,
  });

  return (
    <SearchDialog {...props} search={search} onSearchChange={setSearch} isLoading={query.isLoading}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          {query.isLoading && (
            <div className="size-5 animate-spin rounded-full border-2 border-fd-muted-foreground border-t-transparent" />
          )}
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data === "empty" ? null : query.data} />
      </SearchDialogContent>
      <SearchDialogFooter />
    </SearchDialog>
  );
}

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col">
        <RootProvider search={{ SearchDialog: KuralSearchDialog }}>
          <Outlet />
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
