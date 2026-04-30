"use client";

/**
 * S2 Daily Mode (UI spec §4.3.3 / §5.5 Daily 列)
 *
 * override / 追加: Daily スコープ告知 (「今日の話で入るよ」、本文カード冒頭)
 */

import UpperLayerShell from "../../UpperLayerShell";
import Chip from "../../Chip";
import { DAILY_CONTEXT_MOCK } from "../../../mock/dailyContext";

export default function S2Daily() {
  return (
    <UpperLayerShell statusLabel="発話中" density="compact-card" modeLabel="Daily">
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
              color: "#6366F1",
              marginBottom: 4,
            }}
          >
            ◇ {DAILY_CONTEXT_MOCK.scopeAnnouncement}
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
