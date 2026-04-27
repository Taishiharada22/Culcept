"use client";

/**
 * S7 Daily Mode (UI spec §4.3.8 / §5.10 Daily 列)
 *
 * override: F-2 生活提案を主とする。F-1 は関係ノイズ低時抑制可、
 *          高時は補助表示として 1 行の関係配慮を残す。
 *
 * 本 preview は「関係ノイズが高い」想定で F-1 補助 1 行を併存させる。
 */

import UpperLayerShell from "../../UpperLayerShell";
import Chip from "../../Chip";

export default function S7Daily() {
  return (
    <UpperLayerShell statusLabel="発話中" density="expanded-card" modeLabel="Daily">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            border: "1px solid #c8c8dc",
            borderRadius: 6,
            padding: "12px 14px",
            background: "#ffffff",
            fontSize: 13,
            color: "#1a1a2e",
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, color: "#6366F1" }}>
            ◇ 今日のプラン:
          </div>
          <div>夕方の買い物の前に、20 分だけ話す時間を入れてみる？</div>
          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: "1px dashed #e8e8ec",
              fontSize: 12,
              color: "#4a4a68",
              fontStyle: "italic",
            }}
            aria-label="F-1 関係配慮 1 行（補助表示、関係ノイズ高時のみ）"
          >
            — お互いの様子を見ながら —
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Chip variant="approve">提案を受ける</Chip>
          <Chip variant="close">× 閉じる</Chip>
        </div>
      </div>
    </UpperLayerShell>
  );
}
