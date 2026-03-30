"use client";

/**
 * RendezvousDailyFlow
 * リストビュー上部に表示されるデイリーフック
 * 新候補数 + インサイト + 軌道サマリー
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type DailyData = {
  newCandidateCount: number;
  todayEncounterCount: number;
  insight: string;
  insightEmoji: string;
  greeting: string;
};

export default function RendezvousDailyFlow() {
  const [data, setData] = useState<DailyData | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    const key = `culcept_rendezvous_daily_${new Date().toISOString().slice(0, 10)}`;
    return !!sessionStorage.getItem(key);
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (dismissed) return;

    fetch("/api/rendezvous/daily")
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) setData(res.daily);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDismiss = () => {
    const key = `culcept_rendezvous_daily_${new Date().toISOString().slice(0, 10)}`;
    sessionStorage.setItem(key, "1");
    setDismissed(true);
  };

  if (loading || dismissed || !data) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        style={{
          background: "linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(168,85,247,0.06) 100%)",
          borderRadius: 16,
          padding: "16px 18px",
          marginBottom: 16,
          border: "1px solid rgba(99,102,241,0.08)",
          position: "relative",
        }}
      >
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "none",
            background: "rgba(0,0,0,0.04)",
            color: "rgba(30,30,60,0.3)",
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          &#10005;
        </button>

        {/* Greeting */}
        <p style={{ fontSize: 12, color: "rgba(30,30,60,0.4)", marginBottom: 4 }}>
          {data.greeting}
        </p>

        {/* Main insight */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{data.insightEmoji}</span>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1E1E3C", lineHeight: 1.5 }}>
            {data.insight}
          </p>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 16 }}>
          {data.newCandidateCount > 0 && (
            <Stat value={data.newCandidateCount} label="新しい交差" color="#6366F1" />
          )}
          {data.todayEncounterCount > 0 && (
            <Stat value={data.todayEncounterCount} label="今日の探索" color="#A855F7" />
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Stat({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
      <span style={{ fontSize: 20, fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: 10, color: "rgba(30,30,60,0.4)" }}>{label}</span>
    </div>
  );
}
