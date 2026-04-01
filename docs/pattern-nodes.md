# Pattern Nodes — One Concept, One Vote

Units tagged with the same `@kuralPatterns` ID are structural repetitions of a single concept. The scoring, auditing, embedding, and placement systems all need to treat them as one entity — but today each system reimplements this reduction independently via `deduplicateByGroup`. Pattern nodes unify this by materializing the group as a real node in the in-memory tree.

---

## 1. The Problem

A file with 3 `fitMetric`-tagged functions and 2 ungrouped functions has 5 children. Three of those children are near-identical by design. This causes:

| System        | Distortion                                                                          |
| ------------- | ----------------------------------------------------------------------------------- |
| **Embedding** | File's leaf vector is 60% "fit computation" — skewed by repetition count            |
| **Scoring**   | Requires `deduplicateByGroup` centroid collapse before every uniqueness computation |
| **Auditing**  | Every audit must filter pattern pairs before comparing siblings                     |
| **Placement** | Near-identical siblings cannibalize each other's softmax probability                |

All four systems solve the same problem in isolation. The tree should solve it once.

---

## 2. Pattern = Invisible Folder

A pattern group is an unnamed container nested inside a file. Its members are structural instances of one concept, just as files inside a directory are structural members of one module.

```
metrics.ts                       <- visible file (5 children today)
  [fitMetric]/                   <- pattern node (invisible folder)
    computeFit
    computeChildrenFit
  [uniquenessMetric]/            <- pattern node (invisible folder)
    computeUniqueness
    computeChildrenUniqueness
  findBestUncle                  <- ungrouped, direct child of file
```

After materialization, the file has 3 children: two pattern nodes and one function. Each child contributes one concept.

---

## 3. Materialization

Pattern nodes are synthesized in `buildTree`, after all DB-sourced nodes are wired. They exist only in the in-memory `NodeMap` — no database record is created.

### Algorithm

```
materializePatterns(nodes):
  for each file node:
    group leaf children by patterns field
    for each group with 2+ members:
      create PatternNode:
        key:       pattern:{filePath}:{patternId}
        kind:      "pattern"
        name:      patternId
        identity:  centroid(members.map(m => m.identity))
        leaf:      [] (populated during embedding)
        childKeys: [member keys]
        parentKey: file key
      reparent members: set member.parentKey = pattern key
      replace members in file.childKeys with pattern key
```

### Node Type

```typescript
type PatternNode = BaseNode & {
  kind: "pattern";
  childKeys: string[];
};
```

Added to the `CodeNode` union. `isLeaf` returns false for pattern nodes.

---

## 4. Impact by System

### Embedding

**Before:** `blendFiles()` computes `mean(allChildLeaves)` — 3 fitMetric leaves inflate the file's leaf toward "fit computation."

**After:** `blendFiles()` computes `mean(patternLeaves + ungroupedLeaves)` — the fitMetric pattern node contributes one leaf vector. Three concepts, equal weight, 33% each.

The embedding pipeline does not need the tree. At the `blendFiles` step, children are grouped by their `patterns` field. Per-group centroids replace individual members in the mean computation. The formula becomes:

```
file.leaf = 0.5 x file.identity + 0.5 x mean(groupCentroids + ungroupedLeaves)
```

Directory leaf computation is unaffected — directories aggregate file/subdirectory leaves, which are already corrected.

### Scoring

`deduplicateByGroup` in `metrics.ts` is no longer needed. A file's `getEligibleChildren` returns pattern nodes and ungrouped leaves. Pattern nodes participate in uniqueness computation like any container — their identity (the centroid) is the representative vector.

Fit for pattern members measures `cosineSimilarity(patternNode.identity, member.leaf)` — "does this member match the pattern's centroid?" A mis-tagged member scores low, which is correct.

### Auditing

Pattern members are no longer siblings of each other — they live under different parents (the pattern node vs other pattern nodes / the file). The guards `a.patterns !== null && b.patterns !== null` in sibling pair collection, duplicates, and util-duplicates become unnecessary. The tree topology enforces what the guards were manually filtering.

`deduplicateByGroup` in `audits/groups.ts` is also unnecessary — bloated, outliers, and containments audits iterate `getEligibleChildren`, which returns pattern nodes directly.

### Placement

When routing a query down the tree, each child gets a softmax probability. Pattern nodes get one probability instead of N near-identical members competing. Routing accuracy scales with conceptual distinctness.

### Subtree Aggregation

Pattern nodes are containers, so `collectSubtree` traverses them. However, a pattern node's `childrenFit` is ~1.0 by construction (members are close to their own centroid). This would dilute subtree fit averages with uninformative perfect scores.

Fix: `collectSubtree` skips `kind === "pattern"` nodes from contributing their own scores. They still collect and propagate their children's scores upward.

---

## 5. What Pattern Nodes Do NOT Have

| Property        | File/Directory           | Pattern Node            |
| --------------- | ------------------------ | ----------------------- |
| Description     | Human-written            | None                    |
| Database record | Persisted                | In-memory only          |
| Identity source | Embedded from facets     | Centroid of members     |
| Leaf source     | Aggregated from children | Aggregated from members |

The `patterns` field on function/type rows is the source of truth. `buildTree` materializes the hierarchy every run.

---

## 6. Nesting (Deferred)

A unit with two `@kuralPatterns` tags would represent nested grouping — a sub-pattern within a pattern. No unit in the codebase carries multiple tags today. The `patterns` field remains `string | null`.

When needed, the materialization algorithm extends naturally: group by first tag, then sub-group within each group by second tag, centroid upward level by level. The `patterns` field would change to `string[] | null`.

---

## 7. Relationship to Real Folders

If someone creates a real `fit/` directory and moves pattern members into it, the directory absorbs the pattern. Leftover members tagged `fitMetric` but still in the original file are misplaced — the misplaced audit flags them because they fit the new `fit/` directory better than their current parent.

The pattern tag on the leftover is a breadcrumb naming exactly where it should go.

| State              | Meaning                                            |
| ------------------ | -------------------------------------------------- |
| Pattern, no folder | Grouping exists in code, not yet in filesystem     |
| Folder, no pattern | Grouping exists in filesystem, tag can be removed  |
| Partial overlap    | Misplacement — audit detects and suggests the move |
