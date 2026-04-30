"use client";

/**
 * AnimationCatalog (L1-j)
 *
 * 正本: UI spec §1.5 アニメカテゴリ
 *
 * 4 カテゴリ (fade / slide-down / pulse / none) を visual demo として並列表示。
 * duration / easing は §9 保留論点 (本 demo は暫定値で再生のみ)。
 *
 * NOTE: layout plan §4.10 は「5 カテゴリ (enter/exit/state-shift/urgent/retreat)」
 * と記載するが UI spec §1.5 は 4 カテゴリを正本として固定。本 demo は spec に揃える。
 */

import { useState } from "react";

type AnimKind = "fade" | "slide-down" | "pulse" | "none";

const ANIMS: ReadonlyArray<{
  kind: AnimKind;
  use: string;
  example: string;
}> = [
  {
    kind: "fade",
    use: "要素の出入り (控えめ)",
    example: "S0 → S1 のチップ出現",
  },
  {
    kind: "slide-down",
    use: "上部レイヤーの展開",
    example: "S1 → S2 のカード展開",
  },
  {
    kind: "pulse",
    use: "注意喚起 (緊急時のみ)",
    example: "S2/S5 で状態優先切替時",
  },
  {
    kind: "none",
    use: "遷移なし (即時切替)",
    example: "S6 内での chip 切替",
  },
];

export default function AnimationCatalog() {
  const [playing, setPlaying] = useState<AnimKind | null>(null);
  const [tick, setTick] = useState(0);

  const replay = (kind: AnimKind) => {
    setPlaying(kind);
    setTick((t) => t + 1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        §1.5 アニメ 4 カテゴリ。tap で再生 (preview のみ、duration / easing
        は §9 保留)。
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ANIMS.map((a) => (
          <div
            key={a.kind}
            style={{
              border: "1px solid #c8c8dc",
              borderRadius: 6,
              background: "#ffffff",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "6px 10px",
                background: "#f5f6fa",
                borderBottom: "1px solid #e8e8ec",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 11,
              }}
            >
              <span style={{ fontWeight: 600 }}>{a.kind}</span>
              <button
                type="button"
                onClick={() => replay(a.kind)}
                style={{
                  padding: "2px 10px",
                  fontSize: 11,
                  background: "#ffffff",
                  border: "1px solid #c8c8dc",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                再生
              </button>
            </div>
            <div
              style={{
                padding: 12,
                fontSize: 12,
                color: "#4a4a68",
                lineHeight: 1.6,
              }}
            >
              <div>用途: {a.use}</div>
              <div>例: {a.example}</div>
              {playing === a.kind && (
                <div
                  key={tick}
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    background: "#eef2ff",
                    border: "1px solid #6366F1",
                    borderRadius: 4,
                    fontSize: 12,
                    color: "#1a1a2e",
                    animation:
                      a.kind === "fade"
                        ? "demoFade 0.5s ease-out 1"
                        : a.kind === "slide-down"
                          ? "demoSlide 0.5s ease-out 1"
                          : a.kind === "pulse"
                            ? "demoPulse 0.6s ease-out 1"
                            : "none",
                  }}
                >
                  ● demo 要素 (kind: {a.kind})
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes demoFade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes demoSlide {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes demoPulse {
          0%   { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.5); }
          70%  { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0); }
          100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
        }
      `}</style>
    </div>
  );
}
