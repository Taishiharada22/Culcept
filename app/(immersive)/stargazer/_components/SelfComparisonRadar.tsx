// SelfComparisonRadar.tsx
// 2時点のレーダーチャートを重ねて表示（ゴーストレーダー）
// 過去の自分 vs 今の自分
"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";

interface Props {
  /** 現在のスコア */
  currentScores: Partial<Record<TraitAxisKey, number>>;
  /** 比較対象のスコア（過去） */
  pastScores: Partial<Record<TraitAxisKey, number>>;
  /** 比較期間のラベル */
  pastLabel?: string;
  /** 表示する軸（省略時は変化量 top 8） */
  focusAxes?: TraitAxisKey[];
}

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 30;
const LABEL_OFFSET = 14;

function polarToCartesian(angle: number, r: number): { x: number; y: number } {
  const rad = (angle - 90) * (Math.PI / 180);
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

function getPolygonPoints(
  scores: number[],
  angles: number[],
): string {
  return scores
    .map((score, i) => {
      const r = Math.abs(score) * RADIUS;
      const { x, y } = polarToCartesian(angles[i], r);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function SelfComparisonRadar({
  currentScores,
  pastScores,
  pastLabel = "1ヶ月前",
  focusAxes,
}: Props) {
  const { axes, currentValues, pastValues, deltas } = useMemo(() => {
    // 両方にスコアがある軸のみ
    const commonAxes = TRAIT_AXES.filter(
      (a) =>
        typeof currentScores[a.id] === "number" &&
        typeof pastScores[a.id] === "number" &&
        (Math.abs(currentScores[a.id]!) > 0.01 || Math.abs(pastScores[a.id]!) > 0.01)
    );

    let selected: typeof commonAxes;
    if (focusAxes && focusAxes.length > 0) {
      selected = commonAxes.filter((a) => focusAxes.includes(a.id));
    } else {
      // 変化量の大きい top 8
      selected = [...commonAxes]
        .sort((a, b) => {
          const da = Math.abs((currentScores[a.id] ?? 0) - (pastScores[a.id] ?? 0));
          const db = Math.abs((currentScores[b.id] ?? 0) - (pastScores[b.id] ?? 0));
          return db - da;
        })
        .slice(0, 8);
    }

    const cv = selected.map((a) => currentScores[a.id] ?? 0);
    const pv = selected.map((a) => pastScores[a.id] ?? 0);
    const deltas = selected.map((a, i) => cv[i] - pv[i]);

    return { axes: selected, currentValues: cv, pastValues: pv, deltas };
  }, [currentScores, pastScores, focusAxes]);

  if (axes.length < 3) {
    return (
      <div style={{ padding: "16px", textAlign: "center", color: "rgba(56,62,84,0.5)", fontSize: 13 }}>
        比較に必要なデータが蓄積されると表示されます
      </div>
    );
  }

  const angleStep = 360 / axes.length;
  const angles = axes.map((_, i) => i * angleStep);

  const currentPoly = getPolygonPoints(currentValues, angles);
  const pastPoly = getPolygonPoints(pastValues, angles);

  return (
    <div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" style={{ maxWidth: SIZE }} role="img" aria-label="自己比較レーダーチャート">
        {/* Grid circles */}
        {[0.25, 0.5, 0.75, 1.0].map((r) => (
          <circle
            key={r}
            cx={CENTER} cy={CENTER} r={RADIUS * r}
            fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={0.5}
          />
        ))}

        {/* Axis lines & labels */}
        {axes.map((axis, i) => {
          const { x: ex, y: ey } = polarToCartesian(angles[i], RADIUS);
          const { x: lx, y: ly } = polarToCartesian(angles[i], RADIUS + LABEL_OFFSET);
          return (
            <g key={axis.id}>
              <line x1={CENTER} y1={CENTER} x2={ex} y2={ey} stroke="rgba(0,0,0,0.06)" strokeWidth={0.5} />
              <text
                x={lx} y={ly}
                textAnchor="middle" dominantBaseline="central"
                fontSize={8} fill="rgba(56,62,84,0.5)"
              >
                {axis.labelRight}
              </text>
            </g>
          );
        })}

        {/* Past polygon (ghost) */}
        <motion.polygon
          points={pastPoly}
          fill="rgba(96,165,250,0.08)"
          stroke="rgba(96,165,250,0.3)"
          strokeWidth={1}
          strokeDasharray="4 3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        />

        {/* Current polygon */}
        <motion.polygon
          points={currentPoly}
          fill="rgba(140,120,60,0.1)"
          stroke="rgba(140,120,60,0.6)"
          strokeWidth={1.5}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
        />

        {/* Current dots */}
        {currentValues.map((score, i) => {
          const { x, y } = polarToCartesian(angles[i], Math.abs(score) * RADIUS);
          return (
            <circle key={`cur-${i}`} cx={x} cy={y} r={2.5} fill="rgba(140,120,60,0.8)" />
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 14, height: 2, background: "rgba(140,120,60,0.6)", display: "inline-block", borderRadius: 1 }} />
          <span style={{ fontSize: 10, color: "rgba(56,62,84,0.6)" }}>今</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 14, height: 2, background: "rgba(96,165,250,0.4)", display: "inline-block", borderRadius: 1, borderTop: "1px dashed rgba(96,165,250,0.6)" }} />
          <span style={{ fontSize: 10, color: "rgba(56,62,84,0.6)" }}>{pastLabel}</span>
        </div>
      </div>

      {/* Delta summary */}
      <div style={{ marginTop: 12, padding: "0 8px" }}>
        {deltas
          .map((delta, i) => ({ axis: axes[i], delta }))
          .filter((d) => Math.abs(d.delta) > 0.05)
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
          .slice(0, 3)
          .map(({ axis, delta }) => (
            <div key={axis.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{
                fontSize: 11, color: delta > 0 ? "rgba(34,197,94,0.8)" : "rgba(244,114,182,0.8)",
                fontWeight: 600, width: 40, textAlign: "right",
              }}>
                {delta > 0 ? "+" : ""}{(delta * 100).toFixed(0)}%
              </span>
              <span style={{ fontSize: 11, color: "rgba(56,62,84,0.7)" }}>
                {delta >= 0 ? axis.labelRight : axis.labelLeft}
                <span style={{ fontSize: 10, color: "rgba(120,130,160,0.55)", marginLeft: 3 }}>
                  （← {delta >= 0 ? axis.labelLeft : axis.labelRight}）
                </span>
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
