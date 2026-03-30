"use client";

/**
 * OrbitalPath
 * EncounterTriggerTypeごとに異なる軌道形状のSVGパスを生成
 * spiral / parallel / concentric / convergent / crossing
 */

import type { EncounterTriggerType } from "@/lib/rendezvous/types";

type OrbitalShape = "spiral" | "parallel" | "concentric" | "convergent" | "crossing";

const TRIGGER_TO_SHAPE: Record<EncounterTriggerType, OrbitalShape> = {
  physical_proximity: "convergent",
  event_overlap: "crossing",
  community_overlap: "concentric",
  place_overlap: "parallel",
  schedule_overlap: "spiral",
  manual_seed: "convergent",
  system_retest: "spiral",
};

type Props = {
  triggerType: EncounterTriggerType;
  progress: number; // 0..1
  size?: number;
  colorA?: string;
  colorB?: string;
};

/**
 * Generate two SVG paths representing orbital trajectories
 * Returns { pathA, pathB, meetPoint }
 */
function generateOrbitals(
  shape: OrbitalShape,
  size: number,
  progress: number,
): { pathA: string; pathB: string; meetX: number; meetY: number } {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;

  switch (shape) {
    case "spiral": {
      // Two spiraling paths converging to center
      const angleA = progress * Math.PI * 3;
      const rA = r * (1 - progress);
      const xA = cx - r + (cx - rA * Math.cos(angleA) - (cx - r)) * progress;
      const yA = cy + rA * Math.sin(angleA) * (1 - progress * 0.5);
      const xB = cx + r - (cx + r - (cx + rA * Math.cos(angleA))) * progress;
      const yB = cy - rA * Math.sin(angleA) * (1 - progress * 0.5);
      return {
        pathA: `M ${cx - r} ${cy} Q ${xA} ${yA} ${cx} ${cy}`,
        pathB: `M ${cx + r} ${cy} Q ${xB} ${yB} ${cx} ${cy}`,
        meetX: cx,
        meetY: cy,
      };
    }
    case "parallel": {
      // Two parallel curves approaching each other
      const offset = r * (1 - progress);
      return {
        pathA: `M ${cx - r} ${cy - offset} Q ${cx} ${cy - offset * 0.3} ${cx + r * progress} ${cy}`,
        pathB: `M ${cx + r} ${cy + offset} Q ${cx} ${cy + offset * 0.3} ${cx - r * progress} ${cy}`,
        meetX: cx,
        meetY: cy,
      };
    }
    case "concentric": {
      // Two orbits of different radii shrinking together
      const r1 = r * (1 - progress * 0.5);
      const r2 = r * 0.6 * (1 - progress * 0.3);
      return {
        pathA: `M ${cx + r1} ${cy} A ${r1} ${r1} 0 1 1 ${cx - r1} ${cy} A ${r1} ${r1} 0 1 1 ${cx + r1} ${cy}`,
        pathB: `M ${cx + r2} ${cy} A ${r2} ${r2} 0 1 0 ${cx - r2} ${cy} A ${r2} ${r2} 0 1 0 ${cx + r2} ${cy}`,
        meetX: cx + r1,
        meetY: cy,
      };
    }
    case "convergent": {
      // Two arcs converging from opposite sides
      const spread = r * (1 - progress);
      return {
        pathA: `M ${cx - r} ${cy - spread} C ${cx - r * 0.3} ${cy - spread * 0.5} ${cx} ${cy} ${cx} ${cy}`,
        pathB: `M ${cx + r} ${cy + spread} C ${cx + r * 0.3} ${cy + spread * 0.5} ${cx} ${cy} ${cx} ${cy}`,
        meetX: cx,
        meetY: cy,
      };
    }
    case "crossing":
    default: {
      // Two paths crossing in an X pattern
      const off = r * (1 - progress * 0.8);
      return {
        pathA: `M ${cx - r} ${cy - off} Q ${cx} ${cy} ${cx + r * progress} ${cy + off * 0.3}`,
        pathB: `M ${cx + r} ${cy - off} Q ${cx} ${cy} ${cx - r * progress} ${cy + off * 0.3}`,
        meetX: cx,
        meetY: cy,
      };
    }
  }
}

export default function OrbitalPath({
  triggerType,
  progress,
  size = 240,
  colorA = "#6366F1",
  colorB = "#EC4899",
}: Props) {
  const shape = TRIGGER_TO_SHAPE[triggerType];
  const { pathA, pathB, meetX, meetY } = generateOrbitals(shape, size, progress);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <radialGradient id="orb-glow-a" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={colorA} stopOpacity={0.4} />
          <stop offset="100%" stopColor={colorA} stopOpacity={0} />
        </radialGradient>
        <radialGradient id="orb-glow-b" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={colorB} stopOpacity={0.4} />
          <stop offset="100%" stopColor={colorB} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* Trail paths */}
      <path
        d={pathA}
        fill="none"
        stroke={colorA}
        strokeWidth={1}
        strokeOpacity={0.3}
        strokeDasharray="4 4"
      />
      <path
        d={pathB}
        fill="none"
        stroke={colorB}
        strokeWidth={1}
        strokeOpacity={0.3}
        strokeDasharray="4 4"
      />

      {/* Meeting point glow (visible when converging) */}
      {progress > 0.7 && (
        <circle
          cx={meetX}
          cy={meetY}
          r={12 * (progress - 0.7) * 3.33}
          fill="url(#orb-glow-a)"
          opacity={Math.min(1, (progress - 0.7) * 5)}
        />
      )}
    </svg>
  );
}

export { TRIGGER_TO_SHAPE };
export type { OrbitalShape };
