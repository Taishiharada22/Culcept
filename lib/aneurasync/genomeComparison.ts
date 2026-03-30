/**
 * genomeComparison.ts — 比較ゲノム計算
 *
 * 2人のゲノムデータをアライン・比較し、
 * 共鳴領域(complement)と衝突領域(clash)を算出する。
 */

import type { GenomeVisualizationData } from "./personaGenome";

/* ─── Types ─── */

export interface GenomeAlignment {
  basePairId: string;
  label: string;
  strandId: string;
  myValue: number;
  partnerValue: number;
  delta: number;
  alignmentType: "complement" | "clash" | "neutral";
}

export interface ComparativeGenomeData {
  myVisualization: GenomeVisualizationData;
  partnerVisualization: GenomeVisualizationData;
  partnerDisplayName: string;
  partnerAvatarUrl: string | null;
  alignments: GenomeAlignment[];
  harmonyScore: number;      // 0-100
  resonanceAreas: string[];  // human-readable resonance summaries
  clashAreas: string[];      // human-readable clash summaries
}

/* ─── Computation ─── */

/**
 * Compute alignments between two genome visualizations.
 * Matches base pairs by ID across both sets.
 */
export function computeAlignments(
  myViz: GenomeVisualizationData,
  partnerViz: GenomeVisualizationData,
): GenomeAlignment[] {
  // Build partner lookup
  const partnerMap = new Map<string, { value: number; label: string; strandId: string }>();
  for (const strand of partnerViz.strands) {
    for (const bp of strand.basePairs) {
      partnerMap.set(bp.id, { value: bp.value, label: bp.label, strandId: strand.id });
    }
  }

  const alignments: GenomeAlignment[] = [];

  for (const strand of myViz.strands) {
    for (const bp of strand.basePairs) {
      const partner = partnerMap.get(bp.id);
      if (!partner) continue;

      const delta = Math.abs(bp.value - partner.value);
      let alignmentType: GenomeAlignment["alignmentType"];

      if (delta < 0.15) {
        alignmentType = "complement";
      } else if (delta > 0.5) {
        alignmentType = "clash";
      } else {
        alignmentType = "neutral";
      }

      alignments.push({
        basePairId: bp.id,
        label: bp.label,
        strandId: strand.id,
        myValue: bp.value,
        partnerValue: partner.value,
        delta,
        alignmentType,
      });
    }
  }

  return alignments;
}

/**
 * Build full comparative data from two visualizations.
 */
export function buildComparativeData(
  myViz: GenomeVisualizationData,
  partnerViz: GenomeVisualizationData,
  partnerName: string,
  partnerAvatarUrl: string | null,
): ComparativeGenomeData {
  const alignments = computeAlignments(myViz, partnerViz);

  const complements = alignments.filter((a) => a.alignmentType === "complement");
  const clashes = alignments.filter((a) => a.alignmentType === "clash");
  const total = alignments.length;

  const harmonyScore =
    total > 0 ? Math.round((complements.length / total) * 100) : 50;

  // Generate human-readable summaries
  const resonanceAreas = complements.slice(0, 3).map((a) => `${a.label}が共鳴`);
  const clashAreas = clashes.slice(0, 3).map((a) => `${a.label}に差異`);

  return {
    myVisualization: myViz,
    partnerVisualization: partnerViz,
    partnerDisplayName: partnerName,
    partnerAvatarUrl,
    alignments,
    harmonyScore,
    resonanceAreas,
    clashAreas,
  };
}
