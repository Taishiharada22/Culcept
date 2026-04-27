"use client";

/**
 * S7 Travel Mode (UI spec §4.3.8 / §5.10 Travel 列)
 *
 * override:
 *   - F-2 生活提案 (複数日プラン Brief 形式) を主とする
 *   - F-1 関係提案は完全抑制せず、補助 1 行の関係配慮として副次同伴
 *     (独立カード化禁止、提案カード内最終行として収容、§7.10 合成規則)
 *   - 承認ゲート厳しめ (確認 1 クッション、§4.3.8 Travel)
 */

import UpperLayerShell from "../../UpperLayerShell";
import Chip from "../../Chip";
import { TRAVEL_CONTEXT_MOCK } from "../../../mock/travelContext";

export default function S7Travel() {
  return (
    <UpperLayerShell statusLabel="発話中" density="expanded-card" modeLabel="Travel">
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
          <div style={{ fontWeight: 600, marginBottom: 6, color: "#0EA5E9" }}>
            {TRAVEL_CONTEXT_MOCK.briefTitle}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {TRAVEL_CONTEXT_MOCK.itinerary.map((d) => (
              <div key={d.day} style={{ display: "flex", gap: 8 }}>
                <span
                  style={{
                    minWidth: 56,
                    fontSize: 11,
                    color: "#0EA5E9",
                    fontWeight: 600,
                  }}
                >
                  {d.day}
                </span>
                <span>{d.label}</span>
              </div>
            ))}
          </div>
          {/* F-1 副次同伴 1 行 (独立カード化禁止、§7.10 / §4.3.8 Travel: 完全抑制せず) */}
          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px dashed #e8e8ec",
              fontSize: 12,
              color: "#4a4a68",
              fontStyle: "italic",
            }}
            aria-label="F-1 副次同伴 1 行（Travel では完全抑制せず、提案カード内最終行）"
          >
            {TRAVEL_CONTEXT_MOCK.f1AccompanyLine}
          </div>
        </div>

        {/* 承認ゲート厳しめ: 確認 1 クッションを mock 表現 (§4.3.8 Travel) */}
        <div
          style={{
            padding: "8px 10px",
            background: "#fef9c3",
            border: "1px solid #fde68a",
            borderRadius: 6,
            fontSize: 11,
            color: "#713f12",
          }}
          aria-label="Travel 承認ゲート 1 クッション（§4.3.8）"
        >
          複数日のプランです。いったん確認してから受けますか？
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Chip variant="approve">確認して受ける</Chip>
          <Chip variant="close">× 閉じる</Chip>
        </div>
      </div>
    </UpperLayerShell>
  );
}
