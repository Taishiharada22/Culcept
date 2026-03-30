"use client";

/**
 * CompatibilityInsightCard v2
 * Constellation Overlap + Chemistry Quadrant + Relationship DNA + Trait Influence
 * バーチャート → 星座重ね合わせ可視化に進化
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { CompatibilityInsight } from "@/lib/rendezvous/insightGenerator";
import type { StyleChemistryMap } from "@/lib/relational/types";
import type { WithThisPersonResult } from "@/lib/relational/types";
import ConstellationOverlap from "./ConstellationOverlap";
import ChemistryQuadrantLegend from "./ChemistryQuadrantLegend";
import RelationshipDNA from "./RelationshipDNA";
import TraitInfluenceTooltip from "./TraitInfluenceTooltip";

type Props = {
  candidateId: string;
};

export default function CompatibilityInsightCard({ candidateId }: Props) {
  const [insight, setInsight] = useState<CompatibilityInsight | null>(null);
  const [syncPercent, setSyncPercent] = useState(0);
  const [chemistryMap, setChemistryMap] = useState<StyleChemistryMap | null>(null);
  const [withThisPerson, setWithThisPerson] = useState<WithThisPersonResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/rendezvous/${candidateId}/insights`)
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          setInsight(res.insight);
          setSyncPercent(res.syncPercent);
          if (res.chemistryMap) setChemistryMap(res.chemistryMap);
          if (res.withThisPerson) setWithThisPerson(res.withThisPerson);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [candidateId]);

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <span style={{ fontSize: 12, color: "rgba(30,30,60,0.3)" }}>分析中...</span>
      </div>
    );
  }

  if (!insight) return null;

  // Build constellation overlay axes from chemistryMap
  const constellationAxes = chemistryMap
    ? [
        ...chemistryMap.resonance,
        ...chemistryMap.complement,
        ...chemistryMap.friction,
        ...chemistryMap.unknown,
      ]
    : null;

  // Build quadrant counts for legend
  const quadrantCounts = chemistryMap
    ? [
        { quadrant: "resonance" as const, count: chemistryMap.resonance.length },
        { quadrant: "complement" as const, count: chemistryMap.complement.length },
        { quadrant: "friction" as const, count: chemistryMap.friction.length },
        { quadrant: "unknown" as const, count: chemistryMap.unknown.length },
      ]
    : null;

  // Build DNA segments
  const dnaSegments = constellationAxes?.map((a) => ({
    axis: a.axis,
    axisLabel: a.axisLabel,
    quadrant: a.quadrant,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "rgba(255,255,255,0.8)",
        backdropFilter: "blur(20px)",
        borderRadius: 16,
        padding: 20,
        border: "1px solid rgba(99,102,241,0.08)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>&#x2728;</span>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E1E3C", margin: 0 }}>
          相性インサイト
        </h3>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 700,
            color: "#6366F1",
            background: "rgba(99,102,241,0.08)",
            padding: "2px 8px",
            borderRadius: 6,
          }}
        >
          SYNC {syncPercent}%
        </span>
      </div>

      {/* Narrative */}
      <p style={{ fontSize: 13, color: "rgba(30,30,60,0.7)", lineHeight: 1.7, marginBottom: 16, margin: "0 0 16px" }}>
        {insight.overallNarrative}
      </p>

      {/* Constellation Overlap — replaces old bar chart */}
      {constellationAxes && constellationAxes.length >= 3 ? (
        <div style={{ marginBottom: 16 }}>
          <ConstellationOverlap candidateId={candidateId} />
        </div>
      ) : (
        /* Fallback: simple radar bars for matching vector */
        <FallbackRadarBars radarAxes={insight.radarAxes} />
      )}

      {/* Chemistry Quadrant Legend */}
      {quadrantCounts && (
        <div style={{ marginBottom: 16 }}>
          <ChemistryQuadrantLegend counts={quadrantCounts} />
        </div>
      )}

      {/* Trait Influence — "この人の前であなたは…" */}
      {withThisPerson && withThisPerson.influences.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <TraitInfluenceTooltip influences={withThisPerson.influences} />
        </div>
      )}

      {/* Relationship DNA */}
      {dnaSegments && chemistryMap && dnaSegments.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <RelationshipDNA
            segments={dnaSegments}
            summary={chemistryMap.summary}
            dominantQuadrant={chemistryMap.dominantQuadrant}
          />
        </div>
      )}

      {/* Connection points */}
      {insight.connectionPoints.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 6, margin: "0 0 6px" }}>
            共鳴ポイント
          </p>
          {insight.connectionPoints.map((point, i) => (
            <div
              key={i}
              style={{
                padding: "8px 10px",
                background: "rgba(34,197,94,0.04)",
                borderRadius: 8,
                marginBottom: 4,
                borderLeft: "3px solid rgba(34,197,94,0.5)",
              }}
            >
              <p style={{ fontSize: 12, color: "rgba(30,30,60,0.7)", margin: 0 }}>{point.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Friction points */}
      {insight.frictionPoints.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 6, margin: "0 0 6px" }}>
            注意ポイント
          </p>
          {insight.frictionPoints.map((point, i) => (
            <div
              key={i}
              style={{
                padding: "8px 10px",
                background: "rgba(245,158,11,0.04)",
                borderRadius: 8,
                marginBottom: 4,
                borderLeft: "3px solid rgba(245,158,11,0.5)",
              }}
            >
              <p style={{ fontSize: 12, color: "rgba(30,30,60,0.7)", margin: 0 }}>{point.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Advice */}
      <div
        style={{
          padding: "12px 14px",
          background: "rgba(99,102,241,0.04)",
          borderRadius: 10,
          marginBottom: 8,
        }}
      >
        <p style={{ fontSize: 10, fontWeight: 600, color: "#6366F1", marginBottom: 4, margin: "0 0 4px" }}>
          コミュニケーションのヒント
        </p>
        <p style={{ fontSize: 12, color: "rgba(30,30,60,0.65)", lineHeight: 1.6, margin: 0 }}>
          {insight.communicationAdvice}
        </p>
      </div>

      <p style={{ fontSize: 11, color: "rgba(30,30,60,0.4)", lineHeight: 1.5, margin: 0 }}>
        {insight.growthPotential}
      </p>
    </motion.div>
  );
}

/** Fallback: simple bar chart when Stargazer data is unavailable */
function FallbackRadarBars({
  radarAxes,
}: {
  radarAxes: CompatibilityInsight["radarAxes"];
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(30,30,60,0.45)", marginBottom: 8, margin: "0 0 8px" }}>
        10軸比較
      </p>
      {radarAxes.map((axis, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontSize: 10, color: "rgba(30,30,60,0.5)" }}>{axis.axis}</span>
          </div>
          <div style={{ display: "flex", gap: 2, height: 6 }}>
            <div
              style={{
                flex: 1,
                background: "rgba(99,102,241,0.08)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${axis.self}%`,
                  height: "100%",
                  background: "#6366F1",
                  borderRadius: 3,
                }}
              />
            </div>
            <div
              style={{
                flex: 1,
                background: "rgba(168,85,247,0.08)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${axis.other}%`,
                  height: "100%",
                  background: "#A855F7",
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <LegendDot color="#6366F1" label="あなた" />
        <LegendDot color="#A855F7" label="相手" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      <span style={{ fontSize: 10, color: "rgba(30,30,60,0.4)" }}>{label}</span>
    </div>
  );
}
