---
title: Introduction
description: Kural — structural scoring system for TypeScript codebases
---

Kural answers "where should this code live?" by computing structural health scores for every node in your TypeScript codebase.

## What is Kural?

Kural is a five-stage pipeline that transforms source code into structural health scores. It computes **fit** (does this code belong here?), **uniqueness** (how distinct is it from siblings?), and **overall health** for every type, function, file, and directory.

## Key Concepts

- **[Scoring](/docs/scoring)** — Three perspectives on structural health
- **[Embedding Formulas](/docs/embedding-formulas)** — How identity and leaf vectors are computed
- **[Pattern Nodes](/docs/pattern-nodes)** — Deduplication of repeated structural concepts
- **[Bound Nodes](/docs/bound-nodes)** — Units whose identity is inseparable from context
- **[Util Scoring](/docs/util-scoring)** — Capability trees scored in isolation

## Reference

- **[Database](/docs/db)** — Schema, lifecycle, and serialization
- **[Lint Rules](/docs/lint-rules)** — oxlint rule explanations and fixes
