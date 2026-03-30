"use client";

// components/home/JourneyMap.tsx
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Self-Discovery Journey Map（自己発見コンステレーション）
// コンパクト版 — 水平スクロール不要の小さなダイヤモンド配置
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { useMemo } from "react";
import Link from "next/link";

type LiveIdentityKey = "origin" | "genome" | "presence" | "style";

interface JourneyNode {
  key: string;
  label: string;
  labelJa: string;
  emoji: string;
  href: string;
  color: string;
  pct: number;
  connections: string[];
}

interface Props {
  identityLive: Partial<Record<LiveIdentityKey, { pct: number; insight: string }>>;
  phenotypePct: number;
  stargazerConfidence: number;
  observationCount: number;
}

const NODE_DEFS: Omit<JourneyNode, "pct">[] = [
  {
    key: "origin",
    label: "Origin",
    labelJa: "起源",
    emoji: "🌌",
    href: "/origin",
    color: "#3B82F6",
    connections: ["genome", "stargazer"],
  },
  {
    key: "genome",
    label: "Genome",
    labelJa: "設計図",
    emoji: "🧬",
    href: "/genome-card",
    color: "#8B5CF6",
    connections: ["origin", "phenotype", "stargazer"],
  },
  {
    key: "phenotype",
    label: "Phenotype",
    labelJa: "外見",
    emoji: "👁️",
    href: "/phenotype",
    color: "#EC4899",
    connections: ["genome", "style"],
  },
  {
    key: "stargazer",
    label: "Stargazer",
    labelJa: "深層観測",
    emoji: "✦",
    href: "/stargazer",
    color: "#A78BFA",
    connections: ["origin", "genome", "presence", "style"],
  },
  {
    key: "presence",
    label: "Presence",
    labelJa: "存在感",
    emoji: "🫧",
    href: "/presence-profile",
    color: "#14B8A6",
    connections: ["stargazer", "rendezvous"],
  },
  {
    key: "style",
    label: "Style",
    labelJa: "美学",
    emoji: "◆",
    href: "/style-profile",
    color: "#F59E0B",
    connections: ["phenotype", "stargazer", "rendezvous"],
  },
  {
    key: "rendezvous",
    label: "Rendezvous",
    labelJa: "出会い",
    emoji: "∞",
    href: "/rendezvous",
    color: "#EF4444",
    connections: ["presence", "style"],
  },
];

// Compact diamond layout — fits in ~160px height
// viewBox = 0 0 300 160
const NODE_POSITIONS: Record<string, { x: number; y: number }> = {
  origin:     { x: 50,  y: 46 },
  genome:     { x: 120, y: 22 },
  phenotype:  { x: 250, y: 46 },
  stargazer:  { x: 150, y: 80 },
  presence:   { x: 50,  y: 114 },
  style:      { x: 250, y: 114 },
  rendezvous: { x: 150, y: 140 },
};

const mono = "'JetBrains Mono','SF Mono',monospace";

function constellationPath(
  x1: number, y1: number, x2: number, y2: number, curveStrength = 0.1
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx = mx - dy * curveStrength;
  const cy = my + dx * curveStrength;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

export default function JourneyMap({
  identityLive,
  phenotypePct,
  stargazerConfidence,
  observationCount,
}: Props) {
  const nodes: JourneyNode[] = useMemo(() => {
    return NODE_DEFS.map((def) => {
      let pct = 0;
      switch (def.key) {
        case "origin":
          pct = identityLive.origin?.pct ?? 0;
          break;
        case "genome":
          pct = identityLive.genome?.pct ?? 0;
          break;
        case "phenotype":
          pct = phenotypePct;
          break;
        case "stargazer":
          pct = Math.round(stargazerConfidence * 100);
          break;
        case "presence":
          pct = identityLive.presence?.pct ?? 0;
          break;
        case "style":
          pct = identityLive.style?.pct ?? 0;
          break;
        case "rendezvous":
          pct = Math.round(
            [
              identityLive.origin?.pct ?? 0,
              identityLive.genome?.pct ?? 0,
              phenotypePct,
              stargazerConfidence * 100,
              identityLive.presence?.pct ?? 0,
              identityLive.style?.pct ?? 0,
            ].reduce((s, v) => s + v, 0) / 6
          );
          break;
      }
      return { ...def, pct };
    });
  }, [identityLive, phenotypePct, stargazerConfidence, observationCount]);

  const overallPct = Math.round(
    nodes.reduce((s, n) => s + n.pct, 0) / nodes.length
  );

  const recommendedNode = nodes
    .filter((n) => n.pct < 80 && n.key !== "rendezvous")
    .sort((a, b) => a.pct - b.pct)[0];

  const edges = useMemo(() => {
    const seen = new Set<string>();
    const result: { from: string; to: string }[] = [];
    for (const node of NODE_DEFS) {
      for (const conn of node.connections) {
        const edgeKey = [node.key, conn].sort().join("-");
        if (!seen.has(edgeKey)) {
          seen.add(edgeKey);
          result.push({ from: node.key, to: conn });
        }
      }
    }
    return result;
  }, []);

  return (
    <div
      style={{
        borderRadius: 18,
        background: "linear-gradient(160deg, #0f0a1e 0%, #1a1135 40%, #0d0920 100%)",
        border: "1px solid rgba(139,92,246,0.15)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)",
        padding: "14px 14px 10px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background stars */}
      <div
        aria-hidden
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}
      >
        {[
          { x: 12, y: 18, s: 1, o: 0.25 },
          { x: 88, y: 12, s: 0.7, o: 0.18 },
          { x: 7,  y: 55, s: 0.8, o: 0.12 },
          { x: 95, y: 48, s: 0.6, o: 0.2 },
          { x: 30, y: 82, s: 0.7, o: 0.15 },
          { x: 75, y: 88, s: 0.9, o: 0.18 },
          { x: 45, y: 8,  s: 0.5, o: 0.1 },
        ].map((star, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.s,
              height: star.s,
              borderRadius: "50%",
              background: `rgba(255,255,255,${star.o})`,
            }}
          />
        ))}
      </div>

      {/* Nebula glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "35%", left: "35%", width: "30%", height: "30%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
          filter: "blur(20px)",
          pointerEvents: "none",
        }}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span
            style={{
              fontSize: 8,
              color: "rgba(167,139,250,0.6)",
              letterSpacing: 2.5,
              fontFamily: mono,
              fontWeight: 600,
            }}
          >
            JOURNEY MAP
          </span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
            自分を知る観測
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 40,
              height: 2.5,
              borderRadius: 2,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${overallPct}%`,
                height: "100%",
                borderRadius: 2,
                background: "linear-gradient(90deg, #8B5CF6, #A78BFA)",
                transition: "width 1s ease",
                boxShadow: "0 0 4px rgba(139,92,246,0.5)",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              color: "#A78BFA",
              fontFamily: mono,
            }}
          >
            {overallPct}%
          </span>
        </div>
      </div>

      {/* Compact Constellation Map */}
      <svg
        viewBox="0 0 300 160"
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          position: "relative",
          zIndex: 1,
        }}
      >
        <defs>
          <filter id="jm-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="jm-glow-strong" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="jm-center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(167,139,250,0.15)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        {/* Center glow behind Stargazer */}
        <circle
          cx={NODE_POSITIONS.stargazer.x}
          cy={NODE_POSITIONS.stargazer.y}
          r="35"
          fill="url(#jm-center-glow)"
        />

        {/* Constellation lines */}
        {edges.map(({ from, to }) => {
          const p1 = NODE_POSITIONS[from];
          const p2 = NODE_POSITIONS[to];
          if (!p1 || !p2) return null;

          const fromNode = nodes.find((n) => n.key === from);
          const toNode = nodes.find((n) => n.key === to);
          const bothActive = (fromNode?.pct ?? 0) > 0 && (toNode?.pct ?? 0) > 0;
          const eitherActive = (fromNode?.pct ?? 0) > 0 || (toNode?.pct ?? 0) > 0;

          const curveDir = (from < to) ? 0.06 : -0.06;
          const d = constellationPath(p1.x, p1.y, p2.x, p2.y, curveDir);

          return (
            <g key={`${from}-${to}`}>
              {bothActive && (
                <path
                  d={d}
                  fill="none"
                  stroke="rgba(167,139,250,0.12)"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={
                  bothActive
                    ? "rgba(167,139,250,0.45)"
                    : eitherActive
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(255,255,255,0.03)"
                }
                strokeWidth={bothActive ? 1.2 : 0.6}
                strokeLinecap="round"
                strokeDasharray={bothActive ? undefined : "2 5"}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const pos = NODE_POSITIONS[node.key];
          if (!pos) return null;
          const isRecommended = recommendedNode?.key === node.key;
          const isActive = node.pct > 0;
          const isComplete = node.pct >= 80;
          const isCenter = node.key === "stargazer";
          const nodeR = isCenter ? 16 : 12;

          return (
            <Link href={node.href} key={node.key} style={{ textDecoration: "none" }}>
              <g style={{ cursor: "pointer" }}>
                {/* Recommended pulse ring */}
                {isRecommended && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={nodeR + 6}
                    fill="none"
                    stroke={node.color}
                    strokeWidth="0.8"
                    opacity="0.35"
                  >
                    <animate
                      attributeName="r"
                      values={`${nodeR + 3};${nodeR + 9};${nodeR + 3}`}
                      dur="3s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.35;0.08;0.35"
                      dur="3s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Progress ring */}
                {isActive && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={nodeR + 2}
                    fill="none"
                    stroke={node.color}
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    opacity="0.3"
                    strokeDasharray={`${((node.pct / 100) * 2 * Math.PI * (nodeR + 2)).toFixed(1)} ${(2 * Math.PI * (nodeR + 2)).toFixed(1)}`}
                    transform={`rotate(-90 ${pos.x} ${pos.y})`}
                  />
                )}

                {/* Node glow */}
                {isActive && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={nodeR}
                    fill={`${node.color}${isComplete ? "14" : "0a"}`}
                    filter={isRecommended ? "url(#jm-glow-strong)" : "url(#jm-glow)"}
                  />
                )}

                {/* Node circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={nodeR}
                  fill={
                    isActive
                      ? `${node.color}12`
                      : "rgba(255,255,255,0.03)"
                  }
                  stroke={
                    isComplete
                      ? node.color
                      : isActive
                        ? `${node.color}70`
                        : "rgba(255,255,255,0.08)"
                  }
                  strokeWidth={isComplete ? 1.2 : 0.8}
                />

                {/* Emoji */}
                <text
                  x={pos.x}
                  y={pos.y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={isCenter ? 12 : 10}
                  opacity={isActive ? 1 : 0.3}
                  style={{ pointerEvents: "none" }}
                >
                  {node.emoji}
                </text>

                {/* Complete check */}
                {isComplete && (
                  <g transform={`translate(${pos.x + nodeR - 3}, ${pos.y + nodeR - 3})`}>
                    <circle r="4.5" fill="#22c55e" />
                    <polyline
                      points="-2,0.5 -0.5,2 2.5,-1"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )}

                {/* Label + % combined */}
                <text
                  x={pos.x}
                  y={pos.y + nodeR + 10}
                  textAnchor="middle"
                  fill={isActive ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)"}
                  fontSize="7"
                  fontWeight={isRecommended ? 700 : 500}
                  fontFamily={mono}
                  letterSpacing="0.3"
                  style={{ pointerEvents: "none" }}
                >
                  {node.label}
                  <tspan
                    fill={
                      isComplete
                        ? "#22c55e"
                        : isActive
                          ? node.color
                          : "rgba(255,255,255,0.12)"
                    }
                    fontSize="6.5"
                    fontWeight="700"
                  >
                    {" "}{node.pct}%
                  </tspan>
                </text>
              </g>
            </Link>
          );
        })}
      </svg>

      {/* Compact recommended action */}
      {recommendedNode && (
        <Link
          href={recommendedNode.href}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 6,
            padding: "7px 10px",
            borderRadius: 10,
            background: `linear-gradient(135deg, ${recommendedNode.color}0c, ${recommendedNode.color}05)`,
            border: `1px solid ${recommendedNode.color}20`,
            textDecoration: "none",
            color: "inherit",
            transition: "all 0.3s ease",
            position: "relative",
            zIndex: 1,
          }}
        >
          <span style={{ fontSize: 13, flexShrink: 0 }}>
            {recommendedNode.emoji}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: recommendedNode.color,
              }}
            >
              次: {recommendedNode.label}
            </span>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginLeft: 6 }}>
              {recommendedNode.pct === 0
                ? "未入力 — ここから始めよう"
                : `${recommendedNode.pct}% — もう少しで発見`}
            </span>
          </div>
          <span
            style={{
              fontSize: 12,
              color: recommendedNode.color,
              fontWeight: 700,
              opacity: 0.6,
            }}
          >
            →
          </span>
        </Link>
      )}
    </div>
  );
}
