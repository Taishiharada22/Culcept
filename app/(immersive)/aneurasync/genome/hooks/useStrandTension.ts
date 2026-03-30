"use client";

import { useMemo } from "react";
import type { GenomeStrand } from "@/lib/aneurasync/personaGenome";
import { type TensionMapData, computeTensionMap } from "@/lib/aneurasync/genomeTension";

/**
 * Memoized wrapper for strand tension computation.
 */
export function useStrandTension(strands: GenomeStrand[]): TensionMapData {
  return useMemo(() => computeTensionMap(strands), [strands]);
}
