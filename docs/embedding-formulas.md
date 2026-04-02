---
title: Embedding Formulas
description: Faceted blending reference for the embedding pipeline
---

The embedding pipeline produces two vectors per unit (identity and leaf) by embedding individual **facets** separately and blending them at fixed weights. **Signals** are weighted modifiers that nudge a facet toward the right semantic context before blending.

---

## 1. Concepts

### Facets

Core semantic components that are embedded independently and then combined. Each facet captures a distinct aspect of a unit's meaning.

| Facet           | What it captures                      | Source                        |
| :-------------- | :------------------------------------ | :---------------------------- |
| **Name**        | What the unit is called               | AST identifier                |
| **Description** | What the unit claims to be            | JSDoc comment or KURAL.md     |
| **Signature**   | What the unit structurally looks like | Fields, params, returns, etc. |

### Signals

Weighted modifiers applied to a facet before blending. They steer a facet toward the correct semantic neighborhood without standing on their own.

| Signal     | Target facet | Weight      | Source                            |
| :--------- | :----------- | :---------- | :-------------------------------- |
| **Path**   | Name         | 0.3         | Filesystem path + domain keywords |
| **Parent** | Description  | 0.3         | Parent file's JSDoc description   |
| **Causes** | Signature    | 0.3 or 0.25 | `@kuralCauses` description        |
| **Calls**  | Signature    | 0.3 or 0.15 | Call-graph function names         |

---

## 2. Formulas

### Name facet (with path signal)

```
nameFacet = 0.7 × emb(name) + 0.3 × emb(path)
```

The path signal grounds the name in its filesystem context. `parse` under `ingestion/` means something different from `parse` under `cli/`.

### Description facet (with parent signal)

For **leaf units** (types, functions) whose parent file has a description:

```
descFacet = 0.7 × emb(description) + 0.3 × emb(parentDescription)
```

For **container units** (files, directories) or when parent has no description:

```
descFacet = emb(description)
```

The parent signal anchors leaf descriptions in their parent file's unique identity, preventing shared domain vocabulary from pulling unrelated children together.

### Identity embedding

```
identity = 0.5 × nameFacet + 0.5 × descFacet
```

Captures what the unit **claims to be**. Never includes structural details or children.

### Signature facet (with causes and calls signals)

When **neither** signal is present:

```
signatureFacet = emb(signature)
```

When only **causes** is present (impure function, no outbound calls):

```
signatureFacet = 0.7 × emb(signature) + 0.3 × emb(causesDescription)
```

When only **calls** is present (function with outbound calls, no causes):

```
signatureFacet = 0.7 × emb(signature) + 0.3 × emb(callGraph)
```

When **both** are present (impure function with outbound calls):

```
signatureFacet = 0.6 × emb(signature) + 0.25 × emb(causesDescription) + 0.15 × emb(callGraph)
```

Causes captures what side effects a function produces. Calls captures what behavioral neighborhood it operates in. Both are only applied when present — pure functions with no outbound calls use the raw signature.

### Leaf embedding

```
leaf = 0.5 × identity + 0.5 × signatureFacet
```

Captures what the unit **actually is**. This is what gets contributed upward in the tree and used for structural comparison.

---

## 3. Path Signal Construction

The path signal uses the top 3 domain keywords (auto-selected from config by cosine similarity to all unit names in the codebase).

| Unit position           | Path signal format                          | Example                          |
| :---------------------- | :------------------------------------------ | :------------------------------- |
| **Root** (e.g., `src/`) | `keyword1-keyword2-keyword3/`               | `code-structure-scoring/`        |
| **All other units**     | `keyword1/keyword2/keyword3/ancestor/path/` | `code/structure/scoring/models/` |

The root has no filesystem ancestry, so domain keywords alone set the context. For other units, the path includes ancestors but strips the unit's own name — it tells you _where_ you are without repeating _who_ you are.

---

## 4. Signature Formats

### Structural signatures (fallback)

Used when Language Service symbol info is unavailable.

| Unit          | Format                                      |
| :------------ | :------------------------------------------ |
| **Type**      | `fields: name (type), ...`                  |
| **Function**  | `params: name (type), ... \| returns: type` |
| **File**      | `exports: Name, ...`                        |
| **Directory** | `children: name, ...`                       |

### Prose signatures (primary)

When Language Service `SymbolDisplayPart[]` data is available, signatures are generated as natural language using rule-based prose generation:

- Primitive types mapped to natural language: `string` → "text", `number` → "a number", `void` → "nothing"
- Domain-specific types wrapped as dictionary references: `[KuralFile]`
- Dictionary definitions appended as link-style references:

```
takes file ([KuralFile]), count (a number). Returns nothing.

[KuralFile]: a source file with functions and types
```

---

## 5. Domain Keywords

Provided in config as a list. The top 3 most relevant are auto-selected:

1. Embed all unit names in the codebase
2. Embed all candidate domain keywords
3. Score each keyword by aggregate cosine similarity to all names
4. Select top 3 by descending score

These 3 keywords are used to construct every path signal.

---

## 6. Dictionary

A `Record<string, string>` in config mapping codebase-specific terms to their definitions. Used by the prose signature generator to ground opaque domain terms that the embedding model has no context for.

```typescript
{
  "Kural": "structural scoring system for code placement",
  "KuralFile": "a source file containing functions and types",
  "SOST": "silhouette-based structural scoring algorithm"
}
```

---

## 7. Embedding Call Count

| Scenario                          | Embedder calls | Facets embedded                    |
| :-------------------------------- | :------------- | :--------------------------------- |
| Base (no optional signals)        | 4              | name, description, signature, path |
| + impure functions                | +1             | causes                             |
| + functions with outbound calls   | +1             | calls                              |
| + leaves with parent descriptions | +1             | parent context                     |

Causes, calls, and parent descriptions are embedded selectively — only non-empty texts are sent to the embedder. Units without a signal receive empty vectors, and `applySignatureSignals` returns their signature unchanged.
