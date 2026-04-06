# Audit Resolution Reference

Detailed per-audit guidance for resolving kural findings.

---

## Bloating & Size

### bloated-directories

**Detects:** Directories whose children cluster into distinct semantic groups (dendrogram gap analysis). The finding includes the cluster composition.

**Resolution:**

1. Read the cluster composition from the finding's `clusters` field
2. Create subdirectories matching the natural groupings
3. Move children into their respective clusters
4. Write KURAL.md for each new directory following the description principles
5. Update the parent KURAL.md to describe the new boundary

**Suppress when:** The breadth is the intended architecture (e.g., `src/` spanning the full lifecycle).

### bloated-files

**Detects:** Files whose functions/types cluster into semantic groups.

**Resolution:**

1. Read the clusters — ignore type-vs-function splits (those are natural, not actionable)
2. Extract each semantic cluster into its own file
3. Add file-level JSDoc to each new file
4. Update imports across the codebase

**Suppress when:** The file intentionally houses a cohesive set that just happens to be large.

---

## Outliers & Cohesion

### outliers

**Detects:** Children whose mean cosine similarity to siblings is statistically low (MAD-based robust lower fence). The finding shows the unit's mean similarity vs the group mean.

**Resolution options (in order of preference):**

1. **Move it** — find the directory where it has higher sibling similarity
2. **Improve its description** — if it genuinely belongs, sharpen the JSDoc/KURAL.md to explain why. A vague description produces a vague embedding
3. **Extract to utils** — if it's a general-purpose helper, mark `@kuralUtil` and move to the utils directory
4. **Suppress** — only if the placement is intentional and the description is already accurate

**Key insight:** An outlier that is also flagged as misplaced is a strong signal to move it. The `misplaced` audit applies a lenient fence for known outliers.

### merge-candidates

**Detects:** Sibling pairs whose similarity exceeds the upper fence — near-duplicates within the same parent.

**Resolution options:**

1. **Merge** — combine into a single unit if they do the same thing
2. **Differentiate** — if they serve different purposes, rewrite descriptions to create semantic separation. Use exclusivity language
3. **Extract shared logic** — if they share a core but differ at the edges, extract the common part
4. **Mark as pattern** — if the repetition is intentional (e.g., handler functions), add `@kuralPatterns <group>` to both

**Caller-callee pairs are already filtered out** — if a merge-candidate appears, the pair isn't a simple caller-callee relationship.

---

## Containment & Hierarchy

### containments

**Detects:** Parents where one child's dominance gap is an upper outlier — the parent is essentially a wrapper around a single child.

**Resolution options:**

1. **Flatten** — move the dominant child up one level, eliminating the wrapper
2. **Add siblings** — if the parent should exist, add more children to justify it
3. **Mark outward-bound** — if the dominant child IS the purpose of the parent, add `@kuralBound outward` to the child. This suppresses the containment finding on the parent

**The finding shows:** `dominantName`, `dominantSim`, `secondSim` — use the gap between these to judge severity.

### misplaced

**Detects:** Nodes that fit an uncle (sibling directory) better than their own parent, by a statistically significant delta.

**Resolution options:**

1. **Move it** — relocate to the uncle directory that's a better fit
2. **Improve parent description** — if the parent's KURAL.md doesn't capture this child's role, rewriting it may reduce the delta
3. **Improve child description** — sharpen the unit's JSDoc to anchor it to the parent's domain
4. **Suppress** — when the placement is intentional despite semantic distance (e.g., a command that must live near other commands even though it's close to the engine)

**The finding shows:** `uncleFit` vs parent `value` — the delta tells you how much better the uncle fits. Also shows which uncle via `pairKey`.

---

## Cross-Module Duplicates

### duplicates

**Detects:** Semantically identical units separated by module boundaries. Three scan types: cross-file leaves, cross-directory files, and cross-population (util vs domain).

**Resolution options:**

1. **Consolidate** — move one to a shared location and import from there
2. **Differentiate** — if they look similar but serve different domains, rewrite descriptions with exclusivity language
3. **Mark as companions** — if structural coupling is intentional, add `@kuralCompanion <group>` to both
4. **Mark as pattern** — if they follow the same template, add `@kuralPatterns <group>`

**Already filtered out:** @kuralPatterns groups, caller-callee pairs, @kuralCompanion pairs.

### util-duplicates

**Detects:** Util functions/types in separate files exceeding the merge fence.

**Resolution:** Same as `duplicates`, but focused on the util layer. Consider whether two util functions doing similar things should be one function with a parameter.

---

## Vocabulary & Identity

### focal-drift

**Detects:** `@kuralBound outward` nodes that are no longer the most similar child to their parent — another child has overtaken them.

**Resolution options:**

1. **Move the tag** — if the new dominant child IS the file's purpose now, move `@kuralBound outward` to it
2. **Refactor** — if the original focal should still be dominant, trim the overtaking child or move it elsewhere
3. **Split the file** — if both deserve to be focal, they belong in separate files

**The finding shows:** `actualTopName` (the overtaker), `topSim`, `selfSim`.

### vocabulary-bleed

**Detects:** Directories whose KURAL.md description is closer (in embedding space) to a non-sibling module than to their weakest sibling.

**Resolution:**

1. **Rewrite KURAL.md** — this is almost always the fix. The description borrows vocabulary from another module's domain
2. **Identify the borrowed terms** — the finding shows the top 3 non-sibling pulls. Read those modules' KURAL.md to see what vocabulary is being shared
3. **Use exclusive vocabulary** — describe what THIS directory does without naming other modules' concepts. Use abstract terms instead: "the engine" instead of "the scoring pipeline"
4. **Add @kuralBorrows** — if cross-module vocabulary sharing is intentional (e.g., a shell command presenting an engine's output), declare it:
   ```
   @kuralBorrows target/path "role description using this module's vocabulary, not the target's"
   ```

**The finding shows:** `minSiblingSim` (weakest sibling) and `crossPulls` (array of `{path, sim}` for top 3 non-sibling pulls).

### identity-language

**Detects:** KURAL.md descriptions leaning toward "is" (static identity) instead of "does" (dynamic purpose). Measured against the is-does axis.

**Resolution:**

1. **Rewrite with active verbs** — change "The configuration module" to "Loads, validates, and merges configuration from disk and CLI overrides"
2. **Lead with what it does, not what it is** — "Persists and retrieves all application state" beats "The database layer"
3. **Keep the metaphor** — the one-word metaphor ("The brain", "The memory") is fine as an anchor, but the rest of the description should be active

---

## Documentation & Coherence

### incoherent / incoherent-utils

**Detects:** Containers whose name/description diverges from actual content. The identity embedding and content embedding point in different directions.

**Resolution options:**

1. **Rename** — if the name is misleading, rename the file/directory to match what it actually contains
2. **Rewrite description** — if the name is fine but the description is stale or generic
3. **Restructure** — if the content has drifted from the original purpose, move mismatched children out

**The finding shows:** identity-content similarity score. Lower = worse mismatch.

### weak-identity

**Detects:** Containers where >50% of children fit a sibling module better than their own parent.

**Resolution options:**

1. **Restructure** — move drifting children to their better-fitting uncle
2. **Rewrite KURAL.md** — if the directory's description doesn't capture what most children actually do
3. **Split** — if the directory has genuinely diverged into two concerns, split it

**The finding shows:** `driftCount`/`childCount` (how many drift), `pairKey` (strongest competing uncle), parent fit vs uncle fit.

### incomplete-docs

**Detects:** Units missing required documentation. Deterministic checklist, no statistical fence.

**Required by kind:**

- **Functions:** description, `@param` for each parameter, `@returns` (non-void), `@kuralPure` or `@kuralCauses`
- **Types:** description
- **Files:** file-level JSDoc with description
- **Directories:** KURAL.md with description content

**Resolution:** Add the missing items. The finding's `missing` array lists exactly what's needed.

**For @kuralPure vs @kuralCauses:**

- `@kuralPure` — function has no side effects (pure computation)
- `@kuralCauses <description>` — describes what the function does beyond its type signature (e.g., "writes score data to the snapshot database")

---

## Suppression Reference

### Format

**In JSDoc (functions, types, files):**

```typescript
/**
 * Description of the unit.
 * @kuralResidual <audit-name> [<hash>]
 */
```

**In KURAL.md (directories):**

```markdown
The metaphor. Description of the directory's purpose.
@kuralResidual <audit-name> [<hash>]
```

### Hash behavior

- **With hash** `[abc123]` — suppression is tied to current code. Breaks when code changes, forcing re-evaluation
- **Without hash** — permanent suppression. Use sparingly

### When to suppress

- The finding is architecturally intentional and documented
- Moving the code would break a more important organizational principle
- The module intentionally borrows vocabulary (use `@kuralBorrows` instead for vocabulary-bleed)

### When NOT to suppress

- To avoid writing documentation (fix incomplete-docs instead)
- To avoid restructuring (fix the structure)
- When you haven't read the code to confirm the finding is intentional
