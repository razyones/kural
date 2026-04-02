---
title: Lint Rules
description: Reference for oxlint type-aware rules used by vp check
---

`vp check` runs oxlint with type-aware rules. The error messages are terse — this document explains what each rule actually means and how to fix it.

---

## Import ordering (`eslint(sort-imports)`)

Imports are ordered by **member count first**, then **alphabetically by first specifier name** (ASCII order: uppercase before lowercase).

1. **Multiple-member imports first:** `import { a, b } from '...'` before `import { c } from '...'`
2. **Within each group, sort alphabetically by the first imported name** (not the module path). ASCII order means `A-Z` before `a-z`: `DB_TRUE` < `ParseResult` < `createClient` < `initDb`.
3. **`import type` counts the same as `import`** for member-count grouping. `import type { Client }` is single, `import type { Client, Row }` is multiple.
4. **`import type` and `import` are freely interleaved** within each member-count group — they are not separated. Sort purely by first specifier name regardless of whether the import is a type or value.
5. **ASCII comparison is character-by-character.** Names sharing a prefix but differing in case mid-word sort by the first differing character: `AXES` < `AxisCache` because at position 2, `E` (69) < `i` (105).
6. **Aliases use the local name for sorting.** `import { cosineSimilarity as similarity }` sorts by `similarity` (`s`), not `cosineSimilarity` (`c`).

```typescript
// CORRECT — multiples first, then singles sorted by first specifier
// Note: import type and import are interleaved, not separated
import type { KuralFile, KuralFunction } from "../parse/types.ts";
import { describe, expect, it } from "vite-plus/test";
import { AXES } from "../config/axis-anchors.ts";
import type { AxisCache } from "../db/cache.ts";
import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client";
import { initDb } from "./schema.ts";
```

---

## No magic numbers (`eslint(no-magic-numbers)`)

Every numeric literal must be a named constant — including `0`, `1`, and values inside array literals.

```typescript
// BAD
const arr = [0.1, 0.2, 0.3];
if (items.length === 0) { ... }

// GOOD
const EMB_X = 0.1;
const EMB_Y = 0.2;
const EMB_Z = 0.3;
const arr = [EMB_X, EMB_Y, EMB_Z];
const NONE = 0;
if (items.length === NONE) { ... }
```

---

## No unsafe type assertions (`typescript-eslint(no-unsafe-type-assertion)`)

**Do not use `as T` to narrow from `any` or to a narrower type.** This fires on:

- `JSON.parse(text) as string[]` — narrowing from `any`
- `row as unknown as FileRow` — narrowing through `unknown`
- `parsed as Record<string, unknown>` — narrowing from `object`

**Fix for `JSON.parse`:** Create typed wrapper functions that use the return type signature (no `as` keyword) and validate at runtime:

```typescript
// BAD
const arr = JSON.parse(text) as string[];

// GOOD — return type does the work, runtime validates
function parseJsonStrings(text: string): string[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === "string");
}
```

**Fix for DB row access:** Use typed accessor functions with runtime narrowing instead of casting entire row objects:

```typescript
// BAD
const r = row as unknown as FileRow;

// GOOD — narrow each field individually
function str(row: Row, key: string): string {
  const val = row[key];
  return typeof val === "string" ? val : "";
}
```

---

## No unsafe return (`typescript-eslint(no-unsafe-return)`)

Returning `JSON.parse(text)` directly from a typed function is flagged because `JSON.parse` returns `any`. Assign to `unknown` first and validate:

```typescript
// BAD — returns any
function parse(text: string): string[] {
  return JSON.parse(text);
}

// GOOD — validates through unknown
function parse(text: string): string[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === "string");
}
```

---

## No base to string (`typescript-eslint(no-base-to-string)`)

`String(val)` where `val` could be `ArrayBuffer` produces `[object ArrayBuffer]`. Narrow the type first:

```typescript
// BAD — val is string | number | ArrayBuffer | null
String(val);

// GOOD
typeof val === "string" ? val : "";
```

---

## Require await (`eslint(require-await)` / `typescript-eslint(require-await)`)

An `async` function with no `await` expression. Either remove `async` or add an `await`. This applies to both source and test files.

---

## Max lines per function (`eslint(max-lines-per-function)`)

Functions (including test `describe` blocks) cannot exceed 50 lines. Split large test suites into multiple `describe` blocks and extract helper functions.

---

## Boolean to integer for SQLite

SQLite has no boolean type. Use a named helper instead of inline ternaries:

```typescript
// BAD — magic numbers 1 and 0
type.exported ? 1 : 0;

// GOOD
const DB_TRUE = 1;
const DB_FALSE = 0;
function boolToInt(value: boolean): number {
  return value ? DB_TRUE : DB_FALSE;
}
boolToInt(type.exported);
```
