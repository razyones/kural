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
- **Running scripts:** Vite+ commands take precedence over `package.json` scripts. If there is a `test` script defined in `scripts` that conflicts with the built-in `vp test` command, run it using `vp run test`.
- **Do not install Vitest, Oxlint, Oxfmt, or tsdown directly:** Vite+ wraps these tools. They must not be installed directly. You cannot upgrade these tools by installing their latest versions. Always use Vite+ commands.
- **Use Vite+ wrappers for one-off binaries:** Use `vp dlx` instead of package-manager-specific `dlx`/`npx` commands.
- **Import JavaScript modules from `vite-plus`:** Instead of importing from `vite` or `vitest`, all modules should be imported from the project's `vite-plus` dependency. For example, `import { defineConfig } from 'vite-plus';` or `import { expect, test, vi } from 'vite-plus/test';`. You must not install `vitest` to import test utilities.
- **Type-Aware Linting:** There is no need to install `oxlint-tsgolint`, `vp lint --type-aware` works out of the box.

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
3. **Anchor identity with a metaphor.** Lead with a one-word role ("The brain", "The memory", "The toolbox") that captures the unit's irreplaceable character in the system. Most impactful for directories and files; optional for individual functions and types.
4. **Describe the role in the system, not a generic job.** "Persists and retrieves all application state in a local database" is better than "SQLite database schema and operations" — the former says what makes it unique here, the latter describes any database module anywhere. For functions: "Persists computed health metrics so downstream commands can query scores without re-running the pipeline" is better than "Writes score cards to the snapshot."
5. **For folder-level descriptions, combine children's identities.** A parent folder's KURAL.md should describe the shared boundary its children own, not repeat their individual descriptions. Example: "The reader and translator — turns source files into numerical vectors" combines parse and embed's roles.

## Kural Params

| Param                         | Role in scoring                                       |
| :---------------------------- | :---------------------------------------------------- |
| `@kuralHelper`                | Participates in scoring, excluded from audits         |
| `@kuralUtil`                  | Excluded from domain scoring, scored in own sandbox   |
| `@kuralPatterns`              | Deduplicated to centroid representative               |
| `@kuralCompanion`             | Deduplicated to centroid representative               |
| `@kuralResidual`              | No role in scoring, audit suppression only            |
| `@kuralPure` / `@kuralCauses` | Influences what gets embedded, not how scores compute |

## Build & Run

- `vp pack` — builds CLI to `dist/cli.mjs` (tsdown, ESM, Node platform)
- `node dist/cli.mjs` — run the built CLI
- `vp check` — format, lint, type check
- `vp test` — run tests (vitest, import from `vite-plus/test`)

## Conventions

- Define commands using `define()` from `gunshi`, export as default
- Register subcommands in `src/cli.ts` via the `subCommands` option
- Commit messages must follow Conventional Commits (enforced by `.vite-hooks/commit-msg`)
- AI Gateway requires `AI_GATEWAY_API_KEY` env var at runtime
