---
title: Scoring
description: Structural health metrics for every node in the codebase tree
---

The scoring system produces a **ScoreCard** for every node in the codebase tree — types, functions, files, and directories. Each card captures three perspectives: the node as a **child** (does it belong here?), as a **parent** (are its children well-organized?), and as a **subtree root** (is everything below healthy?).

---

## 1. Three Perspectives

### As a child — "Do I belong here?"

Every node is evaluated relative to its parent and siblings.

- **fit** — does my content match my parent's declared identity?
- **uniqueness** — how different am I from my siblings?
- **score** — combined placement quality

### As a parent — "Are my children well-organized?"

Containers (files and directories) are evaluated on how well their direct children are structured.

- **childrenFit** — does my content match what I claim to be?
- **childrenUniqueness** — are my children well-spread?
- **childrenScore** — combined structural quality of direct children

### As a subtree root — "Is everything below me healthy?"

Containers are evaluated on the aggregate health of all descendants.

- **subtreeFit** — average childrenFit across all descendant containers
- **subtreeUniqueness** — average childrenUniqueness across all descendant containers
- **subtreeScore** — combined subtree health

---

## 2. Formulas

### fit (as a child)

```
fit(N) = cosineSimilarity(parent.identity, N.leaf)
```

How well does this node's content match what its parent claims to be? A function in `src/db/` should have content that aligns with the "db" module's identity.

- Range: [-1, 1] in theory, [0, 1] in practice
- 1.0 = perfect alignment with parent
- Null if N has no parent (root node)
- Null if N is a util container (capability containers have no semantic parent direction)

### uniqueness (as a child)

```
delta_N = N.identity - parent.identity
delta_S = S.identity - parent.identity    (for each sibling S ≠ N)

uniqueness(N) = avg(cosineDistance(delta_N, delta_S))   for all siblings S
```

How different is this node from its siblings, after factoring out the shared parent direction? The parent identity is subtracted so uniqueness measures **specialization direction**, not shared domain membership.

- `cosineDistance(a, b) = 1 - cosineSimilarity(a, b)`
- Range: [0, 2]
- High = very distinct from siblings
- Low = overlaps with siblings (potential merge candidate)
- N/A (sentinel value 2.0) if fewer than 2 siblings

### score (as a child)

```
score(N) = harmonicMean(fit, uniqueness)
```

Combined placement quality. The harmonic mean penalizes imbalance — a node needs both good fit and good uniqueness to score well. A well-fitting but non-unique node (duplicate) or a unique but poorly-fitting node (misplaced) both score low.

- Null if fit is null or uniqueness is N/A

### childrenFit (as a parent)

```
childrenFit(N) = cosineSimilarity(N.identity, N.leaf)
```

How well does the container's blended content (from its children) match its own declared identity? The `leaf` embedding propagates children's content upward through the tree, so this captures the aggregate alignment.

- Range: [0, 1] in practice
- 1.0 = children perfectly match the container's name/description
- Null for leaf nodes (no children)
- Null for util containers

### childrenUniqueness (as a parent)

```
For each child pair (i, j):
  delta_i = child_i.identity - parent.identity
  delta_j = child_j.identity - parent.identity
  distance = cosineDistance(delta_i, delta_j)

mean = avg(all pairwise distances)
cv = stddev(distances) / mean
childrenUniqueness = 1 / (1 + cv)
```

How evenly distributed are the container's children? Uses the Coefficient of Variation (CV) of pairwise distances to measure **spread quality** — whether children are evenly spaced or clumped.

- Range: (0, 1]
- 1.0 = perfectly uniform spread (all pairs equidistant)
- Low = some children are clumped together while others are isolated
- N/A (sentinel value 2.0) if fewer than 2 eligible children
- Null for leaf nodes

| CV  | Score | Interpretation       |
| :-- | :---- | :------------------- |
| 0   | 1.000 | Perfect uniformity   |
| 0.1 | 0.909 | Very even spread     |
| 0.5 | 0.667 | Moderate clumping    |
| 1.0 | 0.500 | Significant clumping |
| 2.0 | 0.333 | Severe clumping      |

### childrenScore (as a parent)

```
childrenScore(N) = harmonicMean(childrenFit, childrenUniqueness)
```

Combined quality of direct children organization. Null if either input is null or N/A.

### subtreeFit (subtree root)

```
subtreeFit(N) = avg(childrenFit of all descendant containers, excluding self)
```

Average childrenFit across all descendants. Captures whether nodes deeper in the tree are well-named relative to their content. A high childrenFit at the top but low subtreeFit means deep naming problems.

- Null for leaf nodes
- Falls back to own childrenFit if no descendants

### subtreeUniqueness (subtree root)

```
subtreeUniqueness(N) = avg(childrenUniqueness of all descendant containers, excluding self and N/A sentinels)
```

Average childrenUniqueness across all descendants. Captures whether children are well-distributed at every level of the tree, not just the direct children.

- N/A sentinel values (2.0) are excluded from the average
- Null for leaf nodes
- N/A if no descendants have real uniqueness measurements

### subtreeScore (subtree root)

```
subtreeScore(N) = harmonicMean(subtreeFit, subtreeUniqueness)
```

Combined subtree health. Null if either input is null or N/A.

### overallScore

```
overallScore(leaf)      = score
overallScore(container) = harmonicMean(score, subtreeScore)
```

The single number that represents the total health of a node — both its own placement quality and the health of everything below it. For leaves, this is just their placement score. For containers, it combines self-placement with subtree health.

- Null if any required input is null

### bestUncle

```
For each uncle U (parent's siblings, excluding companion-paired):
  uncleFit = cosineSimilarity(U.identity, N.leaf)

bestUncle = uncle with max(uncleFit)
```

The uncle where this node's content would fit best. If `bestUncle.score > fit`, the node may be misplaced.

- Null if no parent, no grandparent, or no valid uncles

### worstPair

The two direct children with the smallest pairwise distance (most similar after parent subtraction). Identifies the closest pair for investigation — potential merge candidates.

- Null for leaf nodes or containers with fewer than 2 children

---

## 3. ScoreCard Fields

| Field                | Type                     | Leaf | Container | Description                                               |
| :------------------- | :----------------------- | :--- | :-------- | :-------------------------------------------------------- |
| `key`                | string                   | yes  | yes       | Unique node identifier                                    |
| `kind`               | string                   | yes  | yes       | `"function"`, `"type"`, `"file"`, `"directory"`           |
| `name`               | string                   | yes  | yes       | Display name                                              |
| `fit`                | number \| null           | yes  | yes       | Content-to-parent alignment                               |
| `uniqueness`         | number                   | yes  | yes       | Mean distance to siblings (N/A = 2.0)                     |
| `score`              | number \| null           | yes  | yes       | harmonicMean(fit, uniqueness)                             |
| `childrenFit`        | number \| null           | null | yes       | Identity-to-content alignment                             |
| `childrenUniqueness` | number \| null           | null | yes       | CV spread quality of children (N/A = 2.0)                 |
| `childrenScore`      | number \| null           | null | yes       | harmonicMean(childrenFit, childrenUniqueness)             |
| `subtreeFit`         | number \| null           | null | yes       | Mean childrenFit of descendants                           |
| `subtreeUniqueness`  | number \| null           | null | yes       | Mean childrenUniqueness of descendants                    |
| `subtreeScore`       | number \| null           | null | yes       | harmonicMean(subtreeFit, subtreeUniqueness)               |
| `overallScore`       | number \| null           | yes  | yes       | Leaf: score. Container: harmonicMean(score, subtreeScore) |
| `worstPair`          | [string, string] \| null | null | yes       | Most similar child pair                                   |
| `bestUncle`          | {name, score} \| null    | yes  | yes       | Best-fitting uncle node                                   |

---

## 4. What uniqueness does NOT capture

`uniqueness` (per-child) measures mean distance to siblings — "how different am I on average?"

`childrenUniqueness` (CV) measures spread quality — "are children evenly distributed or clumped?"

Neither measures absolute separation. A folder where all children are uniformly close scores the same CV as one where all children are uniformly far. Separation concerns are handled by audits:

- **Merge candidates audit** flags pairs that are too close
- **worstPair** on the scorecard identifies the tightest pair for investigation

---

## 5. Kural Annotations in Scoring

### @kuralUtil

Capability containers (files/directories marked `@kuralUtil` or in `utils/`/`helpers/` paths). Their identity has no semantic direction, so:

- `fit` = null (no meaningful parent alignment)
- `childrenFit` = null (no meaningful self-alignment)
- Util nodes excluded from parent's uniqueness computation via `getEligibleChildren`
- Util subtrees sandboxed — their scores don't propagate into domain parent subtrees

### @kuralHelper

Helpers (unexported functions called by 2+ siblings). They participate in scoring but are excluded from audits.

### @kuralPatterns / @kuralCompanion

Groups are deduplicated to their identity centroid for uniqueness computation. Prevents structurally similar by-design groups from distorting the distribution.

### @kuralBound inward / outward

Units whose identity is inseparable from their hierarchical context. See `docs/bound-nodes.md` for full specification.

- **Inward** (barrel exports, entry points): fit is replaced with representativeness against the centroid of aggregated targets. Excluded from parent's `childrenUniqueness`.
- **Outward** (dominant primary exports): fit is normal. Parent's `childrenUniqueness` is computed in two tiers — the outward child's dominance is expected, helpers' coherence is measured separately.

### @kuralResidual

No role in scoring. Audit suppression only.

---

## 6. Harmonic Mean

```
H(a, b) = 2ab / (a + b)
```

Used for `score`, `childrenScore`, `subtreeScore`, and `overallScore`. The harmonic mean is stricter than arithmetic mean — it heavily penalizes when one value is much lower than the other. Both metrics must be good for the combined score to be good.

| a   | b   | H(a,b) | Arithmetic |
| :-- | :-- | :----- | :--------- |
| 0.9 | 0.9 | 0.900  | 0.900      |
| 0.9 | 0.5 | 0.643  | 0.700      |
| 0.9 | 0.1 | 0.180  | 0.500      |
| 1.0 | 0.0 | 0.000  | 0.500      |
