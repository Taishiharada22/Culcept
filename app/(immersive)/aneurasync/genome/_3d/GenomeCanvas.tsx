"use client";

import { Component, Suspense, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import type { GenomeStrand } from "@/lib/aneurasync/personaGenome";
import { useWebGLSupport } from "../hooks/useWebGLSupport";
import { useReducedMotion } from "../hooks/useReducedMotion";
import DnaHelixHero from "../_components/DnaHelixHero";
import GenomeScene from "./GenomeScene";
import HelixBackbone from "./HelixBackbone";
import BasePairNodes from "./BasePairNodes";
import { interleaveStrands3D } from "./helixMath";

/* ─── Error Boundary ─── */

class WebGLErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

/* ─── Loading indicator inside Canvas ─── */

function CanvasLoader() {
  return (
    <mesh>
      <sphereGeometry args={[0.5, 16, 16]} />
      <meshBasicMaterial color="#8b5cf6" transparent opacity={0.3} wireframe />
    </mesh>
  );
}

/* ─── Props ─── */

interface GenomeCanvasProps {
  strands: GenomeStrand[];
  overallLabel: string;
  overallDescription: string;
  completeness: number;
  /** Gene expression activation map (basePairId -> 0..1) */
  activationMap?: Map<string, number>;
  /** Expression filter mode */
  expressionMode?: "all" | "expressed";
}

/**
 * GenomeCanvas — the main 3D DNA helix canvas.
 * Detects WebGL support and falls back to the 2D SVG DnaHelixHero.
 */
export default function GenomeCanvas({
  strands,
  overallLabel,
  overallDescription,
  completeness,
  activationMap,
  expressionMode = "all",
}: GenomeCanvasProps) {
  const webglSupported = useWebGLSupport();
  const reducedMotion = useReducedMotion();

  const totalPairs = interleaveStrands3D(strands).length;

  // Detect mobile for perf tuning
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // Still detecting...
  if (webglSupported === null) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-[32px] border border-white/85 bg-white/76 backdrop-blur-xl">
        <div className="text-sm text-slate-400">3Dシーンを準備中...</div>
      </div>
    );
  }

  // Fallback to 2D SVG
  if (!webglSupported) {
    return (
      <DnaHelixHero
        strands={strands}
        overallLabel={overallLabel}
        overallDescription={overallDescription}
        completeness={completeness}
      />
    );
  }

  const svgFallback = (
    <DnaHelixHero
      strands={strands}
      overallLabel={overallLabel}
      overallDescription={overallDescription}
      completeness={completeness}
    />
  );

  return (
    <WebGLErrorBoundary fallback={svgFallback}>
      <div className="relative overflow-hidden rounded-[32px] border border-white/85 bg-gradient-to-b from-slate-950 via-[#0f0a2a] to-slate-950 shadow-[0_18px_48px_rgba(148,163,184,0.14)] ring-1 ring-slate-200/20">
        {/* 3D Canvas */}
        <div className="h-[420px] w-full sm:h-[500px]">
          <Canvas
            dpr={isMobile ? [1, 1.5] : [1, 2]}
            camera={{ position: [0, 0, 12], fov: 50 }}
            gl={{ antialias: true, alpha: false }}
          >
            <color attach="background" args={["#080a1a"]} />
            <fog attach="fog" args={["#080a1a", 14, 24]} />

            <Suspense fallback={<CanvasLoader />}>
              <GenomeScene autoRotate reducedMotion={reducedMotion}>
                <HelixBackbone
                  strands={strands}
                  totalPairs={totalPairs}
                  tubularSegments={isMobile ? 64 : 128}
                  radialSegments={isMobile ? 6 : 12}
                />
                <BasePairNodes
                  strands={strands}
                  animate={!reducedMotion}
                  activationMap={activationMap}
                  expressionMode={expressionMode}
                />
              </GenomeScene>
            </Suspense>
          </Canvas>
        </div>

        {/* Overlay info */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-6 pb-5 pt-12">
          <h3
            className="text-xl font-semibold text-white/90 sm:text-2xl"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            {overallLabel || "Persona Genome"}
          </h3>
          <p className="mt-1 text-sm text-white/50">{overallDescription}</p>
          <div className="mt-2 flex items-center gap-3">
            <span className="rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-3 py-1 text-xs font-black text-white shadow-[0_8px_20px_rgba(168,85,247,0.3)]">
              {completeness}%
            </span>
            <span className="text-xs text-white/40">完成度</span>
          </div>
        </div>

        {/* Strand legend */}
        <div className="absolute right-4 top-4 flex flex-col gap-1.5">
          {strands.map((strand) => (
            <div
              key={strand.id}
              className="flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 backdrop-blur-sm"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: strand.color }}
              />
              <span className="text-[10px] text-white/60">{strand.label}</span>
            </div>
          ))}
        </div>

        {/* Touch hint */}
        <div className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1.5 text-[10px] text-white/40 backdrop-blur-sm">
          ドラッグで回転 / ピンチでズーム
        </div>
      </div>
    </WebGLErrorBoundary>
  );
}
