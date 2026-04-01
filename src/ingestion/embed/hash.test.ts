import type { ContainerData, LeafData } from "./collect.ts";
import { describe, expect, it } from "vite-plus/test";
import type { EmbeddingCache } from "./types.ts";
import type { KuralUnit } from "../parse/types.ts";
import { createHash } from "node:crypto";
import { resolveCache } from "./hash.ts";

const ZERO = 0;
const ONE = 1;
const TWO = 2;
const THREE = 3;
const SEP = "\0";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function makeUnit(name: string, path: string, extra?: Record<string, unknown>): KuralUnit {
  return { name, path, identityEmbedding: [], leafEmbedding: [], ...extra } as KuralUnit;
}

function makeLeafData(unit: KuralUnit): LeafData {
  return {
    names: [unit.name],
    descs: ["leaf-desc"],
    parentDescs: ["parent-desc"],
    paths: [unit.path],
    sigs: ["sig-text"],
    causes: ["causes-text"],
    calls: ["calls-text"],
    units: [unit],
    fileChildIndices: new Map<string, number[]>(),
    patternIds: [undefined],
  };
}

const EMPTY_LEAVES: LeafData = {
  names: [],
  descs: [],
  parentDescs: [],
  paths: [],
  sigs: [],
  causes: [],
  calls: [],
  units: [],
  fileChildIndices: new Map<string, number[]>(),
  patternIds: [],
};

function makeContainerData(
  units: KuralUnit[],
  unitPaths: string[],
  fileCount: number,
): ContainerData {
  return {
    names: units.map((u) => u.name),
    descs: units.map(() => "container-desc"),
    paths: units.map((u) => u.path),
    units,
    unitPaths,
    fileCount,
    dirs: [],
  };
}

function leafHash(leaves: LeafData, index: number): string {
  const parts = [
    leaves.names[index],
    leaves.descs[index],
    leaves.parentDescs[index],
    leaves.paths[index],
    leaves.sigs[index],
    leaves.causes[index],
    leaves.calls[index],
  ];
  return sha256(parts.join(SEP));
}

function containerHash(containers: ContainerData, index: number): string {
  return sha256(
    [containers.names[index], containers.descs[index], containers.paths[index]].join(SEP),
  );
}

describe("resolveCache without cache — leaf units", () => {
  it("sets facetHash and returns all as uncached", () => {
    const unit = makeUnit("myType", "/src/foo.ts");
    const leaves = makeLeafData(unit);
    const containers = makeContainerData([], [], ZERO);
    const result = resolveCache(leaves, containers);

    expect(unit.facetHash).toBe(leafHash(leaves, ZERO));
    expect(result.cachedLeaves.size).toBe(ZERO);
    expect(result.cacheHits).toBe(ZERO);
    expect(result.uLeaf).toEqual([ZERO]);
  });

  it("assigns distinct hashes to multiple units", () => {
    const unitA = makeUnit("alpha", "/src/a.ts");
    const unitB = makeUnit("beta", "/src/b.ts");
    const leaves: LeafData = {
      names: ["alpha", "beta"],
      descs: ["dA", "dB"],
      parentDescs: ["pA", "pB"],
      paths: ["/src/a.ts", "/src/b.ts"],
      sigs: ["sA", "sB"],
      causes: ["cA", "cB"],
      calls: ["clA", "clB"],
      units: [unitA, unitB],
      fileChildIndices: new Map<string, number[]>(),
      patternIds: [undefined, undefined],
    };
    resolveCache(leaves, makeContainerData([], [], ZERO));
    expect(unitA.facetHash).not.toBe(unitB.facetHash);
  });
});

describe("resolveCache without cache — container units", () => {
  it("sets facetHash and returns all as uncached", () => {
    const file = makeUnit("file.ts", "/src/file.ts");
    const dir = makeUnit("utils", "/src/utils");
    const containers = makeContainerData([file, dir], ["/src/file.ts", "/src/utils"], ONE);
    const result = resolveCache(EMPTY_LEAVES, containers);

    expect(file.facetHash).toBe(containerHash(containers, ZERO));
    expect(dir.facetHash).toBe(containerHash(containers, ONE));
    expect(result.cacheHits).toBe(ZERO);
    expect(result.uCont).toEqual([ZERO, ONE]);
  });
});

describe("resolveCache with matching leaf cache", () => {
  it("copies embeddings from cache when hash matches", () => {
    const unit = makeUnit("myType", "/src/foo.ts");
    const leaves = makeLeafData(unit);
    const containers = makeContainerData([], [], ZERO);
    const hash = leafHash(leaves, ZERO);
    const cached = [ONE, TWO];
    const cachedL = [TWO, ONE];
    const key = `type${SEP}/src/foo.ts${SEP}myType`;
    const cache: EmbeddingCache = new Map([
      [key, { facetHash: hash, identityEmbedding: cached, leafEmbedding: cachedL }],
    ]);
    const result = resolveCache(leaves, containers, cache);

    expect(result.cachedLeaves.has(ZERO)).toBe(true);
    expect(result.cacheHits).toBe(ONE);
    expect(unit.identityEmbedding).toEqual(cached);
    expect(unit.leafEmbedding).toEqual(cachedL);
  });
});

describe("resolveCache with matching container cache", () => {
  it("copies embeddings from cache when hash matches", () => {
    const file = makeUnit("file.ts", "/src/file.ts");
    const containers = makeContainerData([file], ["/src/file.ts"], ONE);
    const hash = containerHash(containers, ZERO);
    const cached = [ONE, TWO];
    const key = `file${SEP}/src/file.ts`;
    const cache: EmbeddingCache = new Map([
      [key, { facetHash: hash, identityEmbedding: cached, leafEmbedding: [] }],
    ]);
    const result = resolveCache(EMPTY_LEAVES, containers, cache);

    expect(result.cachedContainerIds.has(ZERO)).toBe(true);
    expect(result.cachedContainerIds.get(ZERO)).toEqual(cached);
    expect(result.cacheHits).toBe(ONE);
  });
});

describe("resolveCache with mismatched cache", () => {
  it("does not copy leaf embeddings on stale hash", () => {
    const unit = makeUnit("myType", "/src/foo.ts");
    const leaves = makeLeafData(unit);
    const containers = makeContainerData([], [], ZERO);
    const key = `type${SEP}/src/foo.ts${SEP}myType`;
    const cache: EmbeddingCache = new Map([
      [key, { facetHash: sha256("stale"), identityEmbedding: [ONE], leafEmbedding: [TWO] }],
    ]);
    const result = resolveCache(leaves, containers, cache);

    expect(result.cachedLeaves.has(ZERO)).toBe(false);
    expect(result.cacheHits).toBe(ZERO);
    expect(unit.identityEmbedding).toEqual([]);
  });

  it("does not match when cache key is missing", () => {
    const unit = makeUnit("myType", "/src/foo.ts");
    const leaves = makeLeafData(unit);
    const cache: EmbeddingCache = new Map<string, never>();
    const result = resolveCache(leaves, makeContainerData([], [], ZERO), cache);

    expect(result.cacheHits).toBe(ZERO);
    expect(result.uLeaf).toEqual([ZERO]);
  });
});

describe("leaf cache key — func vs type prefix", () => {
  it("uses func prefix for units with params", () => {
    const fn = makeUnit("doStuff", "/src/foo.ts", { params: ["string"] });
    const leaves = makeLeafData(fn);
    const hash = leafHash(leaves, ZERO);
    const key = `func${SEP}/src/foo.ts${SEP}doStuff`;
    const cache: EmbeddingCache = new Map([
      [key, { facetHash: hash, identityEmbedding: [ONE], leafEmbedding: [TWO] }],
    ]);
    const result = resolveCache(leaves, makeContainerData([], [], ZERO), cache);
    expect(result.cacheHits).toBe(ONE);
  });

  it("uses type prefix for units without params", () => {
    const t = makeUnit("MyType", "/src/foo.ts");
    const leaves = makeLeafData(t);
    const hash = leafHash(leaves, ZERO);
    const key = `type${SEP}/src/foo.ts${SEP}MyType`;
    const cache: EmbeddingCache = new Map([
      [key, { facetHash: hash, identityEmbedding: [ONE], leafEmbedding: [TWO] }],
    ]);
    const result = resolveCache(leaves, makeContainerData([], [], ZERO), cache);
    expect(result.cacheHits).toBe(ONE);
  });
});

describe("container cache key — file vs dir prefix", () => {
  it("uses file prefix below fileCount", () => {
    const file = makeUnit("index.ts", "/src/index.ts");
    const containers = makeContainerData([file], ["/src/index.ts"], ONE);
    const hash = containerHash(containers, ZERO);
    const cache: EmbeddingCache = new Map([
      [`file${SEP}/src/index.ts`, { facetHash: hash, identityEmbedding: [ONE], leafEmbedding: [] }],
    ]);
    const result = resolveCache(EMPTY_LEAVES, containers, cache);
    expect(result.cacheHits).toBe(ONE);
  });

  it("uses dir prefix at or above fileCount", () => {
    const file = makeUnit("file.ts", "/src/file.ts");
    const dir = makeUnit("utils", "/src/utils");
    const containers = makeContainerData([file, dir], ["/src/file.ts", "/src/utils"], ONE);
    const hash = containerHash(containers, ONE);
    const cache: EmbeddingCache = new Map([
      [`dir${SEP}/src/utils`, { facetHash: hash, identityEmbedding: [TWO], leafEmbedding: [] }],
    ]);
    const result = resolveCache(EMPTY_LEAVES, containers, cache);
    expect(result.cachedContainerIds.get(ONE)).toEqual([TWO]);
  });

  it("splits file and dir by fileCount boundary", () => {
    const a = makeUnit("a.ts", "/src/a.ts");
    const b = makeUnit("b.ts", "/src/b.ts");
    const lib = makeUnit("lib", "/src/lib");
    const containers = makeContainerData([a, b, lib], ["/src/a.ts", "/src/b.ts", "/src/lib"], TWO);
    const hA = containerHash(containers, ZERO);
    const hB = containerHash(containers, ONE);
    const hC = containerHash(containers, TWO);
    const cache: EmbeddingCache = new Map([
      [`file${SEP}/src/a.ts`, { facetHash: hA, identityEmbedding: [ONE], leafEmbedding: [] }],
      [`file${SEP}/src/b.ts`, { facetHash: hB, identityEmbedding: [TWO], leafEmbedding: [] }],
      [`dir${SEP}/src/lib`, { facetHash: hC, identityEmbedding: [ONE, TWO], leafEmbedding: [] }],
    ]);
    const result = resolveCache(EMPTY_LEAVES, containers, cache);
    expect(result.cacheHits).toBe(THREE);
    expect(result.uCont).toEqual([]);
  });
});

describe("resolveCache mixed cached and uncached", () => {
  it("partitions cached and uncached leaves correctly", () => {
    const cached = makeUnit("Cached", "/src/a.ts");
    const fresh = makeUnit("Fresh", "/src/b.ts");
    const leaves: LeafData = {
      names: ["Cached", "Fresh"],
      descs: ["dA", "dB"],
      parentDescs: ["pA", "pB"],
      paths: ["/src/a.ts", "/src/b.ts"],
      sigs: ["sA", "sB"],
      causes: ["cA", "cB"],
      calls: ["clA", "clB"],
      units: [cached, fresh],
      fileChildIndices: new Map<string, number[]>(),
      patternIds: [undefined, undefined],
    };
    const hash = leafHash(leaves, ZERO);
    const cache: EmbeddingCache = new Map([
      [
        `type${SEP}/src/a.ts${SEP}Cached`,
        { facetHash: hash, identityEmbedding: [ONE], leafEmbedding: [TWO] },
      ],
    ]);
    const result = resolveCache(leaves, makeContainerData([], [], ZERO), cache);

    expect(result.cachedLeaves.has(ZERO)).toBe(true);
    expect(result.cachedLeaves.has(ONE)).toBe(false);
    expect(result.cacheHits).toBe(ONE);
    expect(result.uLeaf).toEqual([ONE]);
  });
});
