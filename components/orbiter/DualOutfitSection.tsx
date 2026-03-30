"use client";

/**
 * DualOutfitSection
 * ふたりのスタイル — 2カラム（自分 / ペアの調和）+ 実践ヒント
 */

import type { DualOutfitAdvice } from "@/lib/orbiter/types";

const HARMONY_CONFIG = {
  high: {
    color: "#10B981",
    bg: "rgba(16, 185, 129, 0.08)",
    label: "調和度: 高い",
  },
  medium: {
    color: "#F59E0B",
    bg: "rgba(245, 158, 11, 0.08)",
    label: "調和度: 普通",
  },
  divergent: {
    color: "#8B5CF6",
    bg: "rgba(139, 92, 246, 0.08)",
    label: "調和度: 対比型",
  },
} as const;

type Props = {
  dualOutfit: DualOutfitAdvice;
};

export default function DualOutfitSection({ dualOutfit }: Props) {
  const { selfExpression, pairHarmony, practicalTips, sceneAdjustment } =
    dualOutfit;
  const harmonyConfig = HARMONY_CONFIG[pairHarmony.harmonyLevel];

  return (
    <div
      style={{
        padding: "20px 16px",
        borderRadius: 16,
        background: "rgba(255, 255, 255, 0.6)",
        border: "1px solid rgba(30, 30, 60, 0.06)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: 2.5,
              height: 12,
              borderRadius: 2,
              background: "#EC4899",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "rgba(30, 30, 60, 0.7)",
              letterSpacing: 0.5,
            }}
          >
            ふたりのスタイル
          </span>
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: harmonyConfig.color,
            padding: "2px 8px",
            borderRadius: 6,
            background: harmonyConfig.bg,
          }}
        >
          {harmonyConfig.label}
        </span>
      </div>

      {/* Two column: Self + Pair */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {/* Self Expression */}
        <div
          style={{
            padding: "12px",
            borderRadius: 12,
            background: "rgba(236, 72, 153, 0.04)",
            border: "1px solid rgba(236, 72, 153, 0.08)",
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "rgba(30, 30, 60, 0.4)",
              letterSpacing: 0.5,
              display: "block",
              marginBottom: 6,
            }}
          >
            あなたの表現
          </span>

          {/* Keywords */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginBottom: 8,
            }}
          >
            {selfExpression.keywords.map((kw) => (
              <span
                key={kw}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#EC4899",
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "rgba(236, 72, 153, 0.1)",
                }}
              >
                {kw}
              </span>
            ))}
          </div>

          <p
            style={{
              fontSize: 10,
              color: "rgba(30, 30, 60, 0.5)",
              lineHeight: 1.5,
              margin: "0 0 6px",
            }}
          >
            {selfExpression.narrative}
          </p>

          <span
            style={{
              fontSize: 9,
              color: "rgba(30, 30, 60, 0.4)",
            }}
          >
            🎨 {selfExpression.colorTone}
          </span>
        </div>

        {/* Pair Harmony */}
        <div
          style={{
            padding: "12px",
            borderRadius: 12,
            background: `${harmonyConfig.color}06`,
            border: `1px solid ${harmonyConfig.color}12`,
          }}
        >
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "rgba(30, 30, 60, 0.4)",
              letterSpacing: 0.5,
              display: "block",
              marginBottom: 6,
            }}
          >
            ペアの調和
          </span>

          <p
            style={{
              fontSize: 10,
              color: "rgba(30, 30, 60, 0.55)",
              lineHeight: 1.5,
              margin: "0 0 8px",
            }}
          >
            {pairHarmony.overlapStyle}
          </p>

          {pairHarmony.contrastStyle && (
            <p
              style={{
                fontSize: 10,
                color: "rgba(30, 30, 60, 0.4)",
                lineHeight: 1.5,
                margin: 0,
                fontStyle: "italic",
              }}
            >
              {pairHarmony.contrastStyle}
            </p>
          )}
        </div>
      </div>

      {/* Practical Tips */}
      {practicalTips.length > 0 && (
        <div style={{ marginBottom: sceneAdjustment ? 10 : 0 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "rgba(30, 30, 60, 0.4)",
              letterSpacing: 0.5,
              display: "block",
              marginBottom: 6,
            }}
          >
            実践ヒント
          </span>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {practicalTips.map((tip, i) => (
              <div
                key={`tip-${i}`}
                style={{
                  fontSize: 11,
                  color: "rgba(30, 30, 60, 0.55)",
                  lineHeight: 1.5,
                  padding: "4px 0",
                }}
              >
                💡 {tip}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scene adjustment */}
      {sceneAdjustment && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: "rgba(59, 130, 246, 0.04)",
            border: "1px solid rgba(59, 130, 246, 0.06)",
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "rgba(30, 30, 60, 0.5)",
              lineHeight: 1.5,
            }}
          >
            📍 {sceneAdjustment}
          </span>
        </div>
      )}
    </div>
  );
}
