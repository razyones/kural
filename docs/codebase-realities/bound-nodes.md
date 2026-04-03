---
title: Bound Nodes
description: Units whose identity is inseparable from their hierarchical context
icon: Anchor
---

They exist because the architecture demands them — barrel exports, entry points, primary exports — but they carry no autonomous semantic content. Their embedding profile is either diffuse (borrowed from many) or collapsed (identical to one child). The audit system correctly detects these as statistical anomalies, but the anomalies are structurally inevitable, not design flaws.

## 1. The Problem

Some units will always be flagged by audits, regardless of how well the code is written:

| Unit                      | Audit       | Why it fires                               | Actionable? |
| ------------------------- | ----------- | ------------------------------------------ | ----------- |
| `index.ts`                | Outlier     | Semantically diffuse among domain siblings | No          |
| `cli.ts` (entry)          | Outlier     | Wires subcommands, unlike any sibling      | No          |
| `renderHero` in `hero.ts` | Containment | Dominates parent at 94% similarity         | No          |

All three share one property: **the audit finding cannot be resolved by moving, renaming, or restructuring code.** The anomaly IS the architecture.

---

## 2. Two Directions of Identity Dependency

The `@kuralBound` tag takes a required direction qualifier:

### `@kuralBound inward`

Identity flows **in** from others. The unit aggregates, re-exports, or wires — its semantic content is a composite of what it channels.

```typescript
/**
 * Public API surface for the audits/definitions directory.
 * @kuralBound inward
 */
export { outliers } from "./outliers.ts";
export { containments } from "./containments.ts";
export { duplicates } from "./duplicates.ts";
```

Typical candidates:

- Barrel export files (`index.ts`)
- CLI entry points (`cli.ts`)
- Router/wiring modules
- Facade modules that re-export from children

### `@kuralBound outward`

Identity flows **out** to the parent. The unit IS the parent's reason to exist — its identity defines the container's identity.

```typescript
/**
 * Renders the hero section of the score display.
 * @kuralBound outward
 */
export function renderHero(card: ScoreCard): string { ... }
```

Typical candidates:

- A file's primary/namesake export (`renderHero` in `hero.ts`)
- A single default-exported class that IS the module
- The dominant function a file exists to provide

---

## 3. Tagging Rules

1. **Tag the unit that causes the finding**, not the unit that receives it.
   - Outlier: tag the index/entry file itself.
   - Containment: tag the dominant child function, not the parent file.

2. **One tag per unit.** A unit cannot be both inward and outward.

3. **Do not tag units that can be fixed by restructuring.** `@kuralBound` is for structurally inevitable relationships, not for suppressing legitimate issues. If a function dominates because the file has grown a second unrelated responsibility, the fix is splitting the file — not tagging the function.

---

## 4. Impact by System

### Embedding

**Inward:** The unit's identity embedding is computed normally from its own name and description. The change is to the **leaf** embedding: instead of blending identity with its own children's leaf vectors (which are typically empty for barrel exports), the leaf is derived from **sibling file leaf embeddings** in the same directory. This is implemented as a two-pass blend — non-inward files are blended first so their leaf vectors are available when inward files are processed in the second pass.

```
identity(inward) = normal (0.5 x nameFacet + 0.5 x descFacet)
leaf(inward)     = 0.5 x identity + 0.5 x mean(siblingFileLeaves)
```

Falls back to the standard children-based computation when no siblings are available.

**Outward:** Embed the unit normally — it has rich, genuine content. The change is to the **parent file's** leaf vector: the outward-bound child's leaf embedding is duplicated in the mean computation, effectively giving it 2x weight. This reflects that this child IS the parent's core content.

```
parent.leaf = 0.5 x parent.identity + 0.5 x mean(childLeaves)
  where outward child appears twice in the mean (2x weight)
```

### Scoring

**Inward — fit (representativeness):** Standard fit (`cosineSimilarity(parent.identity, node.leaf)`) is misleading for inward nodes. Instead, fit measures **representativeness**: how close is the unit's identity to the centroid of its domain siblings?

```
fit(inward) = cosineSimilarity(centroid(siblingIdentities), node.identity)
```

Where siblings are children of the same parent, excluding the inward node itself, util nodes, and other inward nodes. Returns 1.0 when no eligible siblings exist.

**Inward — eligible children exclusion:** Inward nodes are excluded from the parent's eligible children set (via `getEligibleChildren`), the same way util nodes are. This means:

- The inward node does not receive a per-child uniqueness score
- The inward node is not included in the parent's `childrenUniqueness` (CV) computation
- The inward node does not distort sibling spread measurements

**Outward — children uniqueness:** The unit's own fit is computed normally. The change is to the **parent's** `childrenUniqueness`: outward-bound children are excluded from the CV (coefficient of variation) computation. The remaining children's coherence is measured among themselves. Falls back to the full children set if all children are outward-bound.

**Outward — per-child uniqueness:** Outward children still receive normal per-child uniqueness scores — they are real domain code and should be compared to siblings for duplication detection.

### Auditing

**Inward — suppress:**

- **Outlier** — bound nodes (both inward and outward) are excluded from the outlier baseline entirely. They are filtered out before sibling similarity is computed.
- **Sibling pairs** — inward-bound nodes are excluded from pairwise sibling comparisons, which suppresses merge-candidate and duplicate findings involving barrel exports.

**Outward — suppress:**

- **Containment** — when the dominant child in a containment finding has `bound === "outward"`, the finding on the parent is suppressed.

**New finding — focal drift:**
If a declared `@kuralBound outward` unit is no longer the most similar child to its parent, the file's purpose has shifted. Either the tag is stale (remove it) or a new function has grown to overtake the declared focal (restructure). Reports the overtaking child's name and both similarity values.

### Placement (deferred)

Placement enforcement is not yet implemented. The planned behavior:

**Inward:** Fixed in position. Never suggest relocating. New siblings should be covered by the gateway.

**Outward:** Fixed in position. Never suggest extracting. New functions in the file should support the outward unit's purpose.

---

## 5. Impact Summary

| Dimension          | Inward                                      | Outward                               | Status      |
| :----------------- | :------------------------------------------ | :------------------------------------ | :---------- |
| **Embedding**      | Leaf from sibling file leaves (two-pass)    | 2x weight in parent's leaf mean       | Implemented |
| **Scoring fit**    | Representativeness vs sibling centroid      | Normal                                | Implemented |
| **Scoring parent** | Excluded from eligible children (like util) | Excluded from CV computation          | Implemented |
| **Audit suppress** | Outlier, sibling pairs                      | Containment                           | Implemented |
| **Audit new**      | —                                           | Focal drift (dominance lost)          | Implemented |
| **Placement**      | Fixed; enforces re-export coverage          | Fixed; enforces helper-only additions | Deferred    |

---

## 6. Relationship to Other Params

| Param            | Overlap with `@kuralBound`                                                                                                                 |
| :--------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| `@kuralResidual` | Both suppress audits. Residual suppresses all audits and has no scoring role. Bound participates in scoring with adjusted formulas.        |
| `@kuralHelper`   | Both exclude from certain audits. Helper is for unexported shared functions. Bound is for architecturally fixed units.                     |
| `@kuralUtil`     | Both adjust scoring baselines. Util creates a sandbox for capability containers. Bound adjusts how a unit relates to its specific context. |
| `@kuralPatterns` | Both affect tree structure. Patterns materialize invisible folders. Bound adjusts how an existing node interacts with its neighbors.       |

A unit can carry both `@kuralBound` and another param (e.g., `@kuralBound inward` + `@kuralResidual` for a barrel file that also has residual hashes). When both are present, the stricter suppression wins.

---

## 7. Auto-Detection

### Implemented

| Pattern                                          | Detection                                                   | Direction |
| ------------------------------------------------ | ----------------------------------------------------------- | --------- |
| File named `index.ts` with no types or functions | AST: zero type and function declarations in the source file | Inward    |

Auto-detected bound is applied only when no explicit `@kuralBound` tag is present. The explicit tag always takes precedence.

### Deferred

| Pattern                                       | Detection                                      | Direction |
| --------------------------------------------- | ---------------------------------------------- | --------- |
| File with `"main"` or `"bin"` in package.json | Config: entry point reference                  | Inward    |
| Function whose name contains the file name    | Naming: `renderHero` in `hero.ts`              | Outward   |
| Single default export that IS the file        | AST: one export declaration, matches file name | Outward   |

These are deferred because the signal-to-noise ratio is too low for automatic application. Entry points need config file lookup; namesake matching produces false positives (`useHeroHelpers` would match `hero.ts`); single-export detection needs re-export analysis beyond current parser capabilities.
