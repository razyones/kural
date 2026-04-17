<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, but it invokes Vite through `vp dev` and `vp build`.

## Vite+ Workflow

`vp` is a global binary that handles the full development lifecycle. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

### Start

- create - Create a new project from a template
- migrate - Migrate an existing project to Vite+
- config - Configure hooks and agent integration
- staged - Run linters on staged files
- install (`i`) - Install dependencies
- env - Manage Node.js versions

### Develop

- dev - Run the development server
- check - Run format, lint, and TypeScript type checks
- lint - Lint code
- fmt - Format code
- test - Run tests

### Execute

- run - Run monorepo tasks
- exec - Execute a command from local `node_modules/.bin`
- dlx - Execute a package binary without installing it as a dependency
- cache - Manage the task cache

### Build

- build - Build for production
- pack - Build libraries
- preview - Preview production build

### Manage Dependencies

Vite+ automatically detects and wraps the underlying package manager such as pnpm, npm, or Yarn through the `packageManager` field in `package.json` or package manager-specific lockfiles.

- add - Add packages to dependencies
- remove (`rm`, `un`, `uninstall`) - Remove packages from dependencies
- update (`up`) - Update packages to latest versions
- dedupe - Deduplicate dependencies
- outdated - Check for outdated packages
- list (`ls`) - List installed packages
- why (`explain`) - Show why a package is installed
- info (`view`, `show`) - View package information from the registry
- link (`ln`) / unlink - Manage local package links
- pm - Forward a command to the package manager

### Maintain

- upgrade - Update `vp` itself to the latest version

These commands map to their corresponding tools. For example, `vp dev --port 3000` runs Vite's dev server and works the same as Vite. `vp test` runs JavaScript tests through the bundled Vitest. The version of all tools can be checked using `vp --version`. This is useful when researching documentation, features, and bugs.

## Common Pitfalls

- **Using the package manager directly:** Do not use pnpm, npm, or Yarn directly. Vite+ can handle all package manager operations.
- **Always use Vite commands to run tools:** Don't attempt to run `vp vitest` or `vp oxlint`. They do not exist. Use `vp test` and `vp lint` instead.
- **Running scripts:** Vite+ built-in commands (`vp dev`, `vp build`, `vp test`, etc.) always run the Vite+ built-in tool, not any `package.json` script of the same name. To run a custom script that shares a name with a built-in command, use `vp run <script>`. For example, if you have a custom `dev` script that runs multiple services concurrently, run it with `vp run dev`, not `vp dev` (which always starts Vite's dev server).
- **Do not install Vitest, Oxlint, Oxfmt, or tsdown directly:** Vite+ wraps these tools. They must not be installed directly. You cannot upgrade these tools by installing their latest versions. Always use Vite+ commands.
- **Use Vite+ wrappers for one-off binaries:** Use `vp dlx` instead of package-manager-specific `dlx`/`npx` commands.
- **Import JavaScript modules from `vite-plus`:** Instead of importing from `vite` or `vitest`, all modules should be imported from the project's `vite-plus` dependency. For example, `import { defineConfig } from 'vite-plus';` or `import { expect, test, vi } from 'vite-plus/test';`. You must not install `vitest` to import test utilities.
- **Type-Aware Linting:** There is no need to install `oxlint-tsgolint`, `vp lint --type-aware` works out of the box.

## CI Integration

For GitHub Actions, consider using [`voidzero-dev/setup-vp`](https://github.com/voidzero-dev/setup-vp) to replace separate `actions/setup-node`, package-manager setup, cache, and install steps with a single action.

```yaml
- uses: voidzero-dev/setup-vp@v1
  with:
    cache: true
- run: vp check
- run: vp test
```

## Review Checklist for Agents

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to validate changes.
<!--VITE PLUS END-->

# Project: kural

Structural scoring system for TypeScript codebases — answers "where should this code live?"

## Architecture

- **Type:** Node.js CLI application (not a web app)
- **CLI framework:** Gunshi (`gunshi`) — access API docs in `node_modules/@gunshi/docs/src/**/*.md`
- **AI:** Vercel AI SDK (`ai`) via AI Gateway (`https://ai-gateway.vercel.sh`)
- **Runtime:** Node.js, ESM (`"type": "module"`)

## Project Structure

```
src/
  cli.ts              # Entry point — gunshi router
  commands/
    main.ts           # Root command definition
```

## Description Principles

Every unit's description — directory KURAL.md, file-level JSDoc, function JSDoc, and type JSDoc — is embedded and carries **50% weight** in the identity vector. Description quality directly affects scoring accuracy. The same principles apply at every level.

### Principles for writing descriptions

1. **Describe what only THIS unit does, in its own vocabulary.** Use exclusivity language: "It is the only module that...", "Nothing else in the system...". This creates semantic separation between siblings.
2. **Never borrow sibling or cousin module vocabulary.** Naming other modules' concepts (e.g., "embedding providers" in config, "parse-embed-store pipeline" in a command) pulls the description toward those modules in embedding space. Use abstract terms instead: "provider selection", "the engine". The vocabulary bleed audit catches this automatically.
3. **Describe the role in the system, not a generic job.** "Persists and retrieves all application state in a local database" is better than "SQLite database schema and operations" — the former says what makes it unique here, the latter describes any database module anywhere. For functions: "Persists computed health metrics so downstream commands can query scores without re-running the pipeline" is better than "Writes score cards to the snapshot."
4. **For folder-level descriptions, combine children's identities.** A parent folder's KURAL.md should describe the shared boundary its children own, not repeat their individual descriptions. Example: "Turns source files into numerical vectors" combines parse and embed's roles.

## Kural Params

| Param                         | Role in scoring                                                 |
| :---------------------------- | :-------------------------------------------------------------- |
| `@kuralHelper`                | Participates in scoring, excluded from audits except duplicates |
| `@kuralUtil`                  | Excluded from domain scoring, scored in own sandbox             |
| `@kuralPatterns`              | Deduplicated to centroid representative                         |
| `@kuralCompanion`             | Deduplicated to centroid representative                         |
| `@kuralResidual`              | No role in scoring, audit suppression only                      |
| `@kuralBound inward/outward`  | Adjusted scoring + selective audit suppression                  |
| `@kuralBorrows target "role"` | Instruction prefix for name/desc embedding + audit exclusion    |
| `@kuralPure` / `@kuralCauses` | Influences what gets embedded, not how scores compute           |

## `@kuralBorrows` — Cross-Layer Vocabulary Borrowing

A KURAL.md directive for directories that intentionally share vocabulary with a non-sibling module (e.g., a shell command that presents an analysis engine's output).

### Format

```markdown
Parses directory targets and display flags...
@kuralBorrows analysis/advise "terminal surface that formats and renders engine output as diagrams and tables"
```

- **Target path** (optional): relative path like `analysis/advise` — excludes that module from the vocabulary bleed audit's cross-pull comparison.
- **Quoted role** (required): natural-language description of the borrower's role — used as an instruction prefix when embedding the directory's name and description.

### How it works

1. **Embedding pipeline**: The role text is prepended to both the name and description before embedding. Instead of embedding `"advise"`, the system embeds `"terminal surface that formats and renders engine output as diagrams and tables: advise"`. This contextualizes shared vocabulary through the attention mechanism — "advise" in a display context encodes differently from "advise" in a computation context.
2. **Vocabulary bleed audit**: If a target path is declared, the audit skips that module when computing cross-pulls, since the overlap is intentional.

### Principles for writing the role text

The role text follows the same description principles as KURAL.md:

1. **Describe the borrower's role, not the target's domain.** "terminal surface that formats and renders engine output as diagrams and tables" describes what the shell module does. "presentation layer for the directory advice engine" names the analysis module's domain, which pulls embeddings toward it.
2. **Describe the role in this system, not a generic job.** "formats and renders engine output as diagrams and tables" is specific to this module. "renders output" is generic and provides weak separation.
3. **Never use the target module's vocabulary.** The same rule as descriptions — borrowed terms in the role text increase cross-pull instead of reducing it.

## Build & Run

- `vp pack` — builds CLI to `dist/cli.mjs` (tsdown, ESM, Node platform)
- `node dist/cli.mjs` — run the built CLI
- `vp check` — format, lint, type check
- `vp test` — run tests (vitest, import from `vite-plus/test`)
- `vp run docs:dev` — run docs site dev server (extracts embeddings, builds search index, starts Vite)

## Conventions

- Define commands using `define()` from `gunshi`, export as default
- Register subcommands in `src/cli.ts` via the `subCommands` option
- Commit messages must follow Conventional Commits (enforced by `.vite-hooks/commit-msg`)
- AI Gateway requires `AI_GATEWAY_API_KEY` env var at runtime

## Lint Rule Reference

`vp check` runs oxlint with type-aware rules. When you encounter lint errors, follow these patterns.

### Import ordering (`eslint(sort-imports)`)

Imports are ordered by **member count first**, then **alphabetically by first specifier name** (ASCII order: uppercase before lowercase).

1. **Multiple-member imports first:** `import { a, b } from '...'` before `import { c } from '...'`
2. **Within each group, sort alphabetically by the first imported name** (not the module path). ASCII order means `A-Z` before `a-z`: `DB_TRUE` < `ParseResult` < `createClient` < `initDb`.
3. **`import type` counts the same as `import`** for member-count grouping. `import type { Client }` is single, `import type { Client, Row }` is multiple.
4. **`import type` and `import` are freely interleaved** within each member-count group — they are not separated. Sort purely by first specifier name regardless of whether the import is a type or value.
5. **ASCII comparison is character-by-character.** Names sharing a prefix but differing in case mid-word sort by the first differing character: `DB_TRUE` < `describe` because `D` (68) < `d` (100).
6. **Aliases use the local name for sorting.** `import { cosineSimilarity as similarity }` sorts by `similarity` (`s`), not `cosineSimilarity` (`c`).

```typescript
// CORRECT — multiples first, then singles sorted by first specifier
// Note: import type and import are interleaved, not separated
import type { KuralFile, KuralFunction } from "../parse/types.ts";
import { describe, expect, it } from "vite-plus/test";
import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client";
import { initDb } from "./schema.ts";
```

### No magic numbers (`eslint(no-magic-numbers)`)

Every numeric literal must be a named constant — including `0`, `1`, and values inside array literals.

```typescript
// BAD
const arr = [0.1, 0.2, 0.3];
if (items.length === 0) { ... }

// GOOD
const EMB_X = 0.1;
const EMB_Y = 0.2;
const EMB_Z = 0.3;
const arr = [EMB_X, EMB_Y, EMB_Z];
const NONE = 0;
if (items.length === NONE) { ... }
```

### No unsafe type assertions (`typescript-eslint(no-unsafe-type-assertion)`)

Do not use `as T` to narrow from `any` or to a narrower type.

**Fix for `JSON.parse`:** Create typed wrapper functions that use the return type signature (no `as` keyword) and validate at runtime:

```typescript
// BAD
const arr = JSON.parse(text) as string[];

// GOOD — return type does the work, runtime validates
function parseJsonStrings(text: string): string[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === "string");
}
```

**Fix for DB row access:** Use typed accessor functions with runtime narrowing instead of casting entire row objects:

```typescript
// BAD
const r = row as unknown as FileRow;

// GOOD — narrow each field individually
function str(row: Row, key: string): string {
  const val = row[key];
  return typeof val === "string" ? val : "";
}
```

### No unsafe return (`typescript-eslint(no-unsafe-return)`)

Returning `JSON.parse(text)` directly from a typed function is flagged because `JSON.parse` returns `any`. Assign to `unknown` first and validate.

### No base to string (`typescript-eslint(no-base-to-string)`)

`String(val)` where `val` could be `ArrayBuffer` produces `[object ArrayBuffer]`. Narrow the type first:

```typescript
// BAD — val is string | number | ArrayBuffer | null
String(val);

// GOOD
typeof val === "string" ? val : "";
```

### Max lines per function (`eslint(max-lines-per-function)`)

Functions (including test `describe` blocks) cannot exceed 50 lines. Split large test suites into multiple `describe` blocks and extract helper functions.

### Boolean to integer for SQLite

SQLite has no boolean type. Use a named helper instead of inline ternaries:

```typescript
const DB_TRUE = 1;
const DB_FALSE = 0;
function boolToInt(value: boolean): number {
  return value ? DB_TRUE : DB_FALSE;
}
```
