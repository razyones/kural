import { describe, expect, it } from "vite-plus/test";
import { MemoryRenderer } from "@poppinss/cliui";
import { renderFooter } from "./footer.ts";
import { ui } from "./log.ts";

describe("renderFooter", () => {
  it("renders glossary and next steps sections", () => {
    const renderer = new MemoryRenderer();
    ui.useRenderer(renderer);

    renderFooter(
      [{ term: "Self", definition: "fit under parent" }],
      [{ command: "kural score", description: "view scores" }],
    );

    const logs = renderer.getLogs().map((l) => l.message);
    const joined = logs.join("\n");

    expect(joined).toContain("Glossary:");
    expect(joined).toContain("Self");
    expect(joined).toContain("fit under parent");
    expect(joined).toContain("Next steps:");
    expect(joined).toContain("kural score");
    expect(joined).toContain("view scores");

    renderer.flushLogs();
  });

  it("renders multiple glossary entries", () => {
    const renderer = new MemoryRenderer();
    ui.useRenderer(renderer);

    renderFooter(
      [
        { term: "A", definition: "first" },
        { term: "B", definition: "second" },
      ],
      [{ command: "cmd", description: "desc" }],
    );

    const logs = renderer.getLogs().map((l) => l.message);
    const joined = logs.join("\n");

    expect(joined).toContain("A");
    expect(joined).toContain("first");
    expect(joined).toContain("B");
    expect(joined).toContain("second");

    renderer.flushLogs();
  });
});
