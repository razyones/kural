---
title: Introduction
description: Kural — structural scoring system for TypeScript codebases
---

Kural answers "where should this code live?"

It is a structural framework for TypeScript codebases built on four pillars. **Embed** places every type, function, file, and directory into vector space using facets engineered to carry structural information alongside meaning. **Score** measures how well the codebase is distributed in that space. **Audit** surfaces specific, actionable issues that cross-validate with scores. **Place** uses the well-distributed space to position new units and enable information retrieval.

```
        ┌─────────────────────┐
        │        PLACE        │  Roof: the payoff
        ├──────────┬──────────┤
        │  SCORE   │  AUDIT   │  Pillars: cross-validate each other
        ├──────────┴──────────┤
        │        EMBED        │  Foundation: everything rests on this
        └─────────────────────┘
```

How well we embed, score, audit, and place is what gives meaning to Kural.

## Foundation

- **[Embedding](/docs/foundation/embedding)** — Every unit becomes a vector. Facets capture name, description, and structural shape. Signals anchor them in filesystem context. The result: children cluster near their parent while separating from siblings. The vector space mirrors the tree — by design.

## Pillars

- **[Scoring](/docs/pillars/scoring)** — Three perspectives on structural health: fit (does it belong here?), uniqueness (how distinct from siblings?), and subtree health (is everything below organized?).
- **[Util Scoring](/docs/pillars/util-scoring)** — Real codebases organize by domain and capability. These are two axes that must not mix — each capability container gets its own scoring space.
- **[Audits](/docs/pillars/audits)** — 14 statistical checks surface specific, actionable issues. Score and Audit cross-validate — fixing audit findings should improve scores. If a fix drops the score, it introduced a new issue.

## Codebase Realities

- **[Kural Params](/docs/codebase-realities/kural-params)** — The vector space can't naturally represent every codebase reality. Kural Params declare constraints — utilities, patterns, bound nodes, residuals — so the four pillars can adjust.
- **[Pattern Nodes](/docs/codebase-realities/pattern-nodes)** — When multiple siblings are structural repetitions of one concept, they're collapsed into a single representative.
- **[Bound Nodes](/docs/codebase-realities/bound-nodes)** — When a unit's identity is inseparable from its context (barrel exports, entry points, primary exports), the system adjusts rather than flagging architecture as a flaw.

## Infrastructure

- **[Architecture](/docs/infrastructure/architecture)** — System overview: the pipeline, tiers, data model, and sync design.
- **[Database](/docs/infrastructure/db)** — SQLite snapshot persistence, schema, lifecycle, and caching.

## Contributing

- **[Lint Rules](/docs/contributing/lint-rules)** — oxlint type-aware rules used by `vp check` and how to fix violations.
