# Util Scoring — Capability Trees

The codebase is organized by domain (ingestion, scoring, auditing), but at every level there's a need to group by capability — shared tools that multiple domain modules use. That's what `@kuralUtil` marks.

---

## 1. Two Axes of Organization

| Axis           | Question                          | Example                               |
| -------------- | --------------------------------- | ------------------------------------- |
| **Domain**     | What does this system do?         | `ingestion/`, `sost/`, `audits/`      |
| **Capability** | How does it do common operations? | `utils/vectors.ts`, `utils/format.ts` |

Both are valid organizing principles. They cut across each other — `vectors.ts` serves ingestion, scoring, and auditing, but belongs under capability, not under any single domain.

---

## 2. Utils Form Separate Trees

A domain tree measures "does this code belong under this domain concept?" Asking `cosineSimilarity(ingestion.identity, formatBytes.leaf)` is meaningless — `formatBytes` is there because it's a shared tool, not because it's semantically about ingestion.

Each util container is a self-contained scoring tree rooted at itself:

```
src/                          <- domain tree root
  ingestion/                  <- domain child
  sost/                       <- domain child
  utils/                      <- util tree root (separate from domain tree)
    vectors.ts                <- util child (scored within utils/)
      cosineSimilarity        <- leaf (scored within vectors.ts)
      subtract                <- leaf (scored within vectors.ts)
    format.ts                 <- util child (scored within utils/)
    paths.ts                  <- util child (scored within utils/)
```

The domain tree does not see `utils/` as a sibling of `ingestion/`. The util tree scores its own children among themselves.

---

## 3. How `getEligibleChildren` Implements This

```typescript
function getEligibleChildren(node, nodes) {
  const children = getChildren(node, nodes);
  return node.util ? children : children.filter((c) => !c.util);
}
```

- **Domain parent** (`src/`): excludes util children. `utils/` is invisible to the domain tree.
- **Util parent** (`utils/`): includes all children. `vectors.ts`, `format.ts`, `paths.ts` are scored among themselves.

This is the "sandbox" — util nodes form their own isolated scoring world.

---

## 4. Domain Within Capability

Even inside `utils/`, children are organized by domain. `vectors.ts` is about vector math, `format.ts` is about display formatting. Each util file is a domain within the capability space.

The organizing principle is recursive. Domain modules contain capability helpers. Capability modules contain domain groupings. It alternates at each level.

---

## 5. Scoring Rules

### fit (as a child)

| Node                                 | Parent   | Result                                         |
| ------------------------------------ | -------- | ---------------------------------------------- |
| Domain container under domain parent | Measured | `cosineSimilarity(parent.identity, node.leaf)` |
| Util container under domain parent   | Null     | Cross-axis measurement is meaningless          |
| Util container under util parent     | Measured | Within the util tree, fit is meaningful        |
| Util leaf under any parent           | Measured | Leaf fit is always meaningful                  |

### childrenFit (as a parent)

All containers get childrenFit — domain and util alike. Every container has children whose content should match its declared identity.

### uniqueness (siblings)

Util children are excluded from domain parent uniqueness via `getEligibleChildren`. Within a util parent, all children participate.

### subtree

Util subtrees do not propagate into domain parent subtrees. A domain directory's subtree scores only include its domain descendants. The util subtree is measured independently.

---

## 6. Tree Count

The total number of scoring trees = 1 domain tree + 1 per util container at every level:

- `src/` — domain tree root
- `src/utils/` — util tree root
- Each util file — sub-tree within the util tree
- Any file elsewhere marked `@kuralUtil` — its own isolated tree

A util directory with util files forms a nested util tree. A lone `@kuralUtil` file in a domain module forms a single-node tree — it gets childrenFit and its leaves get uniqueness, but it has no fit against its domain parent.
