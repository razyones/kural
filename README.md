# Kural (A Necessity for Agentic Coding)

```
    {\_/}  │
    (O,O)  │  "Round eyes.
    (:::)  │   Sharp placement."
    -^-^v--│
           └──────────────────────────────────────
```

Structural discipline for codebases — answers **"where should this code live?"**

> **Early stage project** — Kural is under active development and evolving rapidly. Check out [Projects](../../projects) for the roadmap ahead. We welcome feedback, ideas, and contributions — reach out at **hello@razyones.com** to collaborate or share your thoughts.

Kural embeds every type, function, file, and directory into vector space, measures how well the codebase is distributed in that space, and surfaces specific, actionable structural issues.

```
        ┌─────────────────────┐
        │        PLACE        │  Roof: the payoff
        ├──────────┬──────────┤
        │  SCORE   │  AUDIT   │  Pillars: cross-validate each other
        ├──────────┴──────────┤
        │        EMBED        │  Foundation: everything rests on this
        └─────────────────────┘
```

## Why this matters

AI coding agents write code. They add functions, create files, move things around. But they have no idea whether the code they just wrote landed in the right place. They can't see that the function they added to `utils/` is semantically identical to one in `core/`, or that the file they created in `commands/` drifts toward the analysis engine's vocabulary.

Kural gives your codebase a structural map. **Kural skills teach your AI assistant the structural discipline** — the same role a type system plays for a typed-language agent. Without a type checker, an agent writes code that runs but breaks contracts. Without structural discipline, an agent writes code that works but rots the codebase.

With skills, the agent knows the four-phase resolution pipeline, understands why descriptions carry 50% weight in the identity vector, and works through audit findings methodically — fixing docs before restructuring, restructuring before suppressing. Brief is its pre-flight check; audit is its post-flight check.

This is the difference between an agent that writes code and an agent that writes code **in the right place**.

<Callout type="warn">
  An AI agent without structural discipline will accumulate architectural debt faster than a human
  developer — it produces more code per hour but has zero intuition about where that code belongs.
  Kural skills are the discipline layer.
</Callout>

## Install

```bash
npm install -g kural
```

## Quick start

### 1. Set up an embedding provider

```bash
export AI_GATEWAY_API_KEY=your-api-key
```

Supported providers: **Vercel** (default), **OpenAI**, **OpenRouter**, **Ollama** (local, no key required). Even local models like Qwen3 Embedding 4B via Ollama perform very well. **Gemini Embedding 2** is the recommended model.

### 2. Prepare your codebase

> Descriptions carry **50% weight** in the identity vector. This is the most impactful step.

Add JSDoc comments to files, functions, and types. Add `KURAL.md` files to directories.

```ts
/**
 * The gateway. Crosses the network boundary to turn text into vectors
 * via an external AI service. It is the only module that speaks the
 * AI SDK protocol — no other part of the system calls embedding APIs
 * directly.
 */
```

Annotate functions with `@kuralPure` (no side effects) or `@kuralCauses` (describes side effects):

```ts
/**
 * Computes cosine similarity between two vectors.
 * Wraps DruidJS cosine distance: cos(acos(similarity)) recovers similarity.
 * Returns 0 if either vector is empty.
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity in range [-1, 1]
 * @kuralPure
 */
function cosineSimilarity(a: number[], b: number[]): number {
  /* ... */
}

/**
 * Persists computed health metrics so downstream commands can query scores
 * without re-running the pipeline.
 * @param collections - Snapshot collections to write into
 * @param cards - Computed score cards to persist
 * @returns Resolves when score card rows are persisted
 * @kuralCauses persists score card rows to the snapshot database
 */
async function writeScoreCards(
  collections: SnapshotCollections,
  cards: ScoreCard[],
): Promise<void> {
  /* ... */
}
```

See the [description principles](docs/getting-started.mdx#description-principles) and [Kural Params](docs/codebase-realities/kural-params.md) for full guidance.

### 3. Generate a snapshot

```bash
kural snapshot generate src
```

Walks `src/`, extracts types and functions from the AST, embeds them using 7 structural facets, computes scores, and stores everything in `.kural-db/`.

### 4. View scores

```bash
kural score
```

### 5. Run audits

```bash
kural audit
```

14 statistical audits surface outliers, duplicates, containment problems, and more.

## Commands

```
kural snapshot generate <path>     Parse, embed, and score a codebase
kural score                        Display structural scores
kural audit                        Run structural audits

kural snapshot list                List all history snapshots
kural snapshot pin <id> <name>     Pin a snapshot (prevents eviction)
kural snapshot unpin <id>          Remove a pin
kural snapshot delete <id>         Delete a snapshot
```

### Score options

```
-p, --path <path>         Score a specific node or subtree
-e, --explain             Show detailed breakdown table
-c, --compare <id>        Compare against a previous snapshot
-l, --limit <n>           Max rows in breakdown (default 20, 0 for all)
--json                    Output as JSON
```

### Audit options

```
-k, --sensitivity <n>     Standard deviations from mean to flag (default 2.0)
-f, --filter <categories> Comma-separated audit categories to show
-d, --disable <names>     Comma-separated audit names to skip
-e, --expand              Show all findings (no truncation)
--json                    Output as JSON
```

### Generate options

```
-p, --provider <name>     Embedding provider (vercel, openai, openrouter, ollama)
-m, --model <id>          Model ID override
-k, --apiKey <key>        API key (defaults to AI_GATEWAY_API_KEY env var)
--pin <name>              Pin the snapshot after generation
--json                    Output as JSON
```

## Configuration

Create `kural.config.json` in your project root:

```json
{
  "embeddings": {
    "provider": "vercel"
  },
  "domainKeywords": ["scoring", "embedding", "audit"],
  "dictionary": {
    "SOST": "structural scoring tree"
  },
  "audits": {
    "sensitivity": 2.0,
    "disable": ["incomplete-docs"]
  }
}
```

## Kural Params

JSDoc annotations that declare structural realities the vector space can't capture alone:

| Param                           | Purpose                                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `@kuralPure`                    | Marks functions with no side effects                            |
| `@kuralCauses <desc>`           | Describes what a function does beyond its type signature        |
| `@kuralUtil`                    | Excludes from domain scoring, scored in own sandbox             |
| `@kuralHelper`                  | Participates in scoring, excluded from audits except duplicates |
| `@kuralPatterns <group>`        | Deduplicates siblings to a centroid representative              |
| `@kuralCompanion <group>`       | Groups structurally coupled units                               |
| `@kuralBound inward/outward`    | Adjusts scoring for entry points and primary exports            |
| `@kuralResidual <audit> [hash]` | Suppresses a specific audit finding                             |

## How it works

Kural is a five-stage pipeline:

1. **Parse** — Walk the filesystem, extract functions, types, and descriptions from the AST
2. **Embed** — Produce identity and leaf vectors via 7-facet embedding (name, description, path, signature, causes, calls, parent context)
3. **Score** — Compute fit, uniqueness, and subtree health for every node
4. **Store** — Persist units, scores, and metadata to a SQLite snapshot
5. **Query** — Read snapshots for scoring, auditing, and comparison

### Scoring metrics

Every node gets a score card:

- **Fit** — how well the node's content matches its parent's identity (raw cosine, -1...1)
- **Uniqueness** — mean distance to siblings (0...2)
- **Score** — harmonic mean of normalized fit and uniqueness (0...1)
- **Children** — direct children quality, containers only (0...1)
- **Subtree** — recursive health of the entire subtree below, containers only (0...1)
- **Overall** — harmonic mean of self and subtree scores (0...1)

## Tech stack

| Layer             | Tool                                                    |
| ----------------- | ------------------------------------------------------- |
| CLI framework     | [Gunshi](https://github.com/poppinss/gunshi)            |
| AI                | Multiple providers (Vercel, OpenAI, OpenRouter, Ollama) |
| Local persistence | [TanStack DB](https://tanstack.com/db) + SQLite         |
| Runtime           | Node.js, ESM                                            |

## Typical workflow

1. **Describe** your codebase — JSDoc on files, functions, and types; KURAL.md in directories
2. **Annotate** structural realities — `@kuralPure`/`@kuralCauses` on functions, `@kuralUtil` on utilities
3. **Generate** a snapshot — `kural snapshot generate src`
4. **Score** the overall structure — `kural score`
5. **Audit** for specific issues — `kural audit`
6. **Fix** the flagged issues, regenerate to verify improvement
7. **Compare** before and after — `kural score -c <old-snapshot-id>`

## Documentation

- [Stable docs](https://razyones.github.io/kural/) — latest release (`main`)
- [Alpha docs](https://razyones.github.io/kural/alpha/) — preview of upcoming changes (`alpha`)

### Topics

- [Getting Started](docs/getting-started.mdx) — installation, codebase preparation, and first run
- [Architecture](docs/architecture.mdx) — pipeline, tiers, data model, and sync design
- [Embedding](docs/foundation/embedding.mdx) — 7-facet embedding with structural signals
- [Scoring](docs/pillars/scoring.md) — fit, uniqueness, and subtree health metrics
- [Audits](docs/pillars/audits.mdx) — 14 statistical checks for structural issues
- [Kural Params](docs/codebase-realities/kural-params.md) — annotations for codebase realities
- [Database](docs/db.md) — SQLite snapshot persistence and schema

## Acknowledgments

Kural is built on the shoulders of these open-source projects:

**Core**

- [Gunshi](https://github.com/kazupon/gunshi) — CLI framework
- [AI SDK](https://github.com/vercel/ai) — embedding provider gateway
- [TanStack DB](https://github.com/TanStack/db) — reactive persistence layer
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite driver
- [Zod](https://github.com/colinhacks/zod) — schema validation
- [DruidJS](https://github.com/saehm/DruidJS) — dimensionality reduction and vector math
- [Poppinss CLI UI](https://github.com/poppinss/cliui) — terminal formatting
- [TypeScript](https://github.com/microsoft/TypeScript) — language service for AST parsing

**Toolchain**

- [Vite+](https://github.com/nicepkg/vite-plus) — unified dev, build, lint, test, and format
- [Vitest](https://github.com/vitest-dev/vitest) — test runner
- [Oxlint](https://github.com/nicepkg/oxlint) — linter
- [tsdown](https://github.com/nicepkg/tsdown) — library bundler

**Documentation site**

- [Fumadocs](https://github.com/fuma-nama/fumadocs) — documentation framework
- [TanStack Start](https://github.com/TanStack/router) — full-stack React framework
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) — styling
- [Orama](https://github.com/oramasearch/orama) — client-side search
- [KaTeX](https://github.com/KaTeX/KaTeX) — math rendering
- [Lucide](https://github.com/lucide-icons/lucide) — icons

Thank you to every maintainer and contributor behind these projects.

## License

Apache 2.0 — see [LICENSE](LICENSE) for details.
