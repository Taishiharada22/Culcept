// CognitiveFitDisplay.tsx
// 賢さレベル（Cognitive Fit）6軸の表示コンポーネント
// 認知スタイルをバーチャートで可視化 + 環境適性 + 矛盾インサイト
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface CognitiveFitData {
  scores: Record<string, number>;
  source: "observed" | "estimated";
  bandLabels: Record<string, { label: string; side: string; strengthNote: string }>;
  environmentFit: string[];
  contradictionInsight?: string;
}

const AXIS_LABELS: Record<string, { name: string; left: string; right: string; icon: string }> = {
  abstract_structuring: { name: "抽象構造化", left: "具体的", right: "抽象的", icon: "🧩" },
  decomposition: { name: "分解思考", left: "全体把握", right: "分解型", icon: "🔬" },
  cognitive_updating: { name: "判断更新", left: "信念保持", right: "柔軟更新", icon: "🔄" },
  decision_tempo: { name: "判断テンポ", left: "即断型", right: "熟考型", icon: "⏱" },
  social_modeling: { name: "他者理解", left: "行動ベース", right: "意図ベース", icon: "👁" },
  exploration_closure: { name: "探索-収束", left: "広く探索", right: "素早く絞る", icon: "🎯" },
};

export default function CognitiveFitDisplay() {
  const [data, setData] = useState<CognitiveFitData | null>(null);

  useEffect(() => {
    fetch("/api/stargazer/profile", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.cognitiveFit) setData(d.cognitiveFit);
      })
      .catch(() => {});
  }, []);

  if (!data || Object.keys(data.scores).length === 0) return null;

  const axes = Object.entries(AXIS_LABELS);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-[10px] font-mono tracking-wider uppercase" style={{ color: "rgba(96,78,42,0.5)" }}>
            COGNITIVE FIT
          </span>
          {data.source === "estimated" && (
            <span className="text-[9px] ml-2 px-1.5 py-0.5 rounded-full" style={{ background: "rgba(251,191,36,0.1)", color: "rgba(180,140,20,0.7)" }}>
              推定値
            </span>
          )}
        </div>
      </div>

      {/* 6-Axis Bars */}
      <div className="space-y-3">
        {axes.map(([axisId, meta], i) => {
          const score = data.scores[axisId] ?? 0;
          const band = data.bandLabels[axisId];
          // score: -1 (left) to +1 (right), center = 0
          // bar position: 0% (left) to 100% (right), center = 50%
          const position = (score + 1) / 2 * 100;

          return (
            <motion.div
              key={axisId}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: "rgba(30,40,60,0.7)" }}>
                  {meta.icon} {meta.name}
                </span>
                {band && (
                  <span className="text-[10px] font-semibold" style={{ color: "rgba(140,120,60,0.8)" }}>
                    {band.label}
                  </span>
                )}
              </div>
              {/* Bar */}
              <div className="relative" style={{ height: 8, borderRadius: 4, background: "rgba(0,0,0,0.04)" }}>
                {/* Center line */}
                <div style={{
                  position: "absolute", left: "50%", top: 0, bottom: 0, width: 1,
                  background: "rgba(0,0,0,0.08)",
                }} />
                {/* Score indicator */}
                <motion.div
                  style={{
                    position: "absolute", top: 1, width: 6, height: 6, borderRadius: 3,
                    background: "rgba(140,120,60,0.7)",
                    boxShadow: "0 1px 4px rgba(140,120,60,0.3)",
                  }}
                  initial={{ left: "50%" }}
                  animate={{ left: `calc(${position}% - 3px)` }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 + i * 0.06 }}
                />
              </div>
              {/* Left/Right labels */}
              <div className="flex justify-between mt-0.5">
                <span className="text-[9px]" style={{ color: "rgba(56,62,84,0.35)" }}>{meta.left}</span>
                <span className="text-[9px]" style={{ color: "rgba(56,62,84,0.35)" }}>{meta.right}</span>
              </div>
              {/* Strength note */}
              {band && (
                <p className="text-[10px] mt-0.5" style={{ color: "rgba(56,62,84,0.45)", lineHeight: 1.4 }}>
                  {band.strengthNote}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Environment Fit */}
      {data.environmentFit.length > 0 && (
        <div className="mt-5 p-3 rounded-xl" style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.1)" }}>
          <p className="text-[10px] font-semibold mb-2" style={{ color: "rgba(34,197,94,0.7)" }}>
            適した環境
          </p>
          {data.environmentFit.map((fit, i) => (
            <p key={i} className="text-xs leading-[1.6]" style={{ color: "rgba(30,40,60,0.7)" }}>
              • {fit}
            </p>
          ))}
        </div>
      )}

      {/* Contradiction Insight */}
      {data.contradictionInsight && (
        <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(139,92,246,0.04)", border: "1px solid rgba(139,92,246,0.1)" }}>
          <p className="text-[10px] font-semibold mb-1" style={{ color: "rgba(139,92,246,0.7)" }}>
            認知スタイルの矛盾
          </p>
          <p className="text-xs leading-[1.6]" style={{ color: "rgba(30,40,60,0.7)" }}>
            {data.contradictionInsight}
          </p>
        </div>
      )}
    </motion.div>
  );
}
