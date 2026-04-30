"use client";

/**
 * RetreatRail (L1-h)
 *
 * 正本: UI spec §8.4.2 後退導線の UI 配置
 *
 * memory 項目の右端 kebab、drawer 一括操作、履歴 revert を一覧化。
 *
 * §8.4.2 禁止:
 *   - 後退導線の隠蔽 (設定画面の奥への配置禁止)
 *   - 特定 state / mode で抑制 (どこからでもアクセス可能)
 *   - 警告文・心理的障壁文言の挿入 (§6.8 非判定性継承)
 */

interface RetreatPath {
  label: string;
  placement: string;
  trigger: string;
}

const RETREAT_PATHS: ReadonlyArray<RetreatPath> = [
  {
    label: "項目ごとの右端 kebab",
    placement: "MemoryItemCard 右端",
    trigger: "tap で 4 操作メニュー展開、項目ごとに独立",
  },
  {
    label: "drawer 内の一括操作",
    placement: "drawer 内ヘッダー",
    trigger: "選択 → 自分の画面から外す / 相手の可視範囲を下げる、複数項目まとめて",
  },
  {
    label: "履歴からの revert",
    placement: "drawer 上部 履歴タブ",
    trigger: "直前の操作を戻す (誤操作リカバリ)",
  },
];

export default function RetreatRail() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        後退導線 (§8.4.2)：常にアクセス可能。隠蔽・抑制・警告文挿入は禁止。
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {RETREAT_PATHS.map((p) => (
          <div
            key={p.label}
            style={{
              padding: "8px 10px",
              border: "1px solid #e8e8ec",
              borderRadius: 6,
              background: "#ffffff",
              fontSize: 12,
              color: "#1a1a2e",
              lineHeight: 1.6,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <div style={{ fontWeight: 600 }}>{p.label}</div>
            <div style={{ fontSize: 11, color: "#4a4a68" }}>
              配置: {p.placement}
            </div>
            <div style={{ fontSize: 11, color: "#4a4a68" }}>
              発動: {p.trigger}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
