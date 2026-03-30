"use client";

import { useEffect, useState } from "react";

type Pattern = {
  patternType: string;
  descriptionJa: string;
  confidence: number;
};

export default function BehavioralPatternCard() {
  const [pattern, setPattern] = useState<Pattern | null>(null);

  useEffect(() => {
    fetch("/api/stargazer/behavioral-signals", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const p = d?.patterns?.[0];
        if (p?.descriptionJa) setPattern(p);
      })
      .catch(() => {});
  }, []);

  if (!pattern) return null;

  return (
    <div
      style={{
        padding: "16px 18px",
        borderRadius: 16,
        background: "rgba(139, 92, 246, 0.06)",
        border: "1px solid rgba(139, 92, 246, 0.12)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14 }}>🔮</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#8B5CF6", letterSpacing: 0.5 }}>
          あなたのパターン
        </span>
        <span
          style={{
            fontSize: 10,
            color: "rgba(139, 92, 246, 0.6)",
            marginLeft: "auto",
          }}
        >
          確信度 {Math.round(pattern.confidence * 100)}%
        </span>
      </div>
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.7,
          color: "rgba(30, 30, 60, 0.8)",
          margin: 0,
        }}
      >
        {pattern.descriptionJa}
      </p>
    </div>
  );
}
