import { Link } from "@tanstack/react-router";
import { BlinkingOwl } from "@/components/nav-logo";

const OWL_FONT = '"IBM Plex Mono", monospace';
const DISPLAY_FONT = '"Lexend Peta", sans-serif';

export function NotFound() {
  const base = import.meta.env.BASE_URL ?? "/";

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="flex items-center gap-10">
        {/* Left: Owl */}
        <div className="text-[1.8rem] sm:text-[2.5rem]">
          <BlinkingOwl />
        </div>

        {/* Separator */}
        <div className="w-px self-stretch bg-fd-border" />

        {/* Right: Content */}
        <div className="flex flex-col gap-4">
          <span
            className="text-[4rem] sm:text-[5rem] font-semibold leading-none tracking-[-0.06em] text-fd-foreground/10"
            style={{ fontFamily: DISPLAY_FONT }}
          >
            404
          </span>

          <p
            className="text-sm tracking-wide text-fd-muted-foreground"
            style={{ fontFamily: OWL_FONT }}
          >
            node not found in the tree
          </p>

          <div className="flex items-center gap-3 mt-2">
            <Link
              to="/"
              className="px-5 py-2 bg-fd-primary text-fd-primary-foreground text-[11px] uppercase tracking-[0.05em] font-medium hover:opacity-90 transition-opacity"
            >
              Home
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: "" }}
              className="px-5 py-2 border border-fd-border text-fd-foreground text-[11px] uppercase tracking-[0.05em] font-medium hover:border-fd-primary/40 transition-colors"
            >
              Read Docs
            </Link>
          </div>

          <p
            className="text-[10px] text-fd-muted-foreground/50 tracking-wide mt-1"
            style={{ fontFamily: OWL_FONT }}
          >
            {base}??? &mdash; no score, no embedding, no placement
          </p>
        </div>
      </div>
    </div>
  );
}
