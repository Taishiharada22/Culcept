"use client";

/**
 * RendezvousEmptyState
 * 各タブの空画面を状態ごとに作り分ける
 * 全部同じ暗い箱で終わらせない。
 *
 * 新しい交差 → 静かな高揚、探索中の感覚
 * 応答待ち → 漂う余韻、動きは止まっていない
 * 保留中 → 閉じきっていない残響、再観測可能性
 * 会話 → 交差が接続に変わった先にある場所
 */

import type { RendezvousListTab } from "@/lib/rendezvous/types";

type ContextKey = "home" | RendezvousListTab;

type EmptyConfig = {
  title: string;
  sub: string;
  gradientFrom: string;
  gradientTo: string;
  orbitColor: string;
  dotColor: string;
  animation: "scan" | "drift" | "glow" | "pulse";
};

const CONFIGS: Record<ContextKey, EmptyConfig> = {
  home: {
    title: "まだ新しい交差は届いていません",
    sub: "あなたの分身は今も静かに世界を歩いています",
    gradientFrom: "rgba(168,85,247,0.1)",
    gradientTo: "rgba(236,72,153,0.08)",
    orbitColor: "rgba(168,85,247,0.25)",
    dotColor: "rgba(236,72,153,0.5)",
    animation: "scan",
  },
  new: {
    title: "まだ新しい交差は届いていません",
    sub: "分身は探索を続けています。止まってはいません。",
    gradientFrom: "rgba(99,102,241,0.05)",
    gradientTo: "rgba(139,92,246,0.03)",
    orbitColor: "rgba(99,102,241,0.18)",
    dotColor: "rgba(99,102,241,0.4)",
    animation: "scan",
  },
  waiting: {
    title: "応答を待っている接続はありません",
    sub: "静かに漂う軌道の中で、返答はゆっくり届きます",
    gradientFrom: "rgba(251,191,36,0.04)",
    gradientTo: "rgba(255,179,71,0.02)",
    orbitColor: "rgba(251,191,36,0.12)",
    dotColor: "rgba(251,191,36,0.3)",
    animation: "drift",
  },
  saved: {
    title: "保留中の交差はありません",
    sub: "閉じきっていない交差は、ここに静かに保管されます",
    gradientFrom: "rgba(139,92,246,0.04)",
    gradientTo: "rgba(192,132,252,0.02)",
    orbitColor: "rgba(139,92,246,0.12)",
    dotColor: "rgba(139,92,246,0.3)",
    animation: "glow",
  },
  conversations: {
    title: "まだ会話は始まっていません",
    sub: "交差が接続に変わると、ここから会話が始まります",
    gradientFrom: "rgba(52,211,153,0.04)",
    gradientTo: "rgba(99,102,241,0.02)",
    orbitColor: "rgba(52,211,153,0.15)",
    dotColor: "rgba(52,211,153,0.4)",
    animation: "pulse",
  },
};

type Props = {
  context?: ContextKey;
};

export default function RendezvousEmptyState({ context = "home" }: Props) {
  const cfg = CONFIGS[context] ?? CONFIGS.home;
  const isHome = context === "home";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: isHome ? "20px 20px" : "40px 24px",
        borderRadius: isHome ? 12 : 16,
        background: isHome
          ? "linear-gradient(145deg, rgba(168,85,247,0.10) 0%, rgba(236,72,153,0.07) 40%, rgba(139,92,246,0.09) 100%)"
          : "linear-gradient(145deg, rgba(168,85,247,0.12) 0%, rgba(236,72,153,0.08) 40%, rgba(139,92,246,0.1) 100%)",
        border: isHome
          ? "1px solid rgba(168,85,247,0.18)"
          : "1.5px solid rgba(168,85,247,0.2)",
        boxShadow: isHome
          ? "0 2px 12px rgba(168,85,247,0.08)"
          : "0 6px 24px rgba(168,85,247,0.12), 0 2px 8px rgba(236,72,153,0.06)",
        textAlign: "center",
        gap: isHome ? 8 : 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 背景の観測軌道 */}
      <svg
        width={isHome ? 80 : 120}
        height={isHome ? 50 : 80}
        viewBox="0 0 120 80"
        fill="none"
        style={{ opacity: isHome ? 0.4 : 0.6 }}
      >
        {/* 軌道1 */}
        <ellipse
          cx={60}
          cy={40}
          rx={50}
          ry={22}
          stroke={cfg.orbitColor}
          strokeWidth={0.8}
          strokeDasharray="4 4"
          style={{
            animation:
              cfg.animation === "scan"
                ? "rv-orbit-rotate 20s linear infinite"
                : cfg.animation === "drift"
                  ? "rv-orbit-drift 12s ease-in-out infinite"
                  : undefined,
            transformOrigin: "60px 40px",
          }}
        />
        {/* 軌道2 */}
        <ellipse
          cx={60}
          cy={40}
          rx={50}
          ry={22}
          stroke={cfg.orbitColor}
          strokeWidth={0.6}
          strokeDasharray="3 5"
          transform="rotate(60 60 40)"
          style={{
            animation:
              cfg.animation === "scan"
                ? "rv-orbit-rotate 25s linear infinite reverse"
                : undefined,
            transformOrigin: "60px 40px",
          }}
        />
        {/* 中心点: 分身 */}
        <circle
          cx={60}
          cy={40}
          r={4}
          fill={cfg.dotColor}
          style={{
            animation:
              cfg.animation === "glow"
                ? "rv-dot-glow 3s ease-in-out infinite"
                : cfg.animation === "pulse"
                  ? "rv-dot-pulse 2s ease-in-out infinite"
                  : undefined,
          }}
        />
        {/* 探索点 */}
        <circle
          cx={95}
          cy={32}
          r={2}
          fill={cfg.dotColor}
          opacity={0.5}
          style={{
            animation: "rv-dot-pulse 3s ease-in-out infinite 0.5s",
          }}
        />
        <circle
          cx={30}
          cy={50}
          r={1.5}
          fill={cfg.dotColor}
          opacity={0.3}
          style={{
            animation: "rv-dot-pulse 4s ease-in-out infinite 1s",
          }}
        />
      </svg>

      <span
        style={{
          fontSize: isHome ? 12 : 14,
          fontWeight: 700,
          color: isHome ? "rgba(30, 30, 60, 0.7)" : "rgba(30, 30, 60, 0.8)",
          lineHeight: 1.4,
        }}
      >
        {cfg.title}
      </span>
      <span
        style={{
          fontSize: isHome ? 10 : 12,
          color: isHome ? "rgba(30, 30, 60, 0.5)" : "rgba(30, 30, 60, 0.35)",
          lineHeight: 1.6,
          maxWidth: 280,
        }}
      >
        {cfg.sub}
      </span>

      <style>{`
        @keyframes rv-orbit-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes rv-orbit-drift {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(6px); }
        }
        @keyframes rv-dot-glow {
          0%, 100% { opacity: 0.3; r: 4; }
          50% { opacity: 0.7; r: 5; }
        }
        @keyframes rv-dot-pulse {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}
