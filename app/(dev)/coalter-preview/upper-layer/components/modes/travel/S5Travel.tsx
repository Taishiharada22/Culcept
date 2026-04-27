"use client";

/**
 * S5 Travel Mode (UI spec §4.3.6 / §5.8 Travel 列)
 *
 * override / 追加:
 *   - Travel 文脈ヒントラベル (「◆ 複数日で考えると」、本文カード先頭)
 *   - 片側フォーカス導線の既定優先度を下げる (応答チップ行から下段に降格)
 *   - 関係シグナル (温度差 / 認識差 / 片側の引っかかり) 明確時は前面化に再昇格
 *     (preview 上は下段降格表示で表現。再昇格条件 §9.3.3 保留論点)
 */

import UpperLayerShell from "../../UpperLayerShell";
import Chip from "../../Chip";
import { TRAVEL_CONTEXT_MOCK } from "../../../mock/travelContext";

export default function S5Travel() {
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
          <div
            style={{
              fontSize: 11,
              color: "#0EA5E9",
              marginBottom: 6,
            }}
          >
            {TRAVEL_CONTEXT_MOCK.contextHintLabel}
          </div>
          たいしさんは Day 2 をゆっくり〜<br />
          みさきさんは現地で歩きたい〜<br />
          計画の流れ全体で見て、どこを揃えていく？
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
            <Chip variant="response">流れで合わせる</Chip>
            <Chip variant="response">日ごとに分ける</Chip>
            <Chip variant="response">続けて</Chip>
          </div>
          <Chip variant="close">いったん戻る</Chip>
        </div>

        {/* 片側フォーカス導線: Travel では下段降格 (関係シグナル明確時は同行に再昇格) */}
        <div
          style={{
            marginTop: 4,
            padding: "8px 10px",
            background: "#f4f6fc",
            border: "1px dashed #c8d0e0",
            borderRadius: 6,
            fontSize: 11,
            color: "#4a4a68",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
          aria-label="片側フォーカス導線（Travel: 下段降格、§4.3.6）"
        >
          <span style={{ fontStyle: "italic" }}>
            {TRAVEL_CONTEXT_MOCK.focusSideDemotionNote}
          </span>
          <Chip variant="response">片側で見る</Chip>
        </div>
      </div>
    </UpperLayerShell>
  );
}
