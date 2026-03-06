// lib/origin/v6/japanMapData.ts
// Japan map outline and geometry for the life roadmap.
// ViewBox: 0 0 1000 1400 (portrait, wider than v3 proportions).
// A simplified but recognizable Japan silhouette.

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 1400;

/* ═══════════════════════════════════════════
   JAPAN COASTLINE — simplified smooth outline
   Recognizable shape with major geographic features.
   42 anchor points, clockwise from Hokkaido NW.
   ═══════════════════════════════════════════ */

type Pt = { x: number; y: number };

const COAST: Pt[] = [
  // ── Hokkaido (top) ──
  { x: 490, y: 15 },
  { x: 570, y: 10 },
  { x: 660, y: 20 },
  { x: 730, y: 40 },
  { x: 780, y: 75 },
  { x: 790, y: 130 },
  { x: 750, y: 185 },
  { x: 700, y: 210 },
  // ── Tsugaru strait ──
  { x: 680, y: 230 },
  // ── Tohoku east coast ──
  { x: 720, y: 260 },
  { x: 740, y: 310 },
  { x: 730, y: 370 },
  // ── Kanto bulge ──
  { x: 760, y: 430 },
  { x: 780, y: 490 },
  { x: 760, y: 540 },
  // ── Chubu / Tokai ──
  { x: 730, y: 600 },
  { x: 750, y: 660 },
  { x: 770, y: 730 },
  // ── Kii peninsula ──
  { x: 740, y: 790 },
  { x: 690, y: 840 },
  // ── Shikoku south ──
  { x: 640, y: 880 },
  { x: 580, y: 910 },
  { x: 520, y: 930 },
  // ── Kyushu SE ──
  { x: 470, y: 980 },
  { x: 430, y: 1060 },
  { x: 400, y: 1140 },
  { x: 370, y: 1220 },
  { x: 340, y: 1280 },
  // ── Kyushu south ──
  { x: 290, y: 1310 },
  { x: 240, y: 1300 },
  // ── Kyushu west ──
  { x: 220, y: 1250 },
  { x: 240, y: 1180 },
  { x: 270, y: 1100 },
  // ── West coast north ──
  { x: 310, y: 1000 },
  { x: 350, y: 900 },
  { x: 380, y: 810 },
  // ── San'in coast ──
  { x: 370, y: 740 },
  { x: 360, y: 650 },
  { x: 380, y: 560 },
  // ── Hokuriku ──
  { x: 410, y: 470 },
  { x: 440, y: 380 },
  // ── Tohoku west coast ──
  { x: 490, y: 300 },
  { x: 520, y: 240 },
  // ── Back to Hokkaido ──
  { x: 540, y: 200 },
  { x: 510, y: 160 },
  { x: 470, y: 110 },
  { x: 460, y: 55 },
];

/**
 * Convert anchor points to smooth closed SVG path
 * using Catmull-Rom → cubic Bezier spline conversion.
 */
function smoothClosedPath(points: Pt[]): string {
  const n = points.length;
  if (n < 3) return "";

  let d = `M ${points[0].x},${points[0].y}`;

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${Math.round(cp1x)},${Math.round(cp1y)} ${Math.round(cp2x)},${Math.round(cp2y)} ${Math.round(p2.x)},${Math.round(p2.y)}`;
  }

  d += " Z";
  return d;
}

/** The Japan coastline as a smooth SVG path */
export const JAPAN_COASTLINE_PATH = smoothClosedPath(COAST);

/** The raw coastline points for hit-testing */
export const COAST_POINTS: readonly Pt[] = COAST;

/** Point-in-polygon test using the coastline */
export function isInsideJapan(x: number, y: number): boolean {
  let inside = false;
  const pts = COAST;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/* ═══════════════════════════════════════════
   MAIN ROAD PATH GENERATION
   Generates a smooth SVG path connecting chapters
   in their map positions, creating the "life road".
   ═══════════════════════════════════════════ */

export type RoadNode = {
  id: string;
  x: number;
  y: number;
  order: number;
};

/**
 * Generate a smooth road path through the given nodes.
 * Uses Catmull-Rom interpolation for organic curves.
 */
export function generateMainRoadPath(nodes: RoadNode[]): string {
  if (nodes.length < 2) return "";

  // Sort by order
  const sorted = [...nodes].sort((a, b) => a.order - b.order);

  if (sorted.length === 2) {
    const [a, b] = sorted;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    return `M ${a.x},${a.y} Q ${mx + 30},${my} ${b.x},${b.y}`;
  }

  // Catmull-Rom through all points
  let d = `M ${sorted[0].x},${sorted[0].y}`;

  for (let i = 0; i < sorted.length - 1; i++) {
    const p0 = sorted[Math.max(0, i - 1)];
    const p1 = sorted[i];
    const p2 = sorted[i + 1];
    const p3 = sorted[Math.min(sorted.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${Math.round(cp1x)},${Math.round(cp1y)} ${Math.round(cp2x)},${Math.round(cp2y)} ${Math.round(p2.x)},${Math.round(p2.y)}`;
  }

  return d;
}

/* ═══════════════════════════════════════════
   BRANCH LAYOUT — theme branches from chapters
   ═══════════════════════════════════════════ */

export type BranchLayoutItem = {
  theme: string;
  /** SVG path from chapter center to branch endpoint */
  path: string;
  /** Endpoint position */
  endX: number;
  endY: number;
  /** Sub-node positions along the branch (for multi-depth answers) */
  subNodes: { x: number; y: number; depth: number }[];
  /** Angle in radians (for label placement) */
  angle: number;
};

/**
 * Generate branch layouts radiating from a chapter node.
 * Branches fan outward, away from the main road direction.
 * Each branch has potential sub-node positions for multi-depth questions.
 */
export function generateBranchLayouts(
  nodeX: number,
  nodeY: number,
  nodeId: string,
  themes: readonly string[],
  prevNodeDir?: { x: number; y: number },
  nextNodeDir?: { x: number; y: number },
): BranchLayoutItem[] {
  const count = themes.length;
  const BASE_LENGTH = 65;
  const SUB_NODE_SPACING = 30;

  // Determine the "away" direction (perpendicular to main road direction)
  let awayAngle = 0;
  if (prevNodeDir && nextNodeDir) {
    // Average road direction
    const roadDx = (nextNodeDir.x - prevNodeDir.x);
    const roadDy = (nextNodeDir.y - prevNodeDir.y);
    const roadAngle = Math.atan2(roadDy, roadDx);
    // Perpendicular, prefer left side
    awayAngle = roadAngle - Math.PI / 2;
  } else if (nextNodeDir) {
    const roadAngle = Math.atan2(nextNodeDir.y - nodeY, nextNodeDir.x - nodeX);
    awayAngle = roadAngle - Math.PI / 2;
  } else if (prevNodeDir) {
    const roadAngle = Math.atan2(nodeY - prevNodeDir.y, nodeX - prevNodeDir.x);
    awayAngle = roadAngle - Math.PI / 2;
  }

  // Seeded random for organic variation
  let seed = 0;
  for (let i = 0; i < nodeId.length; i++) {
    seed = (seed * 31 + nodeId.charCodeAt(i)) | 0;
  }
  seed = Math.abs(seed);

  const fanDeg = 200; // spread angle in degrees
  const halfFan = (fanDeg / 2) * (Math.PI / 180);

  return themes.map((theme, i) => {
    const fraction = count > 1 ? i / (count - 1) : 0.5;
    const angle = awayAngle - halfFan + fraction * (halfFan * 2);

    // Organic wobble
    const wobble = ((seed + i * 17) % 20 - 10) * 0.3;
    const length = BASE_LENGTH + wobble;

    const endX = nodeX + Math.cos(angle) * length;
    const endY = nodeY + Math.sin(angle) * length;

    // Control point for curve
    const ctrlOff = ((seed + i * 7) % 12 - 6) * 0.6;
    const ctrlX = nodeX + Math.cos(angle) * length * 0.55 + ctrlOff;
    const ctrlY = nodeY + Math.sin(angle) * length * 0.55 + ctrlOff;

    const path = `M ${nodeX},${nodeY} Q ${Math.round(ctrlX)},${Math.round(ctrlY)} ${Math.round(endX)},${Math.round(endY)}`;

    // Sub-node positions (for deeper answers)
    const subNodes = [0, 1].map((depth) => {
      const t = 0.4 + depth * 0.35;
      const sx = nodeX + Math.cos(angle) * length * t;
      const sy = nodeY + Math.sin(angle) * length * t;
      return { x: Math.round(sx), y: Math.round(sy), depth };
    });

    return { theme, path, endX: Math.round(endX), endY: Math.round(endY), subNodes, angle };
  });
}

/* ═══════════════════════════════════════════
   CONTOUR LINES — decorative topo lines
   ═══════════════════════════════════════════ */

export function generateContourLines(): string[] {
  const contours: string[] = [];
  const offsets = [20, 45, 70, 95];

  for (const offset of offsets) {
    const pts = COAST.map((p) => {
      // Shrink toward center
      const cx = MAP_WIDTH / 2;
      const cy = MAP_HEIGHT / 2;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const factor = Math.max(0, 1 - offset / dist);
      return {
        x: cx + dx * factor,
        y: cy + dy * factor,
      };
    });
    contours.push(smoothClosedPath(pts));
  }

  return contours;
}
