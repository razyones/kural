/**
 * The microscope. Projects query and sibling vectors into a low-dimensional
 * discriminant subspace where siblings differ most. It is the only module
 * that computes per-parent local projections — no other module runs
 * eigendecomposition on sibling Gram matrices.
 */

const NONE = 0;
const NEXT = 1;
const HALF = 2;
const EIGEN_FLOOR = 1e-6;
const JACOBI_TOLERANCE = 1e-10;
const MAX_JACOBI = 100;
const QUARTER_DIVISOR = 4;
const QUARTER_TURN = Math.PI / QUARTER_DIVISOR;
const HALF_MULTIPLIER = 0.5;

/** Projected vectors from LCPN. */
type LCPNResult = {
  projectedQ: number[];
  projectedChildren: number[][];
};

/**
 * Creates a zero-filled number array of the given length.
 * @param length - Number of elements in the array
 * @returns Array of zeros with the specified length
 * @kuralPure
 */
function zeros(length: number): number[] {
  return Array.from<number>({ length }).fill(NONE);
}

/**
 * Centers child vectors by subtracting the mean.
 * @param childVecs - Array of sibling embedding vectors to center
 * @returns The mean vector and the centered vectors
 * @kuralPure
 */
function centerVectors(childVecs: number[][]): { mean: number[]; centered: number[][] } {
  const n = childVecs.length;
  const dim = childVecs[NONE].length;
  const mean = zeros(dim);
  for (const v of childVecs) {
    for (let d = NONE; d < dim; d++) {
      mean[d] += v[d];
    }
  }
  for (let d = NONE; d < dim; d++) {
    mean[d] /= n;
  }
  const centered = childVecs.map((v) => v.map((val, d) => val - mean[d]));
  return { mean, centered };
}

/**
 * Computes the Gram matrix G = X X^T for centered vectors.
 * @param centered - Mean-subtracted sibling vectors
 * @returns Symmetric Gram matrix of dot products
 * @kuralPure
 */
function gramMatrix(centered: number[][]): number[][] {
  const n = centered.length;
  const dim = centered[NONE].length;
  const G = Array.from({ length: n }, () => zeros(n));
  for (let i = NONE; i < n; i++) {
    for (let j = i; j < n; j++) {
      let dot = NONE;
      for (let d = NONE; d < dim; d++) {
        dot += centered[i][d] * centered[j][d];
      }
      G[i][j] = dot;
      G[j][i] = dot;
    }
  }
  return G;
}

/**
 * Applies one Jacobi rotation sweep to the matrix M and eigenvector matrix V.
 * @param M - Symmetric matrix being diagonalized
 * @param V - Eigenvector accumulation matrix
 * @param n - Dimension of the square matrices
 * @returns True if a rotation was applied, false if converged
 * @kuralCauses mutates M and V in place
 */
function jacobiSweep(M: number[][], V: number[][], n: number): boolean {
  let maxVal = NONE;
  let p = NONE;
  let qq = NEXT;
  for (let i = NONE; i < n; i++) {
    for (let j = i + NEXT; j < n; j++) {
      if (Math.abs(M[i][j]) > maxVal) {
        maxVal = Math.abs(M[i][j]);
        p = i;
        qq = j;
      }
    }
  }
  if (maxVal < JACOBI_TOLERANCE) {
    return false;
  }
  const theta =
    Math.abs(M[p][p] - M[qq][qq]) < JACOBI_TOLERANCE
      ? QUARTER_TURN
      : HALF_MULTIPLIER * Math.atan2(HALF * M[p][qq], M[p][p] - M[qq][qq]);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  applyRotation(M, V, n, p, qq, c, s);
  return true;
}

/**
 * Applies a Givens rotation to rows/columns p and qq.
 * @param M - Symmetric matrix being diagonalized
 * @param V - Eigenvector accumulation matrix
 * @param n - Dimension of the square matrices
 * @param p - First rotation index
 * @param qq - Second rotation index
 * @param c - Cosine of the rotation angle
 * @param s - Sine of the rotation angle
 * @kuralCauses mutates M and V in place
 */
function applyRotation(
  M: number[][],
  V: number[][],
  n: number,
  p: number,
  qq: number,
  c: number,
  s: number,
): void {
  M[p][p] = c * c * M[p][p] + HALF * s * c * M[p][qq] + s * s * M[qq][qq];
  M[qq][qq] = s * s * M[p][p] - HALF * s * c * M[p][qq] + c * c * M[qq][qq];
  M[p][qq] = NONE;
  M[qq][p] = NONE;
  for (let i = NONE; i < n; i++) {
    if (i === p || i === qq) {
      continue;
    }
    const mip = c * M[i][p] + s * M[i][qq];
    const miq = -s * M[i][p] + c * M[i][qq];
    M[i][p] = mip;
    M[p][i] = mip;
    M[i][qq] = miq;
    M[qq][i] = miq;
  }
  for (let i = NONE; i < n; i++) {
    const vip = c * V[i][p] + s * V[i][qq];
    const viq = -s * V[i][p] + c * V[i][qq];
    V[i][p] = vip;
    V[i][qq] = viq;
  }
}

/**
 * Runs Jacobi eigendecomposition and extracts significant components.
 * @param G - Gram matrix to decompose
 * @param centered - Mean-subtracted sibling vectors for recovering directions
 * @returns High-dimensional principal directions, or null if none are significant
 * @kuralPure
 */
function eigenComponents(G: number[][], centered: number[][]): number[][] | null {
  const n = G.length;
  const dim = centered[NONE].length;
  const M = G.map((row) => [...row]);
  const V = Array.from({ length: n }, (_, i) => {
    const row = zeros(n);
    row[i] = NEXT;
    return row;
  });

  for (let iter = NONE; iter < MAX_JACOBI; iter++) {
    if (!jacobiSweep(M, V, n)) {
      break;
    }
  }

  return extractSignificant(M, V, n, dim, centered);
}

/**
 * Extracts significant eigenvectors and recovers high-dimensional components.
 * @param M - Diagonalized matrix with eigenvalues on the diagonal
 * @param V - Eigenvector matrix from Jacobi decomposition
 * @param n - Number of sibling vectors
 * @param dim - Original embedding dimensionality
 * @param centered - Mean-subtracted sibling vectors
 * @returns Principal direction vectors, or null if no eigenvalue exceeds the floor
 * @kuralPure
 */
function extractSignificant(
  M: number[][],
  V: number[][],
  n: number,
  dim: number,
  centered: number[][],
): number[][] | null {
  const pairs: { value: number; vector: number[] }[] = [];
  for (let i = NONE; i < n; i++) {
    const vec = Array.from<number>({ length: n });
    for (let j = NONE; j < n; j++) {
      vec[j] = V[j][i];
    }
    pairs.push({ value: M[i][i], vector: vec });
  }
  pairs.sort((a, b) => b.value - a.value);
  const significant = pairs.filter((pp) => pp.value > EIGEN_FLOOR);
  if (significant.length === NONE) {
    return null;
  }

  return significant.map(({ value, vector }) => {
    const dir = zeros(dim);
    for (let d = NONE; d < dim; d++) {
      let sum = NONE;
      for (let i = NONE; i < n; i++) {
        sum += centered[i][d] * vector[i];
      }
      dir[d] = sum / Math.sqrt(value);
    }
    return dir;
  });
}

/**
 * Projects a vector into the component subspace.
 * @param v - Embedding vector to project
 * @param mean - Mean vector to subtract before projection
 * @param components - Principal direction vectors defining the subspace
 * @returns Coordinates of v in the component subspace
 * @kuralPure
 */
function projectInto(v: number[], mean: number[], components: number[][]): number[] {
  const cv = v.map((val, d) => val - mean[d]);
  return components.map((comp) => {
    let dot = NONE;
    for (let d = NONE; d < cv.length; d++) {
      dot += cv[d] * comp[d];
    }
    return dot;
  });
}

/**
 * Local projection per parent node — projects query and children into
 * the discriminant subspace where siblings differ most.
 * @param q - Query embedding vector
 * @param childVecs - Sibling embedding vectors
 * @returns Projected query and children, or null if too few siblings
 * @kuralPure
 */
function localProject(q: number[], childVecs: number[][]): LCPNResult | null {
  if (childVecs.length < HALF) {
    return null;
  }
  const { mean, centered } = centerVectors(childVecs);
  const G = gramMatrix(centered);
  const components = eigenComponents(G, centered);
  if (components === null) {
    return null;
  }

  return {
    projectedQ: projectInto(q, mean, components),
    projectedChildren: childVecs.map((v) => projectInto(v, mean, components)),
  };
}

export { localProject };
export type { LCPNResult };
