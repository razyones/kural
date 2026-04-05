# Contributing to Kural

Thanks for your interest in contributing to Kural! This guide will help you get set up.

## Prerequisites

- **Node.js** >= 22
- **pnpm** (managed via `packageManager` in package.json)
- **Vite+** (`vp`) — the project's unified toolchain

## Setup

```bash
git clone https://github.com/razyones/kural.git
cd kural
vp install
```

## Development workflow

```bash
vp check          # Format, lint, and type check
vp test           # Run unit tests
vp test --coverage # Run tests with coverage (96% threshold)
vp pack           # Build CLI to dist/cli.mjs
```

### Running the CLI locally

```bash
vp pack
node dist/cli.mjs snapshot generate src
node dist/cli.mjs score
node dist/cli.mjs audit
```

## Project structure

```
src/
  cli.ts              # Entry point — gunshi router
  analysis/           # Core engine: parse, embed, score, audit, place
  db/                 # SQLite persistence
  shell/              # CLI commands, config, and terminal UI
  utils/              # Math and path helpers
tests/                # Fixtures, constants, and helpers
docs/                 # Documentation source (MDX)
docs-site/            # Fumadocs documentation site
```

## Code conventions

- **Imports** from `vite-plus` (not `vite` or `vitest` directly)
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/) — enforced by a commit-msg hook
- **Lint rules** are strict — run `vp check` before committing (also runs automatically on staged files)
- **No magic numbers** — every numeric literal must be a named constant
- **No `as T` assertions** — use runtime validation instead
- **50-line function limit** — extract helpers to keep functions focused

See the full lint rule reference in `CLAUDE.md`.

## Submitting changes

1. Fork the repository
2. Create a branch from `alpha` (the active development branch)
3. Make your changes
4. Run `vp check` and `vp test --coverage` — both must pass
5. Commit using conventional commit format (e.g., `feat: add X`, `fix: resolve Y`)
6. Open a pull request against `alpha`

## Reporting bugs

Use the [bug report template](https://github.com/razyones/kural/issues/new?template=bug_report.yml) on GitHub Issues.

## Requesting features

Use the [feature request template](https://github.com/razyones/kural/issues/new?template=feature_request.yml) on GitHub Issues.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
