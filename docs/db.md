# Database Architecture

Local snapshot persistence for the Kural CLI. All data lives on disk as SQLite databases under `.kural-db/`.

## Directory Layout

```
.kural-db/
  <branch>/
    active.db                           # current snapshot
    advise.db                           # ephemeral clone for simulation
    history/
      kural-history-<snapshot-id>.db    # rotated snapshots (max 10)
```

Snapshot ID format: `<timestamp>-<short-commit-hash>` (e.g., `1711700400-a3f8b2c`).

## Schema

Six tables per snapshot database.

### files

Source files with embeddings and import tracking.

| Column               | Type          | Notes                                           |
| -------------------- | ------------- | ----------------------------------------------- |
| `path`               | TEXT PK       | Absolute file path                              |
| `name`               | TEXT NOT NULL | File name                                       |
| `description`        | TEXT          | From KURAL.md or JSDoc                          |
| `identity_embedding` | BLOB NOT NULL | Float32 — name + description vector             |
| `leaf_embedding`     | BLOB NOT NULL | Float32 — name + description + structure vector |
| `facet_hash`         | TEXT          | SHA256 for cache invalidation                   |
| `imports_internal`   | TEXT NOT NULL | JSON string array                               |
| `imports_external`   | TEXT NOT NULL | JSON string array                               |
| `companion`          | TEXT          | @kuralCompanion group ID                        |
| `residuals`          | TEXT NOT NULL | JSON ResidualEntry array                        |

### types

Type declarations (interfaces, classes, type aliases).

| Column               | Type             | Notes                                      |
| -------------------- | ---------------- | ------------------------------------------ |
| `path`               | TEXT NOT NULL    | PK with name                               |
| `name`               | TEXT NOT NULL    | PK with path                               |
| `description`        | TEXT             |                                            |
| `fields`             | TEXT NOT NULL    | JSON Record<string, string>                |
| `exported`           | INTEGER NOT NULL | Boolean (0/1)                              |
| `refs`               | TEXT NOT NULL    | JSON string array — cross-module type refs |
| `util`               | INTEGER NOT NULL | Boolean — utility helper                   |
| `helper`             | INTEGER NOT NULL | Boolean — shared extraction helper         |
| `residuals`          | TEXT NOT NULL    | JSON ResidualEntry array                   |
| `identity_embedding` | BLOB NOT NULL    | Float32                                    |
| `leaf_embedding`     | BLOB NOT NULL    | Float32                                    |
| `facet_hash`         | TEXT             |                                            |
| `patterns`           | TEXT             | @kuralPatterns group ID                    |

### functions

Function declarations with call graph and purity info.

| Column               | Type             | Notes                                   |
| -------------------- | ---------------- | --------------------------------------- |
| `path`               | TEXT NOT NULL    | PK with name                            |
| `name`               | TEXT NOT NULL    | PK with path                            |
| `description`        | TEXT             |                                         |
| `params`             | TEXT NOT NULL    | JSON string array — parameter types     |
| `param_names`        | TEXT NOT NULL    | JSON string array — parameter names     |
| `returns_type`       | TEXT NOT NULL    | Return type                             |
| `exported`           | INTEGER NOT NULL | Boolean                                 |
| `pure`               | INTEGER NOT NULL | Boolean — @kuralPure                    |
| `util`               | INTEGER NOT NULL | Boolean                                 |
| `helper`             | INTEGER NOT NULL | Boolean                                 |
| `residuals`          | TEXT NOT NULL    | JSON ResidualEntry array                |
| `causes`             | TEXT             | Non-type side effects description       |
| `calls`              | TEXT NOT NULL    | JSON string array — outbound call graph |
| `identity_embedding` | BLOB NOT NULL    | Float32                                 |
| `leaf_embedding`     | BLOB NOT NULL    | Float32                                 |
| `facet_hash`         | TEXT             |                                         |
| `patterns`           | TEXT             | @kuralPatterns group ID                 |
| `documented_params`  | INTEGER NOT NULL | Count of @param tags (default 0)        |
| `has_return_doc`     | INTEGER NOT NULL | Boolean — has @returns tag (default 0)  |

### directories

Directory hierarchy with child references.

| Column               | Type          | Notes                           |
| -------------------- | ------------- | ------------------------------- |
| `path`               | TEXT PK       | Absolute directory path         |
| `name`               | TEXT NOT NULL | Directory name                  |
| `description`        | TEXT          | From KURAL.md                   |
| `children`           | TEXT NOT NULL | JSON string array — child paths |
| `identity_embedding` | BLOB NOT NULL | Float32                         |
| `leaf_embedding`     | BLOB NOT NULL | Float32                         |
| `facet_hash`         | TEXT          |                                 |
| `residuals`          | TEXT NOT NULL | JSON ResidualEntry array        |

### scores

Structural health metrics for every node (types, functions, files, directories).

| Column                | Type          | Notes                                                          |
| --------------------- | ------------- | -------------------------------------------------------------- |
| `key`                 | TEXT PK       | Unique identifier                                              |
| `kind`                | TEXT NOT NULL | `"function"`, `"type"`, `"file"`, or `"directory"`             |
| `name`                | TEXT NOT NULL | Display name                                                   |
| `fit`                 | REAL          | Content-to-parent alignment (null for root or util containers) |
| `uniqueness`          | REAL NOT NULL | Mean distance to siblings (2.0 = N/A, fewer than 2 siblings)   |
| `score`               | REAL          | harmonicMean(fit, uniqueness). Null if fit is null             |
| `children_fit`        | REAL          | Identity-to-content alignment (null for leaves)                |
| `children_uniqueness` | REAL          | CV spread quality of children (null for leaves, 2.0 = N/A)     |
| `children_score`      | REAL          | harmonicMean(childrenFit, childrenUniqueness). Null for leaves |
| `subtree_fit`         | REAL          | Mean childrenFit of descendants (null for leaves)              |
| `subtree_uniqueness`  | REAL          | Mean childrenUniqueness of descendants (null for leaves)       |
| `subtree_score`       | REAL          | harmonicMean(subtreeFit, subtreeUniqueness). Null for leaves   |
| `overall_score`       | REAL          | Leaf: score. Container: harmonicMean(score, subtreeScore)      |
| `worst_pair`          | TEXT          | JSON — most similar child pair (null for leaves)               |
| `best_uncle_name`     | TEXT          | Uncle node where this unit fits better                         |
| `best_uncle_score`    | REAL          | Uncle's fit score                                              |

### metadata

Key-value store for snapshot configuration and computed data.

| Column  | Type          | Notes |
| ------- | ------------- | ----- |
| `key`   | TEXT PK       |       |
| `value` | TEXT NOT NULL |       |

Known keys:

| Key                | Value                      | Purpose                                  |
| ------------------ | -------------------------- | ---------------------------------------- |
| `created_at`       | Unix timestamp (ms)        | When the snapshot was generated          |
| `model_id`         | Embedding model identifier | Cache invalidation across model changes  |
| `schema_version`   | Integer                    | Schema version for forward compatibility |
| `axis:<id>`        | JSON number array          | Computed semantic axis vector            |
| `axis-scores:<id>` | JSON                       | Directory scores on a semantic axis      |

## Snapshot Lifecycle

### Generate

1. Parse target path into units (files, types, functions, directories)
2. Load embedding cache from current `active.db` (if exists and model matches)
3. Embed uncached units (7-pass faceted embedding)
4. Rotate current `active.db` to `history/kural-history-<snapshot-id>.db`
5. Create fresh `active.db`, write metadata, parsed units, and scores
6. Evict oldest history snapshot if count exceeds 10

### Cache

On subsequent runs, unchanged units (same `facet_hash`) reuse cached embeddings from the previous `active.db`. This makes incremental runs fast.

Cache key format:

- Leaf units: `type\0<path>\0<name>` or `func\0<path>\0<name>`
- Container units: `file\0<path>` or `dir\0<path>`

Cache is invalidated when:

- `facet_hash` differs (content changed)
- `model_id` differs (embedding model switched)
- No previous `active.db` exists (first run)

### Advise (clone-and-mutate)

1. Copy `active.db` to `advise.db`
2. Run simulation/analysis on the clone
3. Delete `advise.db` when done

The original `active.db` is never modified by advise operations.

## Serialization

| Type                 | Storage format             |
| -------------------- | -------------------------- |
| Booleans             | INTEGER (0/1)              |
| Embeddings           | BLOB (Float32Array binary) |
| String arrays        | JSON TEXT                  |
| Record types         | JSON TEXT                  |
| ResidualEntry arrays | JSON TEXT                  |

## Schema Versioning

- `schema_version` is stored in metadata from day one
- Default evolution is **additive-only** — new nullable columns, no removals or renames
- Old snapshots have NULLs for new columns
- Breaking changes (rare) require a one-time migration
