import { useEffect, useState } from "react";

const OWL_FONT = '"IBM Plex Mono", monospace';

export function BlinkingOwl({ className }: { className?: string }) {
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    const schedule = () => {
      const delay = 2000 + Math.random() * 2000;
      return setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 150);
        id = schedule();
      }, delay);
    };
    let id = schedule();
    return () => clearTimeout(id);
  }, []);

  const eyes = blink ? "(-,-)" : "(O,O)";
  return (
    <pre
      className={`m-0 leading-normal select-none text-[hsl(45,70%,38%)] dark:text-[hsl(45,60%,60%)] ${className ?? ""}`}
      aria-hidden="true"
      style={{ fontFamily: OWL_FONT, fontWeight: 600, letterSpacing: "-0.01em" }}
    >
      {"{\\_/}\n" + eyes + "\n(:::)\n-^-^v--"}
    </pre>
  );
}

export function NavLogo() {
  return (
    <span className="flex items-center gap-2">
      <BlinkingOwl className="text-[6px]" />
      <span
        className="text-base font-semibold tracking-tight text-fd-foreground"
        style={{ fontFamily: '"Lexend Peta", sans-serif' }}
      >
        KURAL
      </span>
    </span>
  );
}
