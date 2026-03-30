"use client";

/**
 * PremiumCompatibilityReport
 * プレミアムユーザー向け拡張互換性レポート
 * 10軸詳細分析 + 長期予測 + 成長ヒント
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import type { CompatibilityInsight } from "@/lib/rendezvous/insightGenerator";

type LongTermForecast = {
  stabilityScore: number;
  forecasts: { timeframe: string; prediction: string; confidence: number }[];
  growthAreas: string[];
};

type Props = {
  candidateId: string;
};

export default function PremiumCompatibilityReport({ candidateId }: Props) {
  const [insight, setInsight] = useState<CompatibilityInsight | null>(null);
  const [forecast, setForecast] = useState<LongTermForecast | null>(null);
  const [syncPercent, setSyncPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPremiumRequired, setIsPremiumRequired] = useState(false);

  useEffect(() => {
    fetch(`/api/rendezvous/${candidateId}/premium-report`)
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          setInsight(res.insight);
          setForecast(res.longTermForecast);
          setSyncPercent(res.syncPercent);
        } else if (res.isPremiumRequired) {
          setIsPremiumRequired(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [candidateId]);

  if (loading) {
    return (
      <div style={{ padding: 20, textAlign: "center" }}>
        <span style={{ fontSize: 12, color: "rgba(30,30,60,0.3)" }}>レポート生成中...</span>
      </div>
    );
  }

  if (isPremiumRequired) {
    return (
      <div
        style={{
          padding: "24px 20px",
          borderRadius: 16,
          background: "linear-gradient(135deg, rgba(99,102,241,0.04), rgba(236,72,153,0.04))",
          border: "1px solid rgba(99,102,241,0.1)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 12 }}>🔮</div>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: "#1E1E3C", marginBottom: 8 }}>
          拡張互換性レポート
        </h3>
        <p style={{ fontSize: 12, color: "rgba(30,30,60,0.5)", lineHeight: 1.6, marginBottom: 16 }}>
          10軸の詳細分析、長期予測、成長ヒントを含む
          <br />
          プレミアム限定レポートです
        </p>
        <button
          style={{
            padding: "10px 24px",
            borderRadius: 12,
            border: "none",
            background: "linear-gradient(135deg, #6366F1, #EC4899)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Premium を開始する
        </button>
      </div>
    );
  }

  if (!insight || !forecast) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: "20px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(99,102,241,0.08)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 20 }}>🔮</span>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#1E1E3C", margin: 0 }}>
            拡張互換性レポート
          </h3>
          <span style={{ fontSize: 10, color: "rgba(99,102,241,0.6)", fontWeight: 600 }}>
            PREMIUM
          </span>
        </div>
      </div>

      {/* Overall narrative */}
      <p style={{ fontSize: 13, color: "rgba(30,30,60,0.7)", lineHeight: 1.7, marginBottom: 16 }}>
        {insight.overallNarrative}
      </p>

      {/* Stability Score */}
      <div
        style={{
          padding: "16px",
          borderRadius: 12,
          background: "rgba(99,102,241,0.04)",
          marginBottom: 14,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(30,30,60,0.4)", marginBottom: 6 }}>
          安定性スコア
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: forecast.stabilityScore > 70 ? "#22C55E" : forecast.stabilityScore > 40 ? "#F59E0B" : "#EF4444",
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
          }}
        >
          {forecast.stabilityScore}
        </div>
      </div>

      {/* 10-axis radar (text representation) */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(30,30,60,0.5)", marginBottom: 8 }}>
          10軸詳細分析
        </div>
        {insight.radarAxes.map((axis) => (
          <div key={axis.axis} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(30,30,60,0.5)", marginBottom: 2 }}>
              <span>{axis.axis}</span>
              <span>自分 {Math.round(axis.self * 100)}% / 相手 {Math.round(axis.other * 100)}%</span>
            </div>
            <div style={{ display: "flex", gap: 2, height: 6 }}>
              <div style={{ flex: 1, borderRadius: 3, background: "rgba(99,102,241,0.15)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${axis.self * 100}%`, borderRadius: 3, background: "#6366F1" }} />
              </div>
              <div style={{ flex: 1, borderRadius: 3, background: "rgba(236,72,153,0.15)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${axis.other * 100}%`, borderRadius: 3, background: "#EC4899" }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Long-term forecast */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(30,30,60,0.5)", marginBottom: 8 }}>
          長期予測
        </div>
        {forecast.forecasts.map((f) => (
          <div
            key={f.timeframe}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              background: "rgba(99,102,241,0.03)",
              marginBottom: 6,
              borderLeft: `3px solid rgba(99,102,241,${0.3 + f.confidence * 0.4})`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#6366F1" }}>{f.timeframe}</span>
              <span style={{ fontSize: 9, color: "rgba(30,30,60,0.3)" }}>
                確信度 {Math.round(f.confidence * 100)}%
              </span>
            </div>
            <p style={{ fontSize: 12, color: "rgba(30,30,60,0.6)", margin: 0, lineHeight: 1.5 }}>
              {f.prediction}
            </p>
          </div>
        ))}
      </div>

      {/* Growth areas */}
      {forecast.growthAreas.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(30,30,60,0.5)", marginBottom: 6 }}>
            成長のヒント
          </div>
          {forecast.growthAreas.map((area, i) => (
            <p key={i} style={{ fontSize: 12, color: "rgba(30,30,60,0.6)", lineHeight: 1.6, margin: 0 }}>
              {area}
            </p>
          ))}
        </div>
      )}

      {/* Communication advice */}
      {insight.communicationAdvice && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.08)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#22C55E", marginBottom: 4 }}>
            コミュニケーションアドバイス
          </div>
          <p style={{ fontSize: 12, color: "rgba(30,30,60,0.6)", lineHeight: 1.6, margin: 0 }}>
            {insight.communicationAdvice}
          </p>
        </div>
      )}
    </motion.div>
  );
}
