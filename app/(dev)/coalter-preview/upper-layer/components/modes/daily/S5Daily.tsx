"use client";

/**
 * S5 Daily Mode (UI spec §4.3.6 / §5.8 Daily 列)
 *
 * override / 追加: Daily 文脈ヒントラベル (「◇ 今日のスケジュール見ながら」、
 *                  本文カード先頭に配置)
 */

import UpperLayerShell from "../../UpperLayerShell";
import Chip from "../../Chip";
import { DAILY_CONTEXT_MOCK } from "../../../mock/dailyContext";

export default function S5Daily() {
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
          <div
            style={{
              fontSize: 11,
              color: "#6366F1",
              marginBottom: 6,
            }}
          >
            {DAILY_CONTEXT_MOCK.contextHintLabel}
          </div>
          たいしさんは〜<br />
          みさきさんは〜<br />
          少し整理しながら話す？
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Chip variant="response">近い</Chip>
            <Chip variant="response">少し違う</Chip>
            <Chip variant="response">続けて</Chip>
          </div>
          <Chip variant="close">いったん戻る</Chip>
        </div>
      </div>
    </UpperLayerShell>
  );
}
