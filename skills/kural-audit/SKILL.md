---
name: kural-audit
description: Study kural audit findings and resolve structural issues. Use when the user wants to understand, investigate, or fix findings from kural audit — outliers, duplicates, misplaced code, vocabulary bleed, bloat, incomplete docs, containment, incoherence, or any other structural diagnostic.
argument-hint: [audit-name or path]
---

## Resolve Audit

Help the user study and resolve kural audit findings. Kural detects structural issues in TypeScript codebases — misplaced code, duplicates, poor naming, vocabulary bleed, missing docs, and more.

### Arguments

`$ARGUMENTS` is an optional filter:

- **Audit name** (e.g., `outliers`, `misplaced`, `vocabulary-bleed`) — focus on that audit type
- **Path** (e.g., `src/analysis`) — focus on findings affecting that subtree
- **Empty** — run the full audit and summarize everything

### Workflow

#### 1. Establish Baseline and Run the Audit

First, check the current score and pin it as a baseline before making any changes:

```
node dist/cli.mjs score
node dist/cli.mjs snapshot pin <snapshot-id> <milestone-name>
```

Pin at meaningful milestones — release versions (`0.1.0`), before major refactors (`pre-refactor`), or before audit resolution sessions (`pre-audit-fix`). This creates a named checkpoint to compare against throughout the fix cycle.

Then run the audit with JSON output to get structured findings:

```
node dist/cli.mjs audit --json --expand
```

If `$ARGUMENTS` matches an audit name, add `--filter $ARGUMENTS`.

If the audit fails with no snapshot, tell the user to generate one first:

```
node dist/cli.mjs snapshot generate <path>
```

#### 2. Study the Findings

For **each** finding:

1. **Read the flagged code** — open the file at the flagged unit's location
2. **Read the surrounding context** — parent module, siblings, any KURAL.md in the directory
3. **Assess severity** — is this a real structural problem, a documentation gap, or an intentional design choice?

Present a summary grouped by audit type. For each finding, include:

- The unit name and location
- What the audit detected (in plain language, not just metric numbers)
- Your assessment: **real issue**, **documentation gap**, **likely intentional**, or **needs investigation**

#### 3. Resolve — The Four Phases

Audit resolution follows a strict sequential pipeline. Each phase requires a re-snapshot and re-audit before proceeding to the next, because earlier fixes change embeddings and can resolve downstream findings.

**Phase 1: Fix incomplete docs**
Always first. Descriptions carry 50% weight in the identity vector. Missing docs produce incomplete embeddings, which cause false positives across every other audit. Many outlier, misplaced, merge-candidate, and incoherent findings will vanish once embeddings are computed from complete information.

- Add missing JSDoc tags: description, `@param` for each parameter, `@returns` (non-void), `@kuralPure` or `@kuralCauses`
- Add missing type descriptions
- Add missing file-level JSDoc
- Add missing KURAL.md descriptions for directories

After fixing: re-snapshot, compare scores (`-c <baseline>`), then re-audit. Proceed to Phase 2 only if scores held or improved and with the new findings.

**Phase 2: Fix documentation quality**
Descriptions exist now, but may use wrong voice, borrow sibling vocabulary, or mismatch content. Fixing these is cheaper than structural changes and still cascades through the embedding space.

- `vocabulary-bleed` — Rewrite KURAL.md using vocabulary exclusive to this module's domain. Never borrow sibling or cousin vocabulary. Use `@kuralBorrows` only if cross-module vocabulary is intentional
- `incoherent` / `incoherent-utils` — Rename the unit or rewrite its description to match actual content

After fixing: re-snapshot, compare scores (`-c <baseline>`), then re-audit. Proceed to Phase 3 only if scores held or improved and with the new findings.

**Phase 3: Fix structural issues**
Only now can you trust what the audits report. Persistent findings reflect genuine structural problems, not documentation gaps.

- `outliers` — Move to a better-fitting parent, or extract to utils with `@kuralUtil`
- `misplaced` — Move to the uncle directory that's a better fit
- `merge-candidates` — Merge near-duplicates, or differentiate descriptions if they serve different purposes
- `duplicates` / `util-duplicates` — Consolidate into one location
- `bloated-directories` / `bloated-files` — Split along the cluster boundaries shown in the finding
- `containments` — Flatten the wrapper, or add `@kuralBound outward` if dominance is intentional
- `focal-drift` — Move `@kuralBound outward` to the actual dominant child, or refactor to restore the original focal
- `weak-identity` — Restructure directory children or rewrite KURAL.md to establish clearer ownership

After fixing: re-snapshot, compare scores (`-c <baseline>`), then re-audit. Proceed to Phase 4 only if scores held or improved and with the new findings.

**Phase 4: Suppress with @kuralResidual**
Last resort. Suppression acknowledges a finding without resolving the underlying issue. Only valid after reading the code and confirming the finding is architecturally intentional — a deliberate design choice that should not change.

- Add `@kuralResidual <audit-name> [<hash>]` to the unit's JSDoc or KURAL.md
- Use the `hash` field from the finding — ties suppression to current code, breaks when code changes

See [reference.md](reference.md) for detailed per-audit resolution guidance.

### Scoring — The Ground Truth

Scores are the ultimate measure of structural quality. Audits are named paths to improve scores — each finding identifies a pattern that, when fixed, should push the score higher. Always validate fixes with scores.

**Score dimensions (each -1…1):**

- **Self (fit)** — how well a node belongs under its parent
- **Children** — how coherent a container's direct children are
- **Subtree** — recursive health of everything below
- **Overall** — harmonic mean of Self and Subtree

**The feedback loop:**

1. **Baseline** — check current score before fixing: `node dist/cli.mjs score`
2. **Fix** — apply the four-phase pipeline
3. **Re-snapshot** — `node dist/cli.mjs snapshot generate <path>`
4. **Compare** — `node dist/cli.mjs score -c <baseline-id-or-pin>` — did the score go up?

If the score improves, the fix helped. If it drops, the fix introduced a new problem — check what new audit finding appeared. Chain fixes until scores improve and audits clear.

**Pinned snapshots as baselines:**
Pin a snapshot to create a named baseline: `node dist/cli.mjs snapshot pin <id> <name>`. Then compare against it by name: `node dist/cli.mjs score -c <name>`. Each release or milestone should pin a baseline.

**Score commands:**

- `node dist/cli.mjs score` — overall score
- `node dist/cli.mjs score -e` — detailed breakdown table (default 20 rows)
- `node dist/cli.mjs score -e -l 0` — show all rows
- `node dist/cli.mjs score -p <path>` — filter to a specific subtree
- `node dist/cli.mjs score -c <id-or-pin>` — compare against a previous snapshot with deltas
- `node dist/cli.mjs score -e -p <path> -c <id-or-pin>` — detailed subtree comparison

**Reading deltas:** After comparison, each score shows a delta (e.g., `0.92 ▸ +0.03`). Positive deltas mean improvement. Negative deltas mean regression — investigate what changed.

### Description Principles

Every unit's description — directory KURAL.md, file-level JSDoc, function JSDoc, and type JSDoc — is embedded and carries **50% weight** in the identity vector. Description quality directly affects scoring accuracy. The same principles apply at every level.

1. **Describe what only THIS unit does, in its own vocabulary.** Use exclusivity language: "It is the only module that...", "Nothing else in the system...". This creates semantic separation between siblings.
2. **Never borrow sibling or cousin module vocabulary.** Naming other modules' concepts (e.g., "embedding providers" in config, "parse-embed-store pipeline" in a command) pulls the description toward those modules in embedding space. Use abstract terms instead: "provider selection", "the engine". The vocabulary bleed audit catches this automatically.
3. **Anchor identity with a metaphor.** Lead with a one-word role ("The brain", "The memory", "The toolbox") that captures the unit's irreplaceable character in the system. Most impactful for directories and files; optional for individual functions and types.
4. **Describe the role in the system, not a generic job.** "Persists and retrieves all application state in a local database" is better than "SQLite database schema and operations" — the former says what makes it unique here, the latter describes any database module anywhere. For functions: "Persists computed health metrics so downstream commands can query scores without re-running the pipeline" is better than "Writes score cards to the snapshot."
5. **For folder-level descriptions, combine children's identities.** A parent folder's KURAL.md should describe the shared boundary its children own, not repeat their individual descriptions. Example: "The reader and translator — turns source files into numerical vectors" combines parse and embed's roles.

### Kural Params

Params are JSDoc annotations that declare structural realities the vector space can't capture. They directly affect which audits fire and how scores compute.

| Param                         | Role in scoring                                                 |
| :---------------------------- | :-------------------------------------------------------------- |
| `@kuralHelper`                | Participates in scoring, excluded from audits except duplicates |
| `@kuralUtil`                  | Excluded from domain scoring, scored in own sandbox             |
| `@kuralPatterns`              | Deduplicated to centroid representative                         |
| `@kuralCompanion`             | Deduplicated to centroid representative                         |
| `@kuralResidual`              | No role in scoring, audit suppression only                      |
| `@kuralBound inward/outward`  | Adjusted scoring + selective audit suppression                  |
| `@kuralBorrows target "role"` | Instruction prefix for name/desc embedding + audit exclusion    |
| `@kuralPure` / `@kuralCauses` | Influences what gets embedded, not how scores compute           |

#### `@kuralBorrows` — Cross-Layer Vocabulary Borrowing

A KURAL.md directive for directories that intentionally share vocabulary with a non-sibling module (e.g., a shell command that presents an analysis engine's output).

**Format:**

```markdown
The consultant's desk. Parses directory targets and display flags...
@kuralBorrows analysis/advise "terminal surface that formats and renders engine output as diagrams and tables"
```

- **Target path** (optional): relative path like `analysis/advise` — excludes that module from the vocabulary bleed audit's cross-pull comparison.
- **Quoted role** (required): natural-language description of the borrower's role — used as an instruction prefix when embedding the directory's name and description.

**How it works:**

1. **Embedding pipeline**: The role text is prepended to both the name and description before embedding. Instead of embedding `"advise"`, the system embeds `"terminal surface that formats and renders engine output as diagrams and tables: advise"`. This contextualizes shared vocabulary through the attention mechanism — "advise" in a display context encodes differently from "advise" in a computation context.
2. **Vocabulary bleed audit**: If a target path is declared, the audit skips that module when computing cross-pulls, since the overlap is intentional.

**Principles for writing the role text:**

1. **Describe the borrower's role, not the target's domain.** "terminal surface that formats and renders engine output as diagrams and tables" describes what the shell module does. "presentation layer for the directory advice engine" names the analysis module's domain, which pulls embeddings toward it.
2. **Describe the role in this system, not a generic job.** "formats and renders engine output as diagrams and tables" is specific to this module. "renders output" is generic and provides weak separation.
3. **Never use the target module's vocabulary.** The same rule as descriptions — borrowed terms in the role text increase cross-pull instead of reducing it.

### Rules

1. **Always read the code before proposing fixes.** Never suggest changes based solely on finding metadata.

2. **Follow the four phases in order.** Do not jump to structural changes before fixing docs. Do not suppress before attempting structural fixes.

3. **Re-snapshot, compare scores, and re-audit between phases.** Earlier fixes change embeddings. Compare scores against the pinned baseline (`-c <pin-name>`) to confirm improvement. Findings that persist through doc fixes are real; findings that vanish were false positives from incomplete information.

4. **Scores are the ground truth, audits are the roadmap.** A fix that clears an audit finding but drops the score introduced a new problem. A fix that improves the score is correct even if new audit findings appear — chain the fixes.

5. **Include the hash when suppressing.** Format: `@kuralResidual <audit-name> [<hash>]` — take the hash from the finding's `hash` field.

6. **Unpin temporary baselines when done.** Pinned snapshots are never auto-evicted. After a resolution session, unpin working baselines (`node dist/cli.mjs snapshot unpin <name>`) to avoid accumulating stale snapshots. Keep only release milestones pinned.

7. **Run `vp check` after code changes** to validate formatting, linting, and types.
