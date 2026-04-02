import { Link, createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { EmbeddingSpace } from "@/components/embedding-space";
import { AnimatedBg } from "@/components/animated-bg";
import config from "../../docs.config";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout nav={{ title: config.name }}>
      <div className="flex flex-1 min-h-0 max-h-[calc(100vh-var(--fd-nav-height,56px))] overflow-hidden relative">
        <AnimatedBg />
        {/* Left: Embedding space */}
        <div className="hidden md:flex md:w-1/2 border-r border-fd-border">
          <EmbeddingSpace />
        </div>

        {/* Right: Hero content */}
        <div className="flex-1 flex flex-col justify-center px-8 md:px-16 lg:px-24">
          <p
            className="text-[11px] uppercase tracking-[0.08em] mb-3"
            style={{ color: "hsl(187, 40%, 55%)" }}
          >
            Structural scoring for TypeScript
          </p>
          <h1
            className="text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tighter text-fd-foreground mb-5 leading-[1.05]"
            style={{ fontFamily: '"Lexend Peta", sans-serif' }}
          >
            KURAL
          </h1>
          <p className="text-fd-muted-foreground text-base md:text-lg max-w-md mb-8 font-light leading-relaxed">
            Answers &ldquo;where should this code live?&rdquo; — embeds, scores,
            audits, and places every unit in your codebase.
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
              href="https://github.com/user/kural"
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
