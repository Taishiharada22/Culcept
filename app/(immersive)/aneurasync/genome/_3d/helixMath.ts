/**
 * helixMath.ts — 3D二重螺旋の数学
 * 4本の鎖を位相オフセットして配置し、塩基対の3D座標を計算する
 */
import * as THREE from "three";

/* ─── Constants ─── */

export const HELIX_RADIUS = 2;
export const PITCH_PER_PAIR = 0.5; // Y spacing per base pair
export const TWIST_RATE = Math.PI / 4; // radians per base pair (full twist every 8 pairs)

/** Phase offset per strand so 4 strands are equally spaced around the helix */
export const STRAND_PHASE: Record<string, number> = {
  physical: 0,
  personality: Math.PI / 2,
  behavioral: Math.PI,
  social: (3 * Math.PI) / 2,
};

export const STRAND_COLORS: Record<string, string> = {
  physical: "#6366f1",
  personality: "#8b5cf6",
  behavioral: "#ec4899",
  social: "#14b8a6",
};

/* ─── Helix Curve ─── */

/**
 * Parametric helix curve for TubeGeometry backbone.
 * t goes from 0 to 1, mapping to the full height of the helix.
 */
export class HelixCurve extends THREE.Curve<THREE.Vector3> {
  private totalHeight: number;
  private phase: number;
  private radius: number;
  private totalTwist: number;

  constructor(totalPairs: number, phase: number, radius = HELIX_RADIUS) {
    super();
    this.totalHeight = totalPairs * PITCH_PER_PAIR;
    this.phase = phase;
    this.radius = radius;
    this.totalTwist = totalPairs * TWIST_RATE;
  }

  getPoint(t: number): THREE.Vector3 {
    const y = t * this.totalHeight - this.totalHeight / 2; // center vertically
    const angle = t * this.totalTwist + this.phase;
    const x = Math.cos(angle) * this.radius;
    const z = Math.sin(angle) * this.radius;
    return new THREE.Vector3(x, y, z);
  }
}

/* ─── Position Helpers ─── */

/**
 * Get the 3D position of a base pair node on the helix.
 * @param index - The index of the base pair in the interleaved sequence
 * @param totalPairs - Total number of base pairs across all strands
 * @param strandId - Which strand this pair belongs to
 * @param side - "left" or "right" backbone position
 */
export function getBasePairPosition(
  index: number,
  totalPairs: number,
  strandId: string,
  side: "left" | "right" = "left",
): THREE.Vector3 {
  const totalHeight = totalPairs * PITCH_PER_PAIR;
  const y = (index / totalPairs) * totalHeight - totalHeight / 2;
  const phase = STRAND_PHASE[strandId] ?? 0;
  const angle = (index / totalPairs) * totalPairs * TWIST_RATE + phase;

  // Left and right are on opposite sides of the helix
  const sideOffset = side === "right" ? Math.PI : 0;
  const x = Math.cos(angle + sideOffset) * HELIX_RADIUS;
  const z = Math.sin(angle + sideOffset) * HELIX_RADIUS;

  return new THREE.Vector3(x, y, z);
}

/**
 * Get center position of a base pair rung (midpoint between left and right nodes).
 */
export function getBasePairCenter(
  index: number,
  totalPairs: number,
  strandId: string,
): THREE.Vector3 {
  const left = getBasePairPosition(index, totalPairs, strandId, "left");
  const right = getBasePairPosition(index, totalPairs, strandId, "right");
  return new THREE.Vector3(
    (left.x + right.x) / 2,
    (left.y + right.y) / 2,
    (left.z + right.z) / 2,
  );
}

/* ─── Interleave utility (shared with 2D) ─── */

export interface BasePair3D {
  id: string;
  strandId: string;
  label: string;
  value: number;
  confidence: number;
  index: number; // position in the interleaved sequence
}

export function interleaveStrands3D(
  strands: Array<{ id: string; basePairs: Array<{ id: string; label: string; value: number; confidence: number }> }>,
): BasePair3D[] {
  const result: BasePair3D[] = [];
  const maxLen = Math.max(...strands.map((s) => s.basePairs.length), 0);
  let idx = 0;

  for (let i = 0; i < maxLen; i++) {
    for (const strand of strands) {
      const bp = strand.basePairs[i];
      if (bp) {
        result.push({
          id: bp.id,
          strandId: strand.id,
          label: bp.label,
          value: bp.value,
          confidence: bp.confidence,
          index: idx,
        });
        idx++;
      }
    }
  }
  return result;
}
