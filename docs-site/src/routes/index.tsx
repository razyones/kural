import { Link, createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import { BlinkingOwl, NavLogo } from "@/components/nav-logo";
import { EmbeddingSpace } from "@/components/embedding-space";
import { AgentSprite } from "@/components/agent-icons";
import { AnimatedBg } from "@/components/animated-bg";
import { ChevronRight, Sparkles } from "lucide-react";

const AGENTS: Array<{ name: string; icon: string }> = [
  { name: "Claude Code", icon: "claude-code" },
  { name: "Cursor", icon: "cursor" },
  { name: "Windsurf", icon: "windsurf" },
  { name: "Codex", icon: "codex" },
  { name: "Gemini CLI", icon: "gemini" },
  { name: "GitHub Copilot", icon: "github-copilot" },
  { name: "Cline", icon: "cline" },
  { name: "Amp", icon: "amp" },
  { name: "Roo Code", icon: "roo" },
  { name: "Kilo Code", icon: "kilo" },
  { name: "Goose", icon: "goose" },
  { name: "OpenCode", icon: "opencode" },
  { name: "Trae", icon: "trae" },
  { name: "Kiro CLI", icon: "kiro-cli" },
  { name: "Junie", icon: "junie" },
  { name: "Zencoder", icon: "zencoder" },
  { name: "Qwen Code", icon: "qwen-code" },
];

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout nav={{ title: <NavLogo /> }}>
      <div className="flex flex-1 min-h-0 max-h-[calc(100vh-var(--fd-nav-height,56px))] overflow-hidden relative w-full mx-auto max-w-[var(--fd-layout-width)]">
        <AnimatedBg />
        <AgentSprite />
        {/* Left: Embedding space */}
        <div className="hidden lg:flex lg:w-1/2 border-r border-fd-border">
          <EmbeddingSpace />
        </div>

        {/* Right: Hero content */}
        <div className="flex-1 flex flex-col px-5 sm:px-8 md:px-16 lg:px-10 xl:px-24 overflow-y-auto lg:overflow-hidden lg:justify-center">
          <div className="mt-[12vh] pb-10 lg:mt-0 lg:pb-0">
            <Link
              to="/docs/$"
              params={{ _splat: "ai-editors" }}
              className="group inline-flex items-center gap-3 w-fit mb-6 px-1.5 py-1.5 pr-4 rounded-full border border-fd-border/60 bg-fd-muted/40 backdrop-blur-sm hover:border-fd-primary/40 transition-all duration-300"
            >
              <span className="px-2.5 py-1 rounded-full bg-fd-primary/15 text-fd-primary text-[10px] uppercase tracking-[0.08em] font-semibold">
                New
              </span>
              <span className="text-[13px] text-fd-foreground group-hover:text-fd-foreground transition-colors duration-300 inline-flex items-center gap-1.5">
                A Necessity for{" "}
                <svg
                  className="w-3.5 h-3.5 inline"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="url(#shimmer-grad)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <defs>
                    <linearGradient id="shimmer-grad" x1="0%" y1="0%" x2="200%" y2="0%">
                      <stop offset="0%" stopColor="hsl(280, 60%, 65%)">
                        <animate
                          attributeName="stop-color"
                          values="hsl(280,60%,65%);hsl(330,70%,60%);hsl(30,80%,60%);hsl(187,60%,50%);hsl(230,60%,65%);hsl(280,60%,65%)"
                          dur="4s"
                          repeatCount="indefinite"
                        />
                      </stop>
                      <stop offset="50%" stopColor="hsl(30, 80%, 60%)">
                        <animate
                          attributeName="stop-color"
                          values="hsl(30,80%,60%);hsl(187,60%,50%);hsl(230,60%,65%);hsl(280,60%,65%);hsl(330,70%,60%);hsl(30,80%,60%)"
                          dur="4s"
                          repeatCount="indefinite"
                        />
                      </stop>
                      <stop offset="100%" stopColor="hsl(230, 60%, 65%)">
                        <animate
                          attributeName="stop-color"
                          values="hsl(230,60%,65%);hsl(280,60%,65%);hsl(330,70%,60%);hsl(30,80%,60%);hsl(187,60%,50%);hsl(230,60%,65%)"
                          dur="4s"
                          repeatCount="indefinite"
                        />
                      </stop>
                    </linearGradient>
                  </defs>
                  <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
                  <path d="M20 2v4" />
                  <path d="M22 4h-4" />
                  <circle cx="4" cy="20" r="2" />
                </svg>
                <span className="font-semibold text-shimmer -ml-1">Agentic Coding</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-fd-muted-foreground group-hover:text-fd-primary group-hover:translate-x-0.5 transition-all duration-300" />
            </Link>
            <p className="text-[11px] uppercase tracking-[0.08em] mb-3 text-[hsl(187,50%,35%)] dark:text-[hsl(187,40%,55%)]">
              Structural discipline for codebases
            </p>
            <h1
              className="flex items-center gap-4 text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tighter text-fd-foreground mb-5 leading-[1.05]"
              style={{ fontFamily: '"Lexend Peta", sans-serif' }}
            >
              <BlinkingOwl className="text-xs md:text-sm" />
              KURAL
            </h1>
            <p className="text-fd-muted-foreground text-base md:text-lg max-w-full sm:max-w-md mb-8 font-light leading-relaxed">
              Answers &ldquo;where should this code live?&rdquo; — embeds, scores, audits, and
              places every unit in your codebase.
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

            {/* Agent banner */}
            <div className="mt-12 md:mt-20 max-w-full sm:max-w-md">
              <p className="text-[10px] uppercase tracking-[0.08em] mb-3 text-fd-muted-foreground/50 font-medium">
                Available for these agents:
              </p>
              <div
                className="overflow-hidden"
                style={{
                  maskImage:
                    "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
                }}
              >
                <div
                  className="flex items-end gap-8 w-max text-fd-muted-foreground/70 hover:[animation-play-state:paused]"
                  style={{ animation: "marquee 35s linear infinite" }}
                >
                  {[...AGENTS, ...AGENTS].map(({ name, icon }, i) => (
                    <div key={`${icon}-${i}`} className="flex flex-col items-center gap-1 shrink-0">
                      <svg className="w-11 h-11" aria-label={name}>
                        <use href={`#agent-${icon}`} />
                      </svg>
                      <span className="text-[9px] whitespace-nowrap uppercase tracking-[0.06em] font-medium">
                        {name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </HomeLayout>
  );
}
