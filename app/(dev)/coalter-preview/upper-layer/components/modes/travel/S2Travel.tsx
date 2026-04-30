"use client";

/**
 * S2 Travel Mode (UI spec §4.3.3 / §5.5 Travel 列)
 *
 * override / 追加: Travel スコープ告知 (「旅行の話で入るよ」、本文カード冒頭)
 */

import UpperLayerShell from "../../UpperLayerShell";
import Chip from "../../Chip";
import { TRAVEL_CONTEXT_MOCK } from "../../../mock/travelContext";

export default function S2Travel() {
  return (
    <UpperLayerShell statusLabel="発話中" density="compact-card" modeLabel="Travel">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            border: "1px solid #c8c8dc",
            borderRadius: 6,
            padding: "10px 12px",
            background: "#ffffff",
            fontSize: 13,
            color: "#1a1a2e",
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#0EA5E9",
              marginBottom: 4,
            }}
          >
            ◆ {TRAVEL_CONTEXT_MOCK.scopeAnnouncement}
          </div>
          <div>今、間に入れそう 〜</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip variant="response">たいし: そうかも</Chip>
          <Chip variant="response">みさき: …</Chip>
        </div>
      </div>
    </UpperLayerShell>
  );
}
