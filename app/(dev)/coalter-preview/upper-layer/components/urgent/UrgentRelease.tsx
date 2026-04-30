"use client";

/**
 * UrgentRelease (L1-i)
 *
 * 正本: UI spec §8.5.4 解除条件
 *
 * 4 解除契機を定性表示:
 *   - 介入完了 (発話成立 → 応答取得) → fade-out、通常状態へ
 *   - ユーザー反応 (dismiss tap) → fade-out + §6.8 非判定性 (責めない)
 *   - timeout (具体値 §9 保留) → 静かに fade-out、履歴にのみ残る
 *   - 上位優先切替 (さらに強い urgent 発生) → 前 urgent は置換 (重ね表示しない)
 *
 * §8.5.4 禁止:
 *   - dismiss 後の追加挽留 (閉じた後に別 urgent を自動発火させない)
 *   - timeout 後の沈黙ペナルティ ("無視した" とカウントしない、§6.8 継承)
 */

interface ReleasePath {
  key: "intervention_complete" | "user_dismiss" | "timeout" | "upper_priority_swap";
  label: string;
  uiResponse: string;
  forbidden: string;
}

const RELEASE_PATHS: ReadonlyArray<ReleasePath> = [
  {
    key: "intervention_complete",
    label: "介入完了 (発話成立 → 応答取得)",
    uiResponse: "overlay banner fade-out、通常状態へ",
    forbidden: "—",
  },
  {
    key: "user_dismiss",
    label: "ユーザー反応 (dismiss tap)",
    uiResponse: "fade-out (静かに) + §6.8 非判定性維持 (責めない)",
    forbidden: "dismiss 後の追加挽留・別 urgent 自動発火",
  },
  {
    key: "timeout",
    label: "timeout (具体値 §9 保留)",
    uiResponse: "静かに fade-out、履歴にのみ残る",
    forbidden: "沈黙ペナルティ・「無視」カウント",
  },
  {
    key: "upper_priority_swap",
    label: "上位優先切替 (さらに強い urgent 発生)",
    uiResponse: "前 urgent layer は置換 (重ね表示しない、§8.5.4)",
    forbidden: "複数 urgent layer 重ね表示 (§8.6.3)",
  },
];

export default function UrgentRelease({
  onRelease,
  released,
}: {
  onRelease?: (key: ReleasePath["key"]) => void;
  released?: ReleasePath["key"] | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        §8.5.4 解除条件 4 種。dismiss 後の追加挽留・timeout 後の沈黙ペナルティを
        構造的に禁止 (§6.8 継承)。
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {RELEASE_PATHS.map((p) => (
          <div
            key={p.key}
            style={{
              padding: "8px 10px",
              border: "1px solid #e8e8ec",
              borderRadius: 6,
              background: released === p.key ? "#eef2ff" : "#ffffff",
              fontSize: 12,
              color: "#1a1a2e",
              lineHeight: 1.6,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 600 }}>{p.label}</span>
              {onRelease && (
                <button
                  type="button"
                  onClick={() => onRelease(p.key)}
                  style={{
                    padding: "2px 10px",
                    fontSize: 11,
                    background: released === p.key ? "#6366F1" : "#ffffff",
                    color: released === p.key ? "#ffffff" : "#1a1a2e",
                    border: "1px solid #c8c8dc",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  発動
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#4a4a68" }}>
              UI 反応: {p.uiResponse}
            </div>
            <div style={{ fontSize: 11, color: "#8888a0", fontStyle: "italic" }}>
              禁止: {p.forbidden}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
