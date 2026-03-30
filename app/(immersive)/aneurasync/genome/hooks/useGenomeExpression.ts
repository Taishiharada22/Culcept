"use client";

import { useMemo, useState, useCallback } from "react";
import type { GenomeStrand } from "@/lib/aneurasync/personaGenome";
import {
  type GeneExpressionContext,
  type GeneActivation,
  buildExpressionContext,
  computeActivations,
} from "@/lib/aneurasync/genomeExpression";

export type ExpressionMode = "all" | "expressed";

interface UseGenomeExpressionResult {
  mode: ExpressionMode;
  setMode: (m: ExpressionMode) => void;
  toggleMode: () => void;
  activations: GeneActivation[];
  /** Map basePairId -> activationLevel for fast lookup */
  activationMap: Map<string, number>;
  context: GeneExpressionContext;
  expressedCount: number;
  dormantCount: number;
}

/**
 * Hook: computes gene expression activations for the current context.
 * Provides a mode toggle (all genes / expressed only).
 */
export function useGenomeExpression(
  strands: GenomeStrand[],
  contextOverrides?: Partial<GeneExpressionContext>,
): UseGenomeExpressionResult {
  const [mode, setMode] = useState<ExpressionMode>("all");

  const context = useMemo(
    () => buildExpressionContext(contextOverrides),
    [contextOverrides],
  );

  const activations = useMemo(
    () => computeActivations(strands, context),
    [strands, context],
  );

  const activationMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of activations) {
      map.set(a.basePairId, a.activationLevel);
    }
    return map;
  }, [activations]);

  const expressedCount = activations.filter((a) => a.activationLevel > 0.4).length;
  const dormantCount = activations.length - expressedCount;

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "all" ? "expressed" : "all"));
  }, []);

  return {
    mode,
    setMode,
    toggleMode,
    activations,
    activationMap,
    context,
    expressedCount,
    dormantCount,
  };
}
