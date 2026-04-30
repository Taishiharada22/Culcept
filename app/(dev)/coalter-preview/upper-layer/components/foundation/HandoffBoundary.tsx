"use client";

/**
 * HandoffBoundary (L1-j)
 *
 * 正本: UI spec §2.7 action 実行後の handoff 境界
 *
 * 各 action の完結場所とメインチャット転送の有無を視覚化:
 *   - 応答チップ tap            → CoAlter 内完結、転送なし
 *   - 片側フォーカス             → CoAlter 内完結、転送なし
 *   - 「提案を聞く」tap          → CoAlter 内完結 (S6 → S7)、転送なし
 *   - 「いったん戻る」tap        → CoAlter 内完結 (S8 退出)、転送なし
 *   - 「この提案をチャットに共有」 → メインチャット転送 (明示的)
 *
 * 原則:
 *   - CoAlter 内完結 action はメインチャットに混入しない
 *   - 転送はユーザーが明示的に転送を選択した時のみ
 *   - 転送提案は CoAlter 吹き出しではなく、ユーザーの発話として記録
 *     (例: 「〜さんが共有した提案」、文面はテンプレ doc)
 */

interface HandoffRow {
  action: string;
  effect: string;
  transferToMainChat: boolean;
}

const ROWS: ReadonlyArray<HandoffRow> = [
  {
    action: "応答チップ tap (「近い」「少し違う」等)",
    effect: "CoAlter 内で state 遷移 (S5 → S6 等)",
    transferToMainChat: false,
  },
  {
    action: "片側フォーカス (「たいしに聞く」等)",
    effect: "CoAlter 発話が片側向けに更新",
    transferToMainChat: false,
  },
  {
    action: "「提案を聞く」tap",
    effect: "S6 → S7 遷移、提案が上部に表示",
    transferToMainChat: false,
  },
  {
    action: "「いったん戻る」tap",
    effect: "S8 退出、上部レイヤー最小化",
    transferToMainChat: false,
  },
  {
    action: "「この提案をチャットに共有」tap",
    effect: "提案がメインチャットの吹き出しとして transfer",
    transferToMainChat: true,
  },
];

export default function HandoffBoundary() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        §2.7 action 実行後の handoff 境界。CoAlter 内完結 action は混入しない。
        転送は明示的 tap のみ。転送された提案はユーザーの発話として記録される
        (CoAlter 吹き出しとしてではない)。
      </div>

      <div
        style={{
          border: "1px solid #c8c8dc",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1.5fr) 2fr 100px",
            background: "#f5f6fa",
            borderBottom: "1px solid #e8e8ec",
            fontSize: 11,
            fontWeight: 600,
            color: "#4a4a68",
          }}
        >
          <div style={cell}>action</div>
          <div style={cell}>実行後の挙動</div>
          <div style={cell}>転送</div>
        </div>
        {ROWS.map((r) => (
          <div
            key={r.action}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 1.5fr) 2fr 100px",
              borderBottom: "1px solid #e8e8ec",
              fontSize: 12,
              color: "#1a1a2e",
              background: r.transferToMainChat ? "#eef2ff" : "#ffffff",
            }}
          >
            <div style={cell}>{r.action}</div>
            <div style={cell}>{r.effect}</div>
            <div
              style={{
                ...cell,
                color: r.transferToMainChat ? "#6366F1" : "#8888a0",
                fontWeight: r.transferToMainChat ? 600 : 400,
              }}
            >
              {r.transferToMainChat ? "する (明示)" : "しない"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const cell: React.CSSProperties = {
  padding: "8px 10px",
  borderRight: "1px solid #e8e8ec",
  lineHeight: 1.5,
};
