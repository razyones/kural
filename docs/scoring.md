# Scoring — Structural Health Metrics

The scoring system produces a **ScoreCard** for every non-leaf node (file or directory) in the codebase tree. Each card contains two core metrics — **label-fit** and **label-uniqueness** — plus subtree aggregations and an overall score.

---

## 1. Two Axes of Code Organization

Code organizes along two orthogonal axes:

### Domain axis

Grouped by _what it's about_. `ingestion/`, `sost/`, `config/`. Children share semantic meaning. Embeddings capture this naturally — the parent identity ("ingestion") and children's embeddings (parse, embed, signals) point in the same semantic direction.

Both label-fit and label-uniqueness apply. The parent's identity should match its children (fit), and children should be well-distributed specializations of the shared concept (uniqueness).

### Capability axis

Grouped by _what it can do generically_. `utils/`, any `@kuralUtil` directory. Children share the property of being reusable tools, not a domain. "Utilities" is an organizational label, not a semantic direction — the embedding model can't represent "miscellaneous useful things" as a coherent vector.

Label-fit does not apply at the capability container level — the identity can't meaningfully match semantically scattered children. Label-uniqueness still applies — even in a capability folder, children should be well-distributed (no overlapping utilities).

### Every domain allows capability access

In a domain-organized codebase, cross-cutting capabilities naturally arise in any module. A domain folder like `ingestion/embed/` may host a `@kuralUtil` helper that does generic array deduplication. This is a capability resident inside a domain container — legitimate, but not part of the domain's identity.

---

## 2. Core Metrics

### Label-fit

**"Does this container's declared identity match what it contains?"**

```
label_fit = cosine_similarity(identity, leaf)
```

- `identity` = what the container claims to be (name + description embedding)
- `leaf` = what the container actually contains (blended child embeddings)
- Range: [0, 1] in practice. 1.0 = perfect alignment.
- **N/A for capability containers** — the organizational label has no semantic direction to match against.

### Label-uniqueness

**"Are this container's children evenly spread?"**

```
delta_i      = child_i.identity - parent.identity
distances    = [1 - cosine_similarity(delta_i, delta_j)]  for all pairs i,j
mean         = avg(distances)
stddev       = standard_deviation(distances)
cv           = stddev / mean
uniqueness   = mean == 0 ? 0 : 1 / (1 + cv)
```

- Range: [0, 1]. 1.0 = perfectly uniform spread.
- Measures **spread quality** (evenness of distribution), not separation level (how far apart).
- Applies to both domain and capability containers.
- Returns `NO_SIBLINGS` (2.0) when fewer than 2 eligible children — uniqueness is not applicable.

#### Why CV (Coefficient of Variation)?

The core question is: "are a folder's children well-distributed, or are some clumped together while others are isolated?"

- **Low CV** → all pairwise distances are similar → children are evenly spread → high score
- **High CV** → some pairs are tight while others are far apart → clumpy → low score

The `1 / (1 + CV)` normalization maps CV to (0, 1] where higher is better:

| CV  | Score | Interpretation       |
| :-- | :---- | :------------------- |
| 0   | 1.000 | Perfect uniformity   |
| 0.1 | 0.909 | Very even spread     |
| 0.5 | 0.667 | Moderate clumping    |
| 1.0 | 0.500 | Significant clumping |
| 2.0 | 0.333 | Severe clumping      |

#### What uniqueness does NOT capture

Uniqueness measures spread quality, not separation level. A folder where all children are uniformly close scores the same as one where all children are uniformly far. Separation concerns are handled by audits:

- **Merge candidates audit** flags pairs that are too close
- **worst_pair** on the scorecard identifies the tightest pair for investigation

#### Previous approach (V1, deprecated)

V1 used the minimum pairwise distance as the uniqueness score. This was too punitive — one tight pair tanked the entire score, regardless of how well-distributed the other children were. It conflated separation level with spread quality and was dominated by outlier pairs.

---

## 3. Kural Params in Scoring

The `@kural` annotations control what participates in scoring computations. They operate at the scoring level, not the audit level — this ensures scoring and audits see the same filtered view, producing predictable outcomes.

### @kuralHelper

**Participates in scoring. Excluded from audits.**

Helpers are private implementation details within a file. They are part of the file's structural reality — a file with many helpers has a certain shape, and the score should reflect that honestly. But audits don't flag helper-related issues — "your helper is too similar to your export" isn't actionable.

- Scoring: helpers contribute to their parent's label-fit and label-uniqueness
- Audits: helpers are excluded from findings

### @kuralUtil

**Excluded from domain scoring. Scored normally within own sandbox.**

Utils are capability nodes — cross-cutting concerns that don't belong to any domain's identity. When a `@kuralUtil` function lives inside a domain file, it's a legitimate capability resident but not part of the domain's measurement.

- On a **container** (directory/file): label-fit = N/A (capability identity has no semantic direction). Label-uniqueness computed normally. Children scored normally within the sandbox.
- On a **child** inside a domain container: excluded from parent's label-fit and label-uniqueness computation. The domain isn't penalized for hosting capability residents.
- **Subtree isolation**: capability directory scores do not propagate into the parent domain's subtree aggregation. They are their own sandbox.

#### Util placement carries meaning

The level at which a util lives declares its scope of use:

| Level                            | Scope                            |
| :------------------------------- | :------------------------------- |
| `@kuralUtil` function in a file  | Local to that file               |
| `@kuralUtil` file in a directory | Shared across the parent module  |
| `utils/` folder at root          | Available to the entire codebase |

A util at the wrong level is a structural signal — a function in `src/utils/` only called by one file probably belongs closer to its consumer, and a helper buried deep that's imported across three modules should live higher. The misplacement audit can catch these since utils participate in scoring within their sandbox.

### @kuralPatterns

**Deduplicated in scoring. Creates an invisible folder.**

Nodes sharing a pattern ID (e.g., all route handlers) are structurally similar by design. They form a virtual sub-group — an invisible folder. Deduplication keeps one representative per group, analogous to how a real folder appears as a single node to its parent.

This is the same principle as parent identity subtraction: the pattern's shared structural template is factored out by collapsing the group, so the uniqueness metric only measures the distribution of distinct concepts.

### @kuralCompanion

**Deduplicated in scoring. Intentional co-location.**

Companion files (e.g., `reader.ts` and `writer.ts`) are intentionally co-located. Deduplication keeps one representative per companion group, preventing the intentionally tight pair from distorting the uniqueness distribution.

### @kuralResidual

**No role in scoring. Audit suppression only.**

Residual annotations suppress specific audit findings for known/accepted structural situations. They never influence the score — the measurement stays honest, only the interpretation is silenced.

### @kuralPure / @kuralCauses

**No direct role in scoring.**

These influence _what_ gets embedded (the causes signal is included in the signature facet), not _how_ scores are computed. `@kuralPure` indicates no behavioral context is needed; `@kuralCauses` provides the behavioral context for the signature embedding.

---

## 4. Subtree Aggregation

Subtree scores summarize the health of everything **below** a node, excluding the node itself.

```
subtreeFit           = avg(descendant label-fit values)
subtreeUniqueness    = avg(descendant label-uniqueness values, excluding NO_SIBLINGS)
subtreeMinFit        = min(descendant label-fit values)
subtreeMinUniqueness = min(descendant label-uniqueness values, excluding NO_SIBLINGS)
```

### Rules

- **Self excluded**: a node's own label-uniqueness does not appear in its subtreeUniqueness. The subtree reflects descendants only.
- **NO_SIBLINGS excluded**: the sentinel value (2.0) never enters aggregation. Files with fewer than 2 eligible children contribute nothing to parent subtree means.
- **N/A fallback**: when no descendants have real uniqueness measurements, subtreeUniqueness = NO_SIBLINGS (N/A).
- **Capability subtrees isolated**: `@kuralUtil` directory scores do not propagate into domain parent subtrees. Each capability sandbox has its own scorecard but its numbers never flow into the domain hierarchy's means.

---

## 5. Overall Score

```
overallScore = subtreeUniqueness == NO_SIBLINGS
             ? null
             : harmonicMean(subtreeFit, subtreeUniqueness)
```

The harmonic mean penalizes imbalance — a node needs both good fit and good uniqueness across its subtree to score well. When subtree uniqueness is N/A, overall score is null rather than a misleading number.

For capability containers where label-fit is N/A, overall score is also null — neither metric applies at the container level, though children within the sandbox are scored normally.

---

## 6. Worst Pair

The scorecard includes a `worst_pair` field identifying the two children with the smallest pairwise distance (after parent subtraction). This is the minimum pairwise value from the V1 approach — it remains useful as a diagnostic pointer for targeted investigation, even though it no longer drives the uniqueness score.

---

## 7. ScoreCard Fields

| Field                  | Type                     | Description                                              |
| :--------------------- | :----------------------- | :------------------------------------------------------- |
| `key`                  | string                   | Unique node identifier                                   |
| `kind`                 | string                   | Node kind (file, directory)                              |
| `name`                 | string                   | Display name                                             |
| `labelFit`             | number \| null           | Identity-leaf similarity, null for capability containers |
| `labelUniqueness`      | number \| 2.0            | Spread quality, 2.0 = not applicable (< 2 children)      |
| `subtreeFit`           | number                   | Mean label-fit across descendants                        |
| `subtreeUniqueness`    | number \| 2.0            | Mean label-uniqueness across descendants, excluding N/A  |
| `subtreeMinFit`        | number                   | Floor label-fit in subtree                               |
| `subtreeMinUniqueness` | number \| 2.0            | Floor label-uniqueness in subtree, excluding N/A         |
| `overallScore`         | number \| null           | Harmonic mean of subtree fit and uniqueness, null if N/A |
| `worstPair`            | [string, string] \| null | Closest child pair names for diagnostics                 |
| `bestUncle`            | object \| null           | Best-fitting uncle name and score                        |
