---
title: Kural Params
description: Annotations that declare structural realities the vector space can't capture alone
icon: Tags
---

The vector space is optimized for domain separation. But real codebases have constraints — cross-cutting utilities, repeated structural patterns, architectural entry points, intentional anomalies, side effects that type signatures hide. Each Kural Param declares a specific constraint so the four pillars can adjust.

They are not features. They are concessions to reality.

---

## 1. Why Params Exist

Embedding a codebase into vector space is an imperfect act. The space wants every unit to sit in a clean domain hierarchy — parent above, siblings beside, children below. Real code doesn't comply:

- Utilities serve every domain equally
- Multiple functions implement the same concept by design
- Entry points wire children rather than owning domain content
- Some audit findings describe architecture, not flaws
- Some functions have side effects that their type signature hides

Without Kural Params, the system would produce false scores, false audit findings, and bad placement suggestions for these structurally valid patterns.

---

## 2. @kuralUtil

**Codebase reality:** Code organizes by domain and capability. `cosineSimilarity` in `src/utils/vectors.ts` serves scoring, auditing, and embedding — it has no domain allegiance.

**Problem in vector space:** Scoring `cosineSimilarity` against domain siblings (`ingestion/`, `sost/`, `audits/`) produces meaningless fit measurements. Uniqueness comparisons are distorted by cross-axis mixing.

**Solution:** Util containers form separate scoring trees, excluded from the domain space. In the Kural codebase, `src/utils/` contains `vectors.ts`, `format.ts`, and `paths.ts` — each scored among themselves, invisible to the domain tree rooted at `src/`.

| Pillar    | Impact                                                                                                 |
| :-------- | :----------------------------------------------------------------------------------------------------- |
| **Embed** | No change — vectors are computed normally                                                              |
| **Score** | `fit` = null for util containers under domain parents. Own scoring tree via `getEligibleChildren`      |
| **Audit** | Excluded from domain audits. `incoherent-utils` and `util-duplicates` audit within the util population |
| **Place** | New utilities placed within the util tree, not compared against domain modules                         |

See [Util Scoring](/docs/pillars/util-scoring) for the full specification.

---

## 3. @kuralHelper

**Codebase reality:** Files extract shared logic into helper functions. In `src/ingestion/parse/jsdoc.ts`, `parseResidualTag()`, `hasTagComment()`, and `processTag()` are implementation details — not domain concepts.

**Problem in vector space:** Helpers compete as siblings with the file's primary exports. They distort uniqueness measurements and trigger false outlier or merge-candidate findings.

**Solution:** Helpers are excluded from audits. They participate in scoring but are not treated as domain-level siblings. Auto-detected when an unexported function is called by 2+ siblings in the same file.

| Pillar    | Impact                                                                |
| :-------- | :-------------------------------------------------------------------- |
| **Embed** | No change                                                             |
| **Score** | Participates normally — helpers still need good fit within their file |
| **Audit** | Excluded from outlier, sibling pair, and bloat analysis               |
| **Place** | Not considered as candidates for cross-file movement                  |

---

## 4. @kuralPatterns / @kuralCompanion

**Codebase reality:** Multiple functions implement the same concept. In `src/sost/metrics.ts`, `computeFit` and `computeChildrenFit` are both tagged `@kuralPatterns fitMetric` — they're structural repetitions of the same fit measurement concept, applied at different tree levels. Similarly, `computeUniqueness` and `computeChildrenUniqueness` share `@kuralPatterns uniquenessMetric`.

**Problem in vector space:** Without grouping, the file has 5 children and 3 of them are near-identical. The file's leaf vector skews 60% toward "fit computation." Uniqueness is distorted. Every audit must filter pattern pairs before comparing.

**Solution:** Pattern groups are materialized as invisible container nodes. The file sees 3 children instead of 5 — two pattern nodes (`fitMetric`, `uniquenessMetric`) and one ungrouped function (`findBestUncle`). Each contributes one concept at equal weight.

`@kuralCompanion` works the same way for structurally coupled units that aren't quite the same concept but must travel together.

| Pillar    | Impact                                                                               |
| :-------- | :----------------------------------------------------------------------------------- |
| **Embed** | File leaf = `mean(groupCentroids + ungroupedLeaves)` — repetitions no longer inflate |
| **Score** | Pattern nodes participate as containers. Members scored within their pattern         |
| **Audit** | Pairs sharing a pattern excluded from duplicate and merge-candidate detection        |
| **Place** | Pattern nodes get one probability instead of N near-identical members competing      |

See [Pattern Nodes](/docs/codebase-realities/pattern-nodes) for the full specification.

---

## 5. @kuralBound

**Codebase reality:** Some units derive identity from context. `src/cli.ts` (`@kuralBound inward`) is the entry point — it bootstraps the CLI router, importing from children. `renderHero` in `src/ui/hero.ts` (`@kuralBound outward`) IS the file's reason to exist — it dominates the parent at 94% similarity.

**Problem in vector space:** Inward nodes have diffuse identity — their vectors are composites of what they channel. Outward nodes dominate their parent's embedding. Both trigger audit findings (outlier, containment) that cannot be resolved by restructuring. The anomaly IS the architecture.

**Solution:** Two directions of identity dependency:

- **Inward** (barrel exports, entry points, routers): Leaf is derived from sibling file leaves instead of own children. Fit measures representativeness against sibling centroid. Excluded from eligible children set.
- **Outward** (primary exports, namesake functions): 2x weight in parent's leaf mean. Excluded from parent's CV computation. Enables focal-drift audit (detects when the focal has shifted).

| Pillar    | Inward                                                                        | Outward                                     |
| :-------- | :---------------------------------------------------------------------------- | :------------------------------------------ |
| **Embed** | Leaf from sibling file leaves (two-pass)                                      | 2x weight in parent's leaf mean             |
| **Score** | Fit = representativeness vs sibling centroid. Excluded from eligible children | Excluded from CV computation                |
| **Audit** | Suppresses outlier, sibling pair findings                                     | Suppresses containment. Enables focal-drift |
| **Place** | Fixed in position                                                             | Fixed in position                           |

See [Bound Nodes](/docs/codebase-realities/bound-nodes) for the full specification.

---

## 6. @kuralResidual

**Codebase reality:** Some audit findings are conscious architectural decisions. `src/` is "bloated" because it spans the full lifecycle — that's the design.

**Problem:** Audits correctly flag the anomaly. But the finding is noise — it can't be fixed and shouldn't be.

**Solution:** `@kuralResidual <audit-name> [<hash>]` suppresses a specific audit finding. The hash ties suppression to the current code structure — if the code changes, the hash breaks and the suppression must be re-evaluated.

| Pillar    | Impact                                                                                      |
| :-------- | :------------------------------------------------------------------------------------------ |
| **Embed** | No change                                                                                   |
| **Score** | No change                                                                                   |
| **Audit** | Finding suppressed for the tagged node. Hash-based invalidation prevents stale suppressions |
| **Place** | No change                                                                                   |

---

## 7. @kuralBorrows

**Codebase reality:** Some modules intentionally share vocabulary with a non-sibling. A shell command that presents an analysis engine's output will naturally use the engine's terms — "findings", "outliers", "probability trails". The overlap is by design, not a flaw.

**Problem in vector space:** The directory's name and description embed close to the analysis module it presents, because they share vocabulary. The `vocabulary-bleed` audit flags this as a cross-pull finding — but the bleed is intentional.

**Solution:** `@kuralBorrows target "role"` is a KURAL.md directive with two parameters:

- **Target path** (optional): e.g. `analysis/audits` — tells the vocabulary bleed audit to skip this module when computing cross-pulls, since the overlap is intentional.
- **Quoted role** (required): natural-language description of the borrower's role — prepended to both the directory's name and description before embedding, so shared vocabulary encodes differently through the attention mechanism. For example, `"audit"` in a `"terminal surface that formats engine output"` context produces a different vector than `"audit"` in a `"detection engine"` context.

**Scope:** `@kuralBorrows` only affects the **directory container's** identity embedding. It does not cascade to files, functions, or types within the directory. File-level misplacement findings require file-level description fixes, not directory-level `@kuralBorrows`.

**Format:**

```markdown
The inspector's office. Wires diagnostic CLI arguments to the issue display pipeline...
@kuralBorrows analysis/audits "terminal surface that formats and renders engine output as categorized finding reports"
```

**Principles for writing the role text:**

1. **Describe the borrower's role, not the target's domain.** _"terminal surface that formats engine output as diagrams"_ describes what the shell module does. _"presentation layer for the analysis engine"_ names the target's domain, which increases cross-pull instead of reducing it.
2. **Describe the role in this system, not a generic job.** _"formats and renders engine output as categorized finding reports"_ is specific. _"renders output"_ is generic and provides weak separation.
3. **Never use the target module's vocabulary.** Borrowed terms in the role text increase cross-pull instead of reducing it.

| Pillar    | Impact                                                                     |
| :-------- | :------------------------------------------------------------------------- |
| **Embed** | Role text prepended to directory name and description before vectorization |
| **Score** | No direct change — scoring operates on the resulting vectors               |
| **Audit** | Target path excluded from vocabulary bleed cross-pull detection            |
| **Place** | Better directory vectors lead to more accurate directory-level placement   |

---

## 8. @kuralPure / @kuralCauses

**Codebase reality:** A function's type signature hides whether it reads from disk, writes to stdout, or calls an external API. `computeFit` in `src/sost/metrics.ts` is pure computation. `renderHero` in `src/ui/hero.ts` writes to stdout. Both could return `void`.

**Problem in vector space:** Without side-effect information, pure and impure functions with similar signatures produce similar vectors — even though they behave very differently.

**Solution:** `@kuralPure` marks functions with no side effects — 194 functions in the Kural codebase carry this tag. `@kuralCauses` describes what a function does beyond its type signature: _"writes hero display to stdout"_, _"reads a KURAL.md file from disk"_, _"calls the embedding API via embedder"_. The causes description is embedded and blended into the signature facet at 0.3 or 0.25 weight.

**Diagnostic warnings do not break purity.** A function that calls `console.error` or `console.warn` to surface validation diagnostics remains `@kuralPure`. Purity in kural's model is about the function's **role in the system** — whether its purpose involves I/O that changes system state or produces meaningful output. Incidental diagnostic logging (e.g. warning on an invalid config value before returning a default) is a side channel, not a system cause. Tagging such a function as `@kuralCauses` would misrepresent its identity — it would embed as an I/O function rather than a transformer.

| Pillar    | Impact                                                                                |
| :-------- | :------------------------------------------------------------------------------------ |
| **Embed** | Causes description blended into signature facet. Pure functions use the raw signature |
| **Score** | No direct change — scoring operates on the resulting vectors                          |
| **Audit** | `incomplete-docs` flags functions missing both `@kuralPure` and `@kuralCauses`        |
| **Place** | Better vectors lead to more accurate placement                                        |

---

## 9. Impact Matrix

| Param                 | Embed                 | Score                      | Audit                               | Place              |
| :-------------------- | :-------------------- | :------------------------- | :---------------------------------- | :----------------- |
| `@kuralUtil`          | —                     | Separate tree, fit = null  | Own population                      | Util tree          |
| `@kuralHelper`        | —                     | Normal                     | Excluded from outlier, pairs, bloat | Not relocatable    |
| `@kuralPatterns`      | Centroid in file leaf | Pattern containers         | Excluded from duplicates, merges    | One probability    |
| `@kuralCompanion`     | Centroid in file leaf | Deduplicated in uniqueness | Excluded from duplicates, merges    | One probability    |
| `@kuralBound inward`  | Leaf from siblings    | Fit = representativeness   | Suppresses outlier, pairs           | Fixed              |
| `@kuralBound outward` | 2x parent weight      | Excluded from CV           | Suppresses containment              | Fixed              |
| `@kuralBorrows`       | Role prefix on dir    | —                          | Excludes target from vocab bleed    | Better dir vectors |
| `@kuralResidual`      | —                     | —                          | Suppresses named audit              | —                  |
| `@kuralPure`          | Raw signature         | —                          | `incomplete-docs`                   | —                  |
| `@kuralCauses`        | Causes signal         | —                          | `incomplete-docs`                   | Better vectors     |
