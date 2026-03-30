"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GenomeStrand } from "@/lib/aneurasync/personaGenome";
import {
  interleaveStrands3D,
  getBasePairPosition,
  getBasePairCenter,
  STRAND_COLORS,
} from "./helixMath";

interface BasePairNodesProps {
  strands: GenomeStrand[];
  /** Enable subtle pulsing animation */
  animate?: boolean;
  /** Gene expression activation levels (basePairId -> 0..1) */
  activationMap?: Map<string, number>;
  /** When "expressed", dormant genes shrink and dim */
  expressionMode?: "all" | "expressed";
}

/** Shared sphere geometry for all nodes */
const NODE_GEO = new THREE.SphereGeometry(0.12, 12, 12);

/**
 * Renders sphere nodes for each base pair + rung lines connecting left/right.
 * Supports gene expression: activation controls emissive + scale.
 * Dark genes (confidence < 0.3) have a distinct dark material.
 */
export default function BasePairNodes({
  strands,
  animate = true,
  activationMap,
  expressionMode = "all",
}: BasePairNodesProps) {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  const pairs = useMemo(() => interleaveStrands3D(strands), [strands]);
  const totalPairs = pairs.length;

  // Pre-compute positions
  const pairData = useMemo(() => {
    return pairs.map((pair) => {
      const left = getBasePairPosition(pair.index, totalPairs, pair.strandId, "left");
      const right = getBasePairPosition(pair.index, totalPairs, pair.strandId, "right");
      const center = getBasePairCenter(pair.index, totalPairs, pair.strandId);
      const color = STRAND_COLORS[pair.strandId] ?? "#6366f1";

      return {
        ...pair,
        left,
        right,
        center,
        color,
        isDark: pair.confidence < 0.3,
      };
    });
  }, [pairs, totalPairs]);

  // Rung geometries
  const rungGeos = useMemo(() => {
    return pairData.map((p) => {
      const points = [p.left, p.right];
      return new THREE.BufferGeometry().setFromPoints(points);
    });
  }, [pairData]);

  useFrame((_, delta) => {
    if (!animate || !groupRef.current) return;
    timeRef.current += delta;
  });

  return (
    <group ref={groupRef}>
      {pairData.map((pair, i) => {
        // Gene expression integration
        const activation = activationMap?.get(pair.id) ?? 1;
        const isDormant = expressionMode === "expressed" && activation < 0.4;

        // Scale: base value + expression modifier
        const baseScale = 0.7 + pair.value * 0.6;
        const scale = isDormant ? baseScale * 0.5 : baseScale;

        // Emissive: expression amplifies glow
        const baseEmissive = pair.confidence > 0 ? 0.1 + pair.confidence * 0.5 : 0.02;
        const emissiveIntensity = pair.isDark
          ? 0.02
          : isDormant
            ? 0.03
            : baseEmissive * (0.5 + activation * 0.5);

        // Opacity
        const nodeOpacity = pair.isDark
          ? 0.2
          : isDormant
            ? 0.15
            : 0.6 + pair.confidence * 0.35;

        // Color: dormant genes desaturate
        const nodeColor = pair.isDark
          ? "#1a1a2e"
          : isDormant
            ? "#555566"
            : pair.color;

        return (
          <group key={pair.id}>
            {/* Left node */}
            <mesh
              geometry={NODE_GEO}
              position={[pair.left.x, pair.left.y, pair.left.z]}
              scale={scale}
            >
              <meshStandardMaterial
                color={nodeColor}
                transparent
                opacity={nodeOpacity}
                roughness={0.35}
                metalness={0.15}
                emissive={nodeColor}
                emissiveIntensity={emissiveIntensity}
              />
            </mesh>

            {/* Right node */}
            <mesh
              geometry={NODE_GEO}
              position={[pair.right.x, pair.right.y, pair.right.z]}
              scale={scale}
            >
              <meshStandardMaterial
                color={nodeColor}
                transparent
                opacity={nodeOpacity}
                roughness={0.35}
                metalness={0.15}
                emissive={nodeColor}
                emissiveIntensity={emissiveIntensity}
              />
            </mesh>

            {/* Center glow for expressed high-confidence genes */}
            {!isDormant && pair.confidence > 0.6 && (
              <mesh
                position={[pair.center.x, pair.center.y, pair.center.z]}
                scale={0.12 + activation * 0.06}
              >
                <sphereGeometry args={[1, 8, 8]} />
                <meshBasicMaterial
                  color={pair.color}
                  transparent
                  opacity={0.2 + activation * 0.2}
                />
              </mesh>
            )}

            {/* Rung line */}
            <lineSegments geometry={rungGeos[i]}>
              <lineBasicMaterial
                color={pair.isDark ? "#333355" : isDormant ? "#444455" : pair.color}
                transparent
                opacity={pair.isDark ? 0.1 : isDormant ? 0.06 : 0.15 + pair.confidence * 0.2}
              />
            </lineSegments>
          </group>
        );
      })}
    </group>
  );
}
