/**
 * Extracts unit embeddings from the active snapshot database,
 * builds a navigable tree, and computes per-level 3D positions via PCA.
 */

import BetterSqlite3 from "better-sqlite3";
import { writeFileSync, mkdirSync } from "node:fs";
import { relative, dirname, sep } from "node:path";

const PROJECT_ROOT = "/Users/harshinivignesh/Documents/projects/kural-2";
const DB_PATH = `${PROJECT_ROOT}/.kural-db/feat/new-audits/active.db`;
const OUTPUT_PATH = `${PROJECT_ROOT}/docs-site/src/data/embeddings.json`;

const COLLECTIONS = {
  files: { table: "c_7ooqeq_5", kind: "file" },
  types: { table: "c_d76bre2_5", kind: "type" },
  functions: { table: "c_bcuuqko_9", kind: "func" },
  directories: { table: "c_b7xiuu4_b", kind: "dir" },
};
const SCORES_TABLE = "c_ddocgqs_6";

const db = new BetterSqlite3(DB_PATH, { readonly: true });

// ── Load all units ──
const allUnits = [];
const scoreMap = new Map();

const scoreRows = db.prepare(`SELECT key, value FROM ${SCORES_TABLE}`).all();
for (const row of scoreRows) {
  const data = JSON.parse(row.value);
  scoreMap.set(data.key, data);
}

for (const [, { table, kind }] of Object.entries(COLLECTIONS)) {
  const rows = db.prepare(`SELECT key, value FROM ${table}`).all();
  for (const row of rows) {
    const data = JSON.parse(row.value);
    const embedding = data.identityEmbedding;
    if (!embedding || embedding.length === 0) continue;

    const relPath = relative(PROJECT_ROOT + "/src", data.path);
    const scoreKey =
      kind === "file" || kind === "dir"
        ? `${kind}:${data.path}`
        : `${kind}:${data.path}:${data.name}`;
    const score = scoreMap.get(scoreKey);

    allUnits.push({
      name: data.name,
      path: relPath,
      kind,
      description: (data.description || "").substring(0, 120),
      embedding,
      score: score?.overallScore ?? null,
    });
  }
}
db.close();

console.log(`Extracted ${allUnits.length} units`);

// ── Build tree ──
// Each tree node represents a "level" you can navigate into.
// Directories are navigable. Files contain their types/functions as children.

function buildTree(units) {
  // Group units by their parent path
  // For dirs/files: parent is the directory part of path
  // For types/funcs: parent is their file path

  // Find the root directory (path === "")
  const rootUnit = units.find((u) => u.kind === "dir" && u.path === "");

  const tree = {
    id: "src",
    name: "src",
    kind: "dir",
    path: "",
    description: rootUnit?.description || "Root source directory",
    score: rootUnit?.score ?? null,
    embedding: rootUnit?.embedding,
    children: [],
  };

  const dirMap = new Map();
  dirMap.set("", tree);

  // First pass: create directory nodes (skip root, already created)
  for (const u of units) {
    if (u.kind !== "dir" || u.path === "") continue;
    const node = {
      id: u.path,
      name: u.name,
      kind: "dir",
      path: u.path,
      description: u.description,
      score: u.score,
      embedding: u.embedding,
      children: [],
    };
    dirMap.set(u.path, node);
  }

  // Wire directory hierarchy
  for (const u of units) {
    if (u.kind !== "dir" || u.path === "") continue;
    const parts = u.path.split("/");
    const parentPath = parts.slice(0, -1).join("/");
    const parent = dirMap.get(parentPath);
    if (parent) {
      parent.children.push(dirMap.get(u.path));
    }
  }

  // Second pass: add files to their parent directory
  const fileMap = new Map();
  for (const u of units) {
    if (u.kind !== "file") continue;
    const parts = u.path.split("/");
    const parentPath = parts.slice(0, -1).join("/");
    const node = {
      id: u.path,
      name: u.name,
      kind: "file",
      path: u.path,
      description: u.description,
      score: u.score,
      embedding: u.embedding,
      children: [],
    };
    fileMap.set(u.path, node);
    const parent = dirMap.get(parentPath);
    if (parent) {
      parent.children.push(node);
    }
  }

  // Third pass: add functions and types to their parent file
  for (const u of units) {
    if (u.kind !== "func" && u.kind !== "type") continue;
    // The path for funcs/types is the file path
    const fileNode = fileMap.get(u.path);
    const node = {
      id: `${u.path}:${u.name}`,
      name: u.name,
      kind: u.kind,
      path: u.path,
      description: u.description,
      score: u.score,
      embedding: u.embedding,
      children: [],
    };
    if (fileNode) {
      fileNode.children.push(node);
    }
  }

  return tree;
}

const tree = buildTree(allUnits);

// ── PCA per level ──
function pca3D(vectors) {
  const n = vectors.length;
  if (n === 0) return [];
  if (n === 1) return [[0, 0, 0]];
  if (n === 2) return [[-0.5, 0, 0], [0.5, 0, 0]];

  const d = vectors[0].length;
  const mean = new Float64Array(d);
  for (const v of vectors) {
    for (let i = 0; i < d; i++) mean[i] += v[i];
  }
  for (let i = 0; i < d; i++) mean[i] /= n;

  const centered = vectors.map((v) => v.map((x, i) => x - mean[i]));

  const gram = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let dot = 0;
      for (let k = 0; k < d; k++) dot += centered[i][k] * centered[j][k];
      gram[i][j] = dot / n;
      gram[j][i] = dot / n;
    }
  }

  const eigenVectors = [];
  const gramCopy = gram.map((row) => Float64Array.from(row));

  for (let pc = 0; pc < Math.min(3, n); pc++) {
    let v = new Float64Array(n);
    for (let i = 0; i < n; i++) v[i] = Math.random() - 0.5;
    let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    for (let i = 0; i < n; i++) v[i] /= norm;

    for (let iter = 0; iter < 200; iter++) {
      const next = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) sum += gramCopy[i][j] * v[j];
        next[i] = sum;
      }
      norm = Math.sqrt(next.reduce((s, x) => s + x * x, 0));
      if (norm === 0) break;
      for (let i = 0; i < n; i++) next[i] /= norm;
      v = next;
    }

    eigenVectors.push(v);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        gramCopy[i][j] -= norm * v[i] * v[j];
      }
    }
  }

  // Pad if we got fewer than 3 eigenvectors
  while (eigenVectors.length < 3) {
    eigenVectors.push(new Float64Array(n));
  }

  const positions = [];
  for (let i = 0; i < n; i++) {
    positions.push([eigenVectors[0][i], eigenVectors[1][i], eigenVectors[2][i]]);
  }

  // Normalize to [-1, 1]
  for (let axis = 0; axis < 3; axis++) {
    let min = Infinity, max = -Infinity;
    for (const p of positions) {
      if (p[axis] < min) min = p[axis];
      if (p[axis] > max) max = p[axis];
    }
    const range = max - min || 1;
    for (const p of positions) {
      p[axis] = ((p[axis] - min) / range) * 2 - 1;
    }
  }

  return positions;
}

// Recursively compute positions for each level
function computePositions(node) {
  if (!node.children || node.children.length === 0) return;

  const embeddings = node.children
    .filter((c) => c.embedding)
    .map((c) => c.embedding);

  if (embeddings.length > 0) {
    const positions = pca3D(embeddings);
    let posIdx = 0;
    for (const child of node.children) {
      if (child.embedding) {
        child.position = positions[posIdx].map((v) => Math.round(v * 1000) / 1000);
        posIdx++;
      }
    }
  }

  // Recurse
  for (const child of node.children) {
    computePositions(child);
  }
}

computePositions(tree);

// ── Strip embeddings for output (they're huge) ──
function stripEmbeddings(node) {
  const { embedding, ...rest } = node;
  if (rest.children) {
    rest.children = rest.children.map(stripEmbeddings);
  }
  return rest;
}

const output = stripEmbeddings(tree);

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

// Count total nodes
function countNodes(n) {
  let c = 1;
  if (n.children) for (const ch of n.children) c += countNodes(ch);
  return c;
}
console.log(`Wrote tree with ${countNodes(output)} nodes to ${OUTPUT_PATH}`);
