"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * ObservatoryInsightsCard
 * 暗黙的行動観測からのインサイトを表示するカード。
 * ユーザーのMatchingVector軸が行動パターンからどう変化しているかを可視化。
 */

type ObservatoryAdjustment = {
  axis: string;
  delta: number;
  reason: string;
  created_at: string;
};

const AXIS_LABELS: Record<string, string> = {
  emotional_openness: "感情の開放度",
  conversation_temperature: "会話の温度",
  initiative: "主体性",
  depth_speed: "深さへの速度",
  social_energy: "社交エネルギー",
  stability_need: "安定への欲求",
  stimulation_need: "刺激への欲求",
  distance_need: "距離感",
  conflict_directness: "対立への直接性",
  structure_preference: "構造への好み",
};

type Props = {
  candidateId?: string;
};

export default function ObservatoryInsightsCard({ candidateId }: Props) {
  const [adjustments, setAdjustments] = useState<ObservatoryAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInsights() {
      try {
        const url = candidateId
          ? `/api/rendezvous/observatory/insights?candidateId=${candidateId}`
          : "/api/rendezvous/observatory/insights";
        const res = await fetch(url);
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        setAdjustments(data.adjustments ?? []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    fetchInsights();
  }, [candidateId]);

  if (loading || adjustments.length === 0) return null;

  // Sort by absolute delta, top 5
  const sorted = [...adjustments]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      style={{
        padding: "16px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.8)",
        border: "1px solid rgba(99,102,241,0.06)",
        marginBottom: 12,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            width: 2.5,
            height: 12,
            borderRadius: 2,
            background: "#8B5CF6",
          }}
        />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(30,30,60,0.6)",
            letterSpacing: 0.5,
          }}
        >
          行動観測レポート
        </span>
        <span
          style={{
            fontSize: 9,
            color: "rgba(30,30,60,0.3)",
            marginLeft: "auto",
          }}
        >
          Observatory
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sorted.map((adj, i) => {
          const label = AXIS_LABELS[adj.axis] ?? adj.axis;
          const isPositive = adj.delta > 0;
          const absPercent = Math.min(Math.abs(adj.delta) * 100, 100);

          return (
            <div
              key={`${adj.axis}-${i}`}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: isPositive
                  ? "rgba(99,102,241,0.04)"
                  : "rgba(251,191,36,0.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "rgba(30,30,60,0.65)",
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    fontFamily: "'JetBrains Mono','SF Mono',monospace",
                    color: isPositive ? "#6366F1" : "#D97706",
                  }}
                >
                  {isPositive ? "↑" : "↓"}{" "}
                  {(Math.abs(adj.delta) * 100).toFixed(1)}%
                </span>
              </div>

              {/* Mini progress bar */}
              <div
                style={{
                  width: "100%",
                  height: 3,
                  borderRadius: 2,
                  background: "rgba(30,30,60,0.05)",
                  overflow: "hidden",
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${absPercent}%` }}
                  transition={{ duration: 0.8, delay: 0.1 * i }}
                  style={{
                    height: "100%",
                    borderRadius: 2,
                    background: isPositive
                      ? "linear-gradient(90deg, #6366F1, #8B5CF6)"
                      : "linear-gradient(90deg, #F59E0B, #D97706)",
                  }}
                />
              </div>

              {adj.reason && (
                <p
                  style={{
                    fontSize: 10,
                    color: "rgba(30,30,60,0.4)",
                    lineHeight: 1.5,
                    marginTop: 4,
                    margin: "4px 0 0",
                  }}
                >
                  {adj.reason}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
