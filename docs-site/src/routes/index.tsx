import { Link, createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { BlinkingOwl, NavLogo } from "@/components/nav-logo";
import { EmbeddingSpace } from "@/components/embedding-space";
import { AnimatedBg } from "@/components/animated-bg";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout nav={{ title: <NavLogo /> }}>
      <div className="flex flex-1 min-h-0 max-h-[calc(100vh-var(--fd-nav-height,56px))] overflow-hidden relative w-full mx-auto max-w-[var(--fd-layout-width)]">
        <AnimatedBg />
        {/* Left: Embedding space */}
        <div className="hidden md:flex md:w-1/2 border-r border-fd-border">
          <EmbeddingSpace />
        </div>

        {/* Right: Hero content */}
        <div className="flex-1 flex flex-col justify-center px-8 md:px-16 lg:px-24">
          <Link
            to="/docs/$"
            params={{ _splat: "ai-editors" }}
            className="group inline-flex items-center gap-3 w-fit mb-6 px-1.5 py-1.5 pr-4 rounded-full border border-fd-border/60 bg-fd-muted/40 backdrop-blur-sm hover:border-fd-primary/40 transition-all duration-300"
          >
            <span className="px-2.5 py-1 rounded-full bg-fd-primary/15 text-fd-primary text-[10px] uppercase tracking-[0.08em] font-semibold">
              New
            </span>
            <span className="text-[13px] text-fd-foreground font-semibold group-hover:text-fd-foreground transition-colors duration-300 inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-fd-primary inline" />
              <span className="text-fd-primary">A Necessity</span> for Agentic Coding
            </span>
            <svg
              className="w-3.5 h-3.5 text-fd-muted-foreground group-hover:text-fd-primary group-hover:translate-x-0.5 transition-all duration-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <p className="text-[11px] uppercase tracking-[0.08em] mb-3 text-[hsl(187,50%,35%)] dark:text-[hsl(187,40%,55%)]">
            Structural scoring for TypeScript
          </p>
          <h1
            className="flex items-center gap-4 text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tighter text-fd-foreground mb-5 leading-[1.05]"
            style={{ fontFamily: '"Lexend Peta", sans-serif' }}
          >
            <BlinkingOwl className="text-xs md:text-sm" />
            KURAL
          </h1>
          <p className="text-fd-muted-foreground text-base md:text-lg max-w-md mb-8 font-light leading-relaxed">
            Answers &ldquo;where should this code live?&rdquo; — embeds, scores, audits, and places
            every unit in your codebase.
          </p>
          <div className="flex items-center gap-4">
            <Link
              to="/docs/$"
              params={{ _splat: "" }}
              className="px-5 py-2 bg-fd-primary text-fd-primary-foreground text-[11px] uppercase tracking-[0.05em] font-medium"
            >
              Read Docs
            </Link>
            <a
              href="https://github.com/razyones/kural"
              className="px-5 py-2 border border-fd-border text-fd-foreground text-[11px] uppercase tracking-[0.05em] font-medium"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </HomeLayout>
  );
}
