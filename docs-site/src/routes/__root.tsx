import { type ComponentProps, useEffect, useRef, useState } from "react";
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
import { Loader2, Sparkles } from "lucide-react";
import type { EmbedderStatus } from "@/lib/search";
import { AnimatedBg } from "@/components/animated-bg";
import { NotFound } from "@/components/not-found";
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
  notFoundComponent: NotFound,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: config.name },
      { name: "description", content: config.description },
      { property: "og:image", content: "/social-preview.png" },
      { property: "og:image:width", content: "1280" },
      { property: "og:image:height", content: "640" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/social-preview.png" },
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
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", href: "/owl.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/owl-180.png" },
    ],
  }),
});

function useEmbedderStatus(): EmbedderStatus {
  const [status, setStatus] = useState<EmbedderStatus>("idle");
  useEffect(() => {
    let mounted = true;
    import("@/lib/search").then((m) => {
      if (!mounted) return;
      setStatus(m.getEmbedderStatus());
      return m.onEmbedderStatus((s) => {
        if (mounted) setStatus(s);
      });
    });
    return () => {
      mounted = false;
    };
  }, []);
  return status;
}

const STATUS_LABEL: Record<EmbedderStatus, string> = {
  idle: "",
  loading: "Loading semantic model…",
  ready: "Semantic search active",
  error: "Semantic search unavailable",
};

function KuralSearchDialog(props: SharedProps) {
  const base = import.meta.env.BASE_URL ?? "/";
  const lastQuery = useRef("");
  const { search, setSearch, query } = useDocsSearch({
    client: {
      search: async (q: string) => {
        const { searchDocs } = await import("@/lib/search");
        const results = await searchDocs(q);
        lastQuery.current = q;
        return results;
      },
    },
    delayMs: 300,
  });
  const embedderStatus = useEmbedderStatus();

  const isSearching = search.length > 0 && (query.isLoading || search !== lastQuery.current);

  return (
    <SearchDialog {...props} search={search} onSearchChange={setSearch} isLoading={isSearching}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          {isSearching && <Loader2 className="size-4 animate-spin text-fd-muted-foreground" />}
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList
          items={isSearching || query.data === "empty" ? null : query.data}
          Item={StableSearchItem}
        />
        <SearchDialogFooter className="py-1.5 px-3">
          {embedderStatus !== "idle" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-fd-muted-foreground">
              {embedderStatus === "loading" && <Loader2 className="size-3 animate-spin" />}
              {embedderStatus === "ready" && <Sparkles className="size-3" />}
              {STATUS_LABEL[embedderStatus]}
            </span>
          )}
        </SearchDialogFooter>
      </SearchDialogContent>
    </SearchDialog>
  );
}

function useIdlePreload() {
  if (typeof window !== "undefined") {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1));
    idle(async () =>
      import("@/lib/search").then((m) => {
        m.preloadEmbedder();
      }),
    );
  }
}

function RootComponent() {
  useIdlePreload();
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
