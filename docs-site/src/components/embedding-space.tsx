import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import treeData from "@/data/embeddings.json";

type TreeNode = {
  id: string;
  name: string;
  kind: string;
  path: string;
  description: string;
  score: number | null;
  subtreeScore?: number | null;
  position?: [number, number, number];
  children?: TreeNode[];
};

const root = treeData as unknown as TreeNode;

// ── Isometric projection ──
// Maps 3D [-1,1] coords to 2D SVG coords
const ISO_SCALE = 52;
const CX = 200;
const CY = 200;

function isoProject(x: number, y: number, z: number): [number, number] {
  const px = (x - z) * Math.cos(Math.PI / 6) * ISO_SCALE + CX;
  const py = -(x + z) * Math.sin(Math.PI / 6) * ISO_SCALE - y * ISO_SCALE + CY;
  return [px, py];
}

// Find the rotation angle that best separates points in 2D projection
// Uses a combined metric: weighted sum of minimum pairwise distance (avoid overlap)
// and total spread (overall separation).
function bestRotation(nodes: TreeNode[]): number {
  const positioned = nodes.filter((c) => c.position);
  if (positioned.length < 2) return 0;

  const s = 0.85;
  let bestAngle = 0;
  let bestScore = -Infinity;

  for (let deg = 0; deg < 360; deg += 2) {
    const rad = (deg * Math.PI) / 180;
    const pts = positioned.map((c) => {
      const [x, y, z] = c.position!.map((v) => v * s) as [number, number, number];
      const rx = x * Math.cos(rad) - z * Math.sin(rad);
      const rz = x * Math.sin(rad) + z * Math.cos(rad);
      return isoProject(rx, y, rz);
    });

    let minDist = Infinity;
    let totalDist = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i][0] - pts[j][0];
        const dy = pts[i][1] - pts[j][1];
        const d = dx * dx + dy * dy;
        minDist = Math.min(minDist, d);
        totalDist += Math.sqrt(d);
      }
    }
    // Balance: avoid overlaps (min) + maximize spread (total)
    const score = Math.sqrt(minDist) * 2 + totalDist;
    if (score > bestScore) {
      bestScore = score;
      bestAngle = deg;
    }
  }
  return bestAngle;
}

// Cube corners in 3D, projected to 2D
function cubeCorners() {
  const c = 1.15; // slightly larger than data range
  return {
    // Bottom face (y = -c)
    bfl: isoProject(-c, -c, -c), // bottom-front-left
    bfr: isoProject(c, -c, -c),
    bbr: isoProject(c, -c, c),
    bbl: isoProject(-c, -c, c),
    // Top face (y = c)
    tfl: isoProject(-c, c, -c),
    tfr: isoProject(c, c, -c),
    tbr: isoProject(c, c, c),
    tbl: isoProject(-c, c, c),
  };
}

function toPoints(pts: [number, number][]): string {
  return pts.map((p) => `${p[0]},${p[1]}`).join(" ");
}

// Grid lines for a face (returns array of line pairs in 2D)
function faceGrid(
  corners: [number, number][],
  divisions: number,
): [number, number, number, number][] {
  const [a, b, c, d] = corners; // quad corners
  const lines: [number, number, number, number][] = [];
  for (let i = 0; i <= divisions; i++) {
    const t = i / divisions;
    // Lines from ab side to dc side
    const x1 = a[0] + (b[0] - a[0]) * t;
    const y1 = a[1] + (b[1] - a[1]) * t;
    const x2 = d[0] + (c[0] - d[0]) * t;
    const y2 = d[1] + (c[1] - d[1]) * t;
    lines.push([x1, y1, x2, y2]);
    // Lines from ad side to bc side
    const x3 = a[0] + (d[0] - a[0]) * t;
    const y3 = a[1] + (d[1] - a[1]) * t;
    const x4 = b[0] + (c[0] - b[0]) * t;
    const y4 = b[1] + (c[1] - b[1]) * t;
    lines.push([x3, y3, x4, y4]);
  }
  return lines;
}

const ACCENT = "hsl(187, 40%, 55%)";
const POINT_R = 4;
const ACTIVE_R = 5;

const KIND_LABELS: Record<string, string> = {
  file: "file",
  func: "func",
  type: "type",
  dir: "dir.",
};

const KIND_ORDER = ["dir", "file", "func", "type"] as const;

const KIND_COLORS: Record<string, string> = {
  dir: "hsl(187, 40%, 55%)",   // cyan — matches accent
  file: "hsl(45, 60%, 60%)",   // warm amber
  func: "hsl(280, 40%, 65%)",  // soft purple
  type: "hsl(20, 55%, 60%)",    // warm coral
};

function findNode(path: string[]): TreeNode {
  let node = root;
  for (const segment of path) {
    const child = node.children?.find((c) => c.id === segment);
    if (!child) break;
    node = child;
  }
  return node;
}

export function EmbeddingSpace() {
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [hoveredIdx, setHoveredIdx] = useState(0);
  const [cardHidden, setCardHidden] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const dragRef = useRef<{ startX: number; startRot: number } | null>(null);

  const currentNode = useMemo(() => findNode(breadcrumbs), [breadcrumbs]);
  const children = currentNode.children || [];

  // Compute optimal initial rotation for this level
  const initialRotation = useMemo(() => bestRotation(children), [children]);
  const [rotation, setRotation] = useState(0);

  // Reset rotation to optimal when level changes
  useEffect(() => {
    setRotation(initialRotation);
  }, [initialRotation]);

  const corners = useMemo(() => cubeCorners(), []);

  // Front faces (user-facing, transparent)
  const bottomFace = [corners.bfl, corners.bfr, corners.bbr, corners.bbl] as [number, number][];
  const frontFace = [corners.bfl, corners.bfr, corners.tfr, corners.tfl] as [number, number][];

  // Shaded faces: F (right), D (back), B (bottom)
  const rightFace = [corners.bfr, corners.tfr, corners.tbr, corners.bbr] as [number, number][];
  const backFace = [corners.bbl, corners.bbr, corners.tbr, corners.tbl] as [number, number][];

  const bottomGrid = useMemo(() => faceGrid(bottomFace, 4), []);
  const rightGrid = useMemo(() => faceGrid(rightFace, 4), []);
  const backGrid = useMemo(() => faceGrid(backFace, 4), []);

  // Project points with rotation applied
  const projectedPoints = useMemo(() => {
    const rad = (rotation * Math.PI) / 180;
    return children
      .filter((c) => c.position)
      .map((child) => {
        // Scale down to keep circles visually inside the cube
        const s = 0.85;
        const [x, y, z] = child.position!.map((v) => v * s) as [number, number, number];
        // Rotate around Y axis
        const rx = x * Math.cos(rad) - z * Math.sin(rad);
        const rz = x * Math.sin(rad) + z * Math.cos(rad);
        const [px, py] = isoProject(rx, y, rz);
        return { ...child, px, py, depth: rz };
      })
      .sort((a, b) => a.depth - b.depth); // painter's order
  }, [children, rotation]);

  const handleDrillDown = useCallback(
    (child: TreeNode) => {
      if (child.children && child.children.length > 0) {
        setBreadcrumbs((prev) => [...prev, child.id]);
        setHoveredIdx(0);
      }
    },
    [],
  );

  const handleBreadcrumb = useCallback((idx: number) => {
    setBreadcrumbs((prev) => prev.slice(0, idx));
    setHoveredIdx(0);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragRef.current = { startX: e.clientX, startRot: rotation };
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [rotation],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    setRotation(dragRef.current.startRot + dx * 0.5);
    setCardHidden(false);
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const hoveredPoint = projectedPoints[hoveredIdx] ?? projectedPoints[0] ?? null;

  return (
    <div className="flex flex-col h-full w-full select-none">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 px-6 py-4 text-base tracking-wider min-h-[52px]">
        <svg viewBox="0 0 20 20" width={16} height={16} fill="currentColor" className="text-fd-muted-foreground/60 shrink-0">
          <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-8.5A1.75 1.75 0 0 0 16.25 5h-4.836a.25.25 0 0 1-.177-.073L9.823 3.513A1.75 1.75 0 0 0 8.586 3H3.75Z" />
        </svg>
        <button
          onClick={() => handleBreadcrumb(0)}
          className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
          style={breadcrumbs.length === 0 ? { color: ACCENT } : undefined}
        >
          src
        </button>
        {breadcrumbs.length === 0 && currentNode.score !== null && (
          <span
            className="text-[10px] uppercase tracking-wider px-1.5 border border-fd-border text-fd-muted-foreground translate-y-px"
          >
            score {currentNode.score.toFixed(2)}
          </span>
        )}
        {breadcrumbs.map((crumb, i) => {
          const node = findNode(breadcrumbs.slice(0, i + 1));
          const isLast = i === breadcrumbs.length - 1;
          return (
            <span key={crumb} className="flex items-center gap-2">
              <span className="text-fd-muted-foreground/40">/</span>
              <button
                onClick={() => handleBreadcrumb(i + 1)}
                className="text-fd-muted-foreground hover:text-fd-foreground transition-colors"
                style={isLast ? { color: ACCENT } : undefined}
              >
                {node.name}
              </button>
              {isLast && node.score !== null && (
                <span
                  className="text-[10px] uppercase tracking-wider px-1.5 border border-fd-border text-fd-muted-foreground translate-y-px"
                >
                  score {node.score.toFixed(2)}
                </span>
              )}
            </span>
          );
        })}
      </div>

      {/* Embedding space */}
      <div className="flex-1 relative min-h-0 flex items-center justify-center">
        <svg
          ref={svgRef}
          viewBox="-10 40 420 360"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ cursor: dragRef.current ? "grabbing" : "grab" }}
        >
          {/* Shaded faces: B (bottom), D (back), F (right) */}
          <polygon
            points={toPoints(bottomFace)}
            fill="hsl(0, 0%, 48%)"
            opacity={0.4}
            stroke="hsl(0, 0%, 45%)"
            strokeWidth={0.8}
          />
          <polygon
            points={toPoints(backFace)}
            fill="hsl(0, 0%, 52%)"
            opacity={0.35}
            stroke="hsl(0, 0%, 45%)"
            strokeWidth={0.8}
          />
          <polygon
            points={toPoints(rightFace)}
            fill="hsl(0, 0%, 50%)"
            opacity={0.35}
            stroke="hsl(0, 0%, 45%)"
            strokeWidth={0.8}
          />

          {/* Axis extensions from inner corner (bbr) */}
          {(() => {
            const c = 1.15;
            const ext = 0.6; // how far past the cube edge
            const origin = isoProject(c, -c, c); // bbr — the inner corner
            const xEnd = isoProject(c + ext, -c, c); // extend along +X (not meaningful — axes go toward bbl, tbr, bfr)
            // Actually: from bbr, the 3 edges go to bbl (-X), tbr (+Y), bfr (-Z)
            // Extend those directions beyond the cube
            const toLeft = isoProject(-c - ext, -c, c);   // past bbl, along -X
            const toUp = isoProject(c, c + ext, c);        // past tbr, along +Y
            const toFront = isoProject(c, -c, -c - ext);   // past bfr, along -Z
            const bbl = isoProject(-c, -c, c);
            const tbr = isoProject(c, c, c);
            const bfr = isoProject(c, -c, -c);
            return (
              <>
                <line x1={bbl[0]} y1={bbl[1]} x2={toLeft[0]} y2={toLeft[1]} stroke="hsl(0, 0%, 45%)" strokeWidth={0.6} strokeDasharray="2 2" />
                <line x1={tbr[0]} y1={tbr[1]} x2={toUp[0]} y2={toUp[1]} stroke="hsl(0, 0%, 45%)" strokeWidth={0.6} strokeDasharray="2 2" />
                <line x1={bfr[0]} y1={bfr[1]} x2={toFront[0]} y2={toFront[1]} stroke="hsl(0, 0%, 45%)" strokeWidth={0.6} strokeDasharray="2 2" />
              </>
            );
          })()}

          {/* Transparent faces: A (top), C (front), E (left) */}
          <polygon
            points={toPoints([corners.tfl, corners.tfr, corners.tbr, corners.tbl])}
            fill="none"
            stroke="hsl(0, 0%, 45%)"
            strokeWidth={0.8}
          />
          <polygon
            points={toPoints(frontFace)}
            fill="none"
            stroke="hsl(0, 0%, 45%)"
            strokeWidth={0.8}
          />
          <polygon
            points={toPoints([corners.bfl, corners.tfl, corners.tbl, corners.bbl])}
            fill="none"
            stroke="hsl(0, 0%, 45%)"
            strokeWidth={0.8}
          />

          {/* Grid lines on back faces — same color as edges, thinner, dashed */}
          {bottomGrid.map(([x1, y1, x2, y2], i) => (
            <line
              key={`bg${i}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="hsl(0, 0%, 45%)"
              strokeWidth={0.4}
              strokeDasharray="4 2"
            />
          ))}
          {backGrid.map(([x1, y1, x2, y2], i) => (
            <line
              key={`dg${i}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="hsl(0, 0%, 45%)"
              strokeWidth={0.4}
              strokeDasharray="4 2"
            />
          ))}
          {rightGrid.map(([x1, y1, x2, y2], i) => (
            <line
              key={`fg${i}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="hsl(0, 0%, 45%)"
              strokeWidth={0.4}
              strokeDasharray="4 2"
            />
          ))}

          {/* Points */}
          {projectedPoints.map((pt, i) => {
            const isHovered = hoveredPoint === projectedPoints[i];
            const isDir = pt.kind === "dir" || (pt.children && pt.children.length > 0);
            const kindColor = KIND_COLORS[pt.kind] || "hsl(0, 0%, 50%)";
            return (
              <g key={pt.id}>
                {/* Backing circle for visibility */}
                <circle
                  cx={pt.px}
                  cy={pt.py}
                  r={(isHovered ? ACTIVE_R : POINT_R) + 1.5}
                  fill="var(--color-fd-background)"
                  opacity={isHovered ? 0.9 : 0.8}
                />
                {/* Outer glow for hovered */}
                {isHovered && (
                  <circle
                    cx={pt.px}
                    cy={pt.py}
                    r={ACTIVE_R + 2}
                    fill={kindColor}
                    opacity={0.2}
                  />
                )}
                <circle
                  cx={pt.px}
                  cy={pt.py}
                  r={isHovered ? ACTIVE_R : POINT_R}
                  fill={kindColor}
                  opacity={isHovered ? 1 : 0.8}
                  style={{ cursor: isDir ? "pointer" : "default" }}
                  onMouseEnter={() => { setHoveredIdx(i); setCardHidden(false); }}
                  onClick={() => isDir && handleDrillDown(pt)}
                />
              </g>
            );
          })}

          {/* Legend */}
          {(() => {
            const entries = KIND_ORDER.map((k) => [k, KIND_LABELS[k]] as const);
            const gap = 55;
            const totalWidth = (entries.length - 1) * gap;
            const startX = CX - totalWidth / 2;
            const y = 345;
            return entries.map(([kind, label], i) => (
              <g key={kind} transform={`translate(${startX + i * gap}, ${y})`}>
                <circle cx={0} cy={0} r={3} fill={KIND_COLORS[kind]} />
                <text
                  x={8}
                  y={3.5}
                  fill="hsl(0, 0%, 55%)"
                  fontSize={8}
                  fontFamily="var(--font-body)"
                  style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
                >
                  {label}
                </text>
              </g>
            ));
          })()}
        </svg>

        {/* Tooltip anchored to node */}
        {hoveredPoint && !cardHidden && (() => {
          const svg = svgRef.current;
          const container = svg?.parentElement;
          let left = `${((hoveredPoint.px + 10) / 420) * 100}%`;
          let top = `${((hoveredPoint.py + 30) / 470) * 100}%`;
          if (svg && container) {
            const pt = svg.createSVGPoint();
            pt.x = hoveredPoint.px;
            pt.y = hoveredPoint.py;
            const ctm = svg.getScreenCTM();
            if (ctm) {
              const screenPt = pt.matrixTransform(ctm);
              const rect = container.getBoundingClientRect();
              left = `${screenPt.x - rect.left}px`;
              top = `${screenPt.y - rect.top}px`;
            }
          }
          return (
          <div
            className="absolute z-10"
            style={{
              left,
              top,
              transform: "translate(12px, -50%)",
            }}
          >
            <div className="bg-fd-card/90 backdrop-blur-sm border border-fd-border px-3 py-2 w-[220px] relative">
              <button
                onClick={() => setCardHidden(true)}
                className="absolute top-2 right-2 text-fd-muted-foreground/50 hover:text-fd-foreground transition-colors text-sm size-5 flex items-center justify-center"
              >
                &times;
              </button>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: KIND_COLORS[hoveredPoint.kind] || ACCENT }}
                >
                  {KIND_LABELS[hoveredPoint.kind] || hoveredPoint.kind}
                </span>
                {hoveredPoint.score !== null && (
                  <span className="text-[10px] text-fd-muted-foreground">
                    {hoveredPoint.score.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="text-sm font-semibold text-fd-foreground leading-tight">
                {hoveredPoint.name}
              </div>
              {hoveredPoint.path && hoveredPoint.path !== hoveredPoint.name && (
                <div className="text-[11px] text-fd-muted-foreground leading-snug mt-0.5">
                  {hoveredPoint.path}
                </div>
              )}
              {hoveredPoint.description && (
                <div className="text-[11px] text-fd-muted-foreground/70 leading-snug mt-1 line-clamp-2">
                  {hoveredPoint.description}
                </div>
              )}
              <div className="flex items-center gap-3 mt-1.5">
                {breadcrumbs.length > 0 && (
                  <button
                    className="text-[10px] hover:opacity-70 transition-opacity cursor-pointer"
                    style={{ color: ACCENT }}
                    onClick={() => handleBreadcrumb(breadcrumbs.length - 1)}
                  >
                    ← back
                  </button>
                )}
                {breadcrumbs.length > 0 && hoveredPoint.children && hoveredPoint.children.length > 0 && (
                  <span className="text-[10px] text-fd-muted-foreground/40">|</span>
                )}
                {hoveredPoint.children && hoveredPoint.children.length > 0 && (
                  <button
                    className="text-[10px] hover:opacity-70 transition-opacity cursor-pointer"
                    style={{ color: ACCENT }}
                    onClick={() => handleDrillDown(hoveredPoint)}
                  >
                    explore →
                  </button>
                )}
              </div>
            </div>
          </div>
          );
        })()}

      </div>

      {/* GitHub link */}
      <div className="flex items-center gap-2.5 px-6 py-4 text-base" style={{ color: ACCENT }}>
        <svg viewBox="0 0 16 16" width={18} height={18} fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        <a
          href="https://github.com/user/kural"
          className="hover:opacity-70 transition-opacity"
        >
          user / kural
        </a>
      </div>
    </div>
  );
}
