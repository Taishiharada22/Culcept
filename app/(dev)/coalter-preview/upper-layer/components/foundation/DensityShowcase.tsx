"use client";

/**
 * DensityShowcase (L1-j)
 *
 * 正本: UI spec §1.4 UI 密度の段階
 *
 * 3 段階密度を visual demo として並列表示:
 *   - single-line  : 1 行のみ (S0, S8)
 *   - compact-card : 短い発話カード + 1-2 chip (S1, S2, S3, S4, S6)
 *   - expanded-card: 発話本文 + 3+ chip + 補助導線 (S5, S7)
 *
 * NOTE: layout plan §4.10 は「4 段階 (minimal/standard/focused/urgent)」と
 * 記載するが UI spec §1.4 は 3 段階を正本として固定しているため、本 demo は
 * 3 段階に揃える (L1-h memory 由来 3 種と同じ整合方針)。
 */

const ROWS = [
  {
    density: "single-line",
    states: "S0, S8",
    height: 36,
    description: "1 行のみ。CoAlter シンボル + ステータス、カードなし",
  },
  {
    density: "compact-card",
    states: "S1, S2, S3, S4, S6",
    height: 80,
    description: "短い発話カード (2-4 行) + 1-2 チップ",
  },
  {
    density: "expanded-card",
    states: "S5, S7",
    height: 160,
    description: "発話カード本文 (2-6 行) + 3 個以上のチップ + 補助導線",
  },
] as const;

export default function DensityShowcase() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        §1.4 UI 密度 3 段階。各段階の高さ・出現状態を並列で確認。
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ROWS.map((r) => (
          <div
            key={r.density}
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
              <span style={{ fontWeight: 600 }}>{r.density}</span>
              <span style={{ color: "#4a4a68" }}>
                {r.states} / 高さ ≈ {r.height}px
              </span>
            </div>
            <div
              style={{
                height: r.height,
                padding: 12,
                fontSize: 12,
                color: "#1a1a2e",
                display: "flex",
                alignItems: "center",
                lineHeight: 1.6,
              }}
            >
              <span style={{ color: "#6366F1", marginRight: 8 }}>🔵</span>
              {r.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
