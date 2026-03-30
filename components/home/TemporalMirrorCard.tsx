"use client";

// components/home/TemporalMirrorCard.tsx
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Temporal Self-Mirror Card — 「先週のあなた vs 今のあなた」
//
// 脳科学的根拠:
// mPFCは「過去の自分」と「現在の自分」の比較時に最も強く活性化する。
// 静的なスコアより変化量の方が自己参照処理を刺激する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import Link from "next/link";
import type { TemporalDelta } from "@/lib/stargazer/temporalSelfMirror";

const mono = "'JetBrains Mono','SF Mono',monospace";

interface Props {
  delta: TemporalDelta;
  currentNarrative: string;
  previousNarrative: string;
}

export default function TemporalMirrorCard({
  delta,
  currentNarrative,
  previousNarrative,
}: Props) {
  const changeColor =
    delta.changeDepth >= 0.7
      ? "#EF4444"
      : delta.changeDepth >= 0.3
        ? "#F59E0B"
        : "#22c55e";
  const changeLabel =
    delta.changeDepth >= 0.7
      ? "大きな変化"
      : delta.changeDepth >= 0.3
        ? "いくつかの変化"
        : "安定";

  return (
    <div
      style={{
        borderRadius: 18,
        background:
          "linear-gradient(145deg, #D6E4FF44 0%, #ffffff 60%, #D6E4FF22 100%)",
        border: "1.5px solid rgba(59,130,246,0.15)",
        boxShadow:
          "0 4px 16px rgba(59,130,246,0.1), 0 1px 4px rgba(0,0,0,0.04)",
        padding: "16px 16px 14px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              color: "#6b6b80",
              letterSpacing: 2,
              fontWeight: 600,
              fontFamily: mono,
            }}
          >
            TEMPORAL MIRROR
          </span>
          <span style={{ fontSize: 12, color: "#1a1a2e", fontWeight: 600 }}>時間の鏡</span>
        </div>
        <div
          style={{
            padding: "2px 8px",
            borderRadius: 6,
            background: `${changeColor}10`,
            fontSize: 10,
            fontWeight: 700,
            color: changeColor,
          }}
        >
          {changeLabel}
        </div>
      </div>

      {/* Week comparison */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        {/* Previous week */}
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            background: "#f5f6fa",
            border: "1px solid #e0e2ee",
          }}
        >
          <div
            style={{
              fontSize: 8,
              color: "#b0b0c4",
              fontFamily: mono,
              marginBottom: 4,
            }}
          >
            {delta.previousWeek}
          </div>
          <div style={{ fontSize: 10, color: "#4a4a68", lineHeight: 1.4 }}>
            {previousNarrative.length > 40
              ? previousNarrative.slice(0, 40) + "…"
              : previousNarrative}
          </div>
        </div>

        {/* Arrow */}
        <div
          style={{
            fontSize: 16,
            color: changeColor,
            fontWeight: 900,
          }}
        >
          →
        </div>

        {/* Current week */}
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            background: "#eef2ff",
            border: `1px solid ${changeColor}30`,
          }}
        >
          <div
            style={{
              fontSize: 8,
              color: "#b0b0c4",
              fontFamily: mono,
              marginBottom: 4,
            }}
          >
            {delta.currentWeek}
          </div>
          <div
            style={{
              fontSize: 10,
              color: "#1a1a2e",
              lineHeight: 1.4,
              fontWeight: 600,
            }}
          >
            {currentNarrative.length > 40
              ? currentNarrative.slice(0, 40) + "…"
              : currentNarrative}
          </div>
        </div>
      </div>

      {/* Key delta highlights */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {/* Biggest axis shift */}
        {delta.biggestShift && Math.abs(delta.biggestShift.delta) >= 0.1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 8,
              background: "#faf5ff",
              border: "1px solid #e9d5ff",
            }}
          >
            <span style={{ fontSize: 12 }}>📊</span>
            <div style={{ flex: 1, fontSize: 10, color: "#4a4a68" }}>
              <strong>{delta.biggestShift.axisLabel}</strong>
              <span style={{ color: "#8888a0" }}>
                {" "}
                — {delta.biggestShift.direction}
              </span>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color:
                  Math.abs(delta.biggestShift.delta) >= 0.3
                    ? "#EF4444"
                    : "#F59E0B",
                fontFamily: mono,
              }}
            >
              {delta.biggestShift.delta > 0 ? "+" : ""}
              {Math.round(delta.biggestShift.delta * 100)}%
            </span>
          </div>
        )}

        {/* Contradiction change */}
        {delta.contradictionChange.delta !== 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 8,
              background:
                delta.contradictionChange.delta > 0 ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${delta.contradictionChange.delta > 0 ? "#fecaca" : "#bbf7d0"}`,
            }}
          >
            <span style={{ fontSize: 12 }}>
              {delta.contradictionChange.delta > 0 ? "⚡" : "✓"}
            </span>
            <div style={{ flex: 1, fontSize: 10, color: "#4a4a68", lineHeight: 1.4 }}>
              {delta.contradictionChange.interpretation.length > 60
                ? delta.contradictionChange.interpretation.slice(0, 60) + "…"
                : delta.contradictionChange.interpretation}
            </div>
          </div>
        )}

        {/* Weather change */}
        {delta.weatherChange.changed && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 8,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
            }}
          >
            <span style={{ fontSize: 12 }}>🌤️</span>
            <div style={{ flex: 1, fontSize: 10, color: "#4a4a68" }}>
              天気: {delta.weatherChange.previous} → {delta.weatherChange.current}
            </div>
          </div>
        )}
      </div>

      {/* Narrative */}
      <div
        style={{
          marginTop: 10,
          padding: "8px 10px",
          borderRadius: 10,
          background: "rgba(99,102,241,0.04)",
          border: "1px solid rgba(99,102,241,0.08)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "#1a1a2e",
            lineHeight: 1.6,
            fontWeight: 500,
          }}
        >
          {delta.deltaNarrative}
        </div>
      </div>
    </div>
  );
}
