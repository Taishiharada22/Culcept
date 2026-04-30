"use client";

/**
 * ZIndexInspector (L1-j)
 *
 * 正本: UI spec §2.3 z-index
 *
 * z-index 階層を立体的に可視化:
 *   1. Modal / Overlay (最上位)
 *   2. CoAlter 上部レイヤー (モーダル直下)
 *   3. メインチャット (中位)
 *   4. チャットヘッダー (CoAlter 同等または直下)
 *
 * 原則:
 *   - CoAlter はモーダルを表示しない (v1.1 §11.2 主役を奪わない)
 *   - 既存モーダル表示中は CoAlter は背後に下がる (フォーカス保全)
 */

const LAYERS = [
  { name: "Modal / Overlay (既存 UI)", z: 60, color: "#0EA5E9", note: "最上位" },
  { name: "CoAlter 上部レイヤー", z: 40, color: "#6366F1", note: "モーダル直下、メインチャット上" },
  { name: "メインチャット (吹き出し列)", z: 20, color: "#8B5CF6", note: "中位、既存" },
  { name: "チャットヘッダー", z: 10, color: "#A78BFA", note: "CoAlter と同等または直下" },
] as const;

export default function ZIndexInspector() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        §2.3 z-index 階層。CoAlter はモーダル直下 (CoAlter 自体はモーダル化禁止、
        既存モーダル表示中は背後に下がる)。
      </div>

      <div
        style={{
          position: "relative",
          height: 200,
          background: "#f5f6fa",
          border: "1px solid #c8c8dc",
          borderRadius: 6,
          padding: 16,
        }}
      >
        {LAYERS.map((l, i) => (
          <div
            key={l.name}
            style={{
              position: "absolute",
              left: 16 + i * 20,
              top: 16 + i * 28,
              padding: "8px 14px",
              background: l.color,
              color: "#ffffff",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.15)",
              minWidth: 280,
            }}
          >
            <div>{l.name}</div>
            <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.85 }}>
              z-index ≈ {l.z} / {l.note}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: "8px 10px",
          background: "#f5f6fa",
          borderRadius: 6,
          fontSize: 11,
          color: "#4a4a68",
          lineHeight: 1.6,
        }}
      >
        <div>· glassmorphism design system の既存 z-index token を借用</div>
        <div>· CoAlter がモーダルを表示しない (§2.3 / v1.1 §11.2)</div>
        <div>· 既存モーダル表示中は CoAlter レイヤーは背後に下がる (フォーカス保全)</div>
      </div>
    </div>
  );
}
