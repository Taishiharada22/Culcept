"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { GenomeStrand } from "@/lib/aneurasync/personaGenome";
import { HelixCurve, STRAND_PHASE, STRAND_COLORS, HELIX_RADIUS } from "./helixMath";

interface HelixBackboneProps {
  strands: GenomeStrand[];
  totalPairs: number;
  /** Lower = fewer segments for mobile perf */
  tubularSegments?: number;
  radialSegments?: number;
}

/**
 * TubeGeometry backbones for 4 DNA strands.
 * Each strand has a 90-degree phase offset around the helix.
 */
export default function HelixBackbone({
  strands,
  totalPairs,
  tubularSegments = 128,
  radialSegments = 12,
}: HelixBackboneProps) {
  const tubes = useMemo(() => {
    return strands.map((strand) => {
      const phase = STRAND_PHASE[strand.id] ?? 0;
      const curve = new HelixCurve(totalPairs, phase, HELIX_RADIUS);
      const geometry = new THREE.TubeGeometry(
        curve,
        tubularSegments,
        0.06, // tube radius
        radialSegments,
        false,
      );
      const color = STRAND_COLORS[strand.id] ?? "#6366f1";
      return { id: strand.id, geometry, color };
    });
  }, [strands, totalPairs, tubularSegments, radialSegments]);

  return (
    <group>
      {tubes.map((tube) => (
        <mesh key={tube.id} geometry={tube.geometry}>
          <meshStandardMaterial
            color={tube.color}
            transparent
            opacity={0.55}
            roughness={0.3}
            metalness={0.1}
            emissive={tube.color}
            emissiveIntensity={0.15}
          />
        </mesh>
      ))}
    </group>
  );
}
