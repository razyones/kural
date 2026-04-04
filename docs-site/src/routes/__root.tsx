import type { ComponentProps } from "react";
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
  SearchDialogListItem,
  SearchDialogOverlay,
} from "fumadocs-ui/components/dialog/search";
import type { SharedProps } from "fumadocs-ui/contexts/search";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import { useDocsSearch } from "fumadocs-core/search/client";
import { AnimatedBg } from "@/components/animated-bg";
import appCss from "@/styles/app.css?url";
import config from "../../docs.config";

/**
 * Suppress scrollIntoView when activation is triggered by pointer
 * (hover). Only keyboard navigation should auto-scroll.
 *
 * Global listeners set/clear a flag — no per-item event overrides
 * needed, so fumadocs' internal setActive (hover highlight) works
 * unmodified.
 */
let pointerActive = false;
if (typeof document !== "undefined") {
  document.addEventListener("pointermove", () => {
    pointerActive = true;
  });
  document.addEventListener("keydown", () => {
    pointerActive = false;
  });
}

function StableSearchItem(props: ComponentProps<typeof SearchDialogListItem>) {
  return (
    <SearchDialogListItem
      {...props}
      ref={(el) => {
        if (pointerActive) {
          return;
        }
        if (typeof props.ref === "function") {
          props.ref(el);
        }
      }}
    />
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: config.name },
      { name: "description", content: config.description },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,100..900;1,100..900&family=IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://api.fontshare.com/v2/css?f[]=ranade@300,400,500,600,700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Lexend+Peta:wght@600&text=KURAL&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
});

function KuralSearchDialog(props: SharedProps) {
  const base = import.meta.env.BASE_URL ?? "/";
  const { search, setSearch, query } = useDocsSearch({
    client: {
      search: async (query: string) => {
        const { searchDocs } = await import("@/lib/search");
        return searchDocs(query);
      },
    },
    delayMs: 300,
  });

  return (
    <SearchDialog {...props} search={search} onSearchChange={setSearch} isLoading={query.isLoading}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList
          items={query.isLoading || query.data === "empty" ? null : query.data}
          Item={StableSearchItem}
        />
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
        <AnimatedBg intensity={0.55} />
        <RootProvider search={{ SearchDialog: KuralSearchDialog }}>
          <Outlet />
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
