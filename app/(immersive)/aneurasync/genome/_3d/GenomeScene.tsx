"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

interface GenomeSceneProps {
  autoRotate?: boolean;
  reducedMotion?: boolean;
  children: React.ReactNode;
}

/**
 * Scene wrapper: lights, camera rig, OrbitControls.
 * Provides ambient + directional lighting for the DNA helix.
 */
export default function GenomeScene({
  autoRotate = true,
  reducedMotion = false,
  children,
}: GenomeSceneProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Gentle idle breathing when not auto-rotating
  useFrame((_, delta) => {
    if (reducedMotion || !groupRef.current) return;
    if (!autoRotate) {
      groupRef.current.rotation.y += delta * 0.05;
    }
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} color="#f8fafc" />
      <directionalLight position={[-3, -4, 4]} intensity={0.3} color="#c4b5fd" />
      <pointLight position={[0, 0, 6]} intensity={0.2} color="#a78bfa" />

      {/* Scene group */}
      <group ref={groupRef}>
        {children}
      </group>

      {/* Controls */}
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate && !reducedMotion}
        autoRotateSpeed={0.3}
        minDistance={6}
        maxDistance={20}
        minPolarAngle={Math.PI * 0.15}
        maxPolarAngle={Math.PI * 0.85}
      />
    </>
  );
}
