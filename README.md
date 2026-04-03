# Kural

Structural scoring system for TypeScript codebases — answers **"where should this code live?"**

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

## Install

```bash
npm install -g kural
```

## Quick start

### 1. Set up an embedding provider

```bash
export AI_GATEWAY_API_KEY=your-api-key
```

Supported providers: **Vercel** (default), **OpenAI**, **OpenRouter**, **Ollama** (local, no key required).

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
/** @kuralPure */
function cosineSimilarity(a: number[], b: number[]): number { ... }

/** @kuralCauses writes score rows to SQLite via TanStack DB */
async function writeScoreCards(collections, cards): Promise<void> { ... }
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

| Param | Purpose |
|---|---|
| `@kuralPure` | Marks functions with no side effects |
| `@kuralCauses <desc>` | Describes what a function does beyond its type signature |
| `@kuralUtil` | Excludes from domain scoring, scored in own sandbox |
| `@kuralHelper` | Participates in scoring, excluded from audits |
| `@kuralPatterns <group>` | Deduplicates siblings to a centroid representative |
| `@kuralCompanion <group>` | Groups structurally coupled units |
| `@kuralBound inward/outward` | Adjusts scoring for entry points and primary exports |
| `@kuralResidual <audit> [hash]` | Suppresses a specific audit finding |

## How it works

Kural is a five-stage pipeline:

1. **Parse** — Walk the filesystem, extract functions, types, and descriptions from the AST
2. **Embed** — Produce identity and leaf vectors via 7-facet embedding (name, description, path, signature, causes, calls, parent context)
3. **Score** — Compute fit, uniqueness, and subtree health for every node
4. **Store** — Persist units, scores, and metadata to a SQLite snapshot
5. **Query** — Read snapshots for scoring, auditing, and comparison

### Scoring metrics

Every node gets a score card:

- **Fit** — how well the node's content matches its parent's identity (-1...1)
- **Uniqueness** — mean distance to siblings (-1...1)
- **Score** — harmonic mean of fit and uniqueness
- **Children** — direct children quality (containers only)
- **Subtree** — recursive health of the entire subtree below (containers only)
- **Overall** — harmonic mean of self and subtree scores

## Tech stack

| Layer | Tool |
|---|---|
| CLI framework | [Gunshi](https://github.com/poppinss/gunshi) |
| AI | [Vercel AI SDK](https://sdk.vercel.ai/) via AI Gateway |
| Local persistence | [TanStack DB](https://tanstack.com/db) + SQLite |
| Runtime | Node.js, ESM |

## Typical workflow

1. **Describe** your codebase — JSDoc on files, functions, and types; KURAL.md in directories
2. **Annotate** structural realities — `@kuralPure`/`@kuralCauses` on functions, `@kuralUtil` on utilities
3. **Generate** a snapshot — `kural snapshot generate src`
4. **Score** the overall structure — `kural score`
5. **Audit** for specific issues — `kural audit`
6. **Fix** the flagged issues, regenerate to verify improvement
7. **Compare** before and after — `kural score -c <old-snapshot-id>`

## Documentation

Full documentation available at the [docs site](docs/):

- [Getting Started](docs/getting-started.mdx) — installation, codebase preparation, and first run
- [Architecture](docs/architecture.mdx) — pipeline, tiers, data model, and sync design
- [Embedding](docs/foundation/embedding.mdx) — 7-facet embedding with structural signals
- [Scoring](docs/pillars/scoring.md) — fit, uniqueness, and subtree health metrics
- [Audits](docs/pillars/audits.mdx) — 14 statistical checks for structural issues
- [Kural Params](docs/codebase-realities/kural-params.md) — annotations for codebase realities
- [Database](docs/db.md) — SQLite snapshot persistence and schema

## License

MIT
