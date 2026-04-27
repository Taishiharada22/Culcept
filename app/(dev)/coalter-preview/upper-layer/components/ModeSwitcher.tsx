"use client";

/**
 * ModeSwitcher (L1-g)
 *
 * 正本: UI spec §6.3 手動切替の UI フロー
 *
 * ユーザーが任意のタイミングで `[通常] [Daily] [Travel]` を tap → 即時反映。
 * §2.3 モーダル化禁止 / §1.5 fade アニメ。
 *
 * 本 component は preview 視覚化。アニメ・実 logic は Stage 2 modeReducer (L2-h)。
 */

import { useState } from "react";
import type { ModeKind } from "../mock/modeTransitions";

const LABELS: Record<ModeKind, string> = {
  normal: "通常",
  daily: "Daily",
  travel: "Travel",
};

export default function ModeSwitcher() {
  const [active, setActive] = useState<ModeKind>("normal");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68" }}>
        手動切替 (§6.3)：tap 即時反映、モーダル確認なし
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {(["normal", "daily", "travel"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setActive(m)}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              border: "1px solid",
              borderColor: active === m ? "#6366F1" : "#c8c8dc",
              background: active === m ? "#6366F1" : "#ffffff",
              color: active === m ? "#ffffff" : "#1a1a2e",
              borderRadius: 16,
              cursor: "pointer",
              transition: "background 0.2s ease, color 0.2s ease",
            }}
          >
            {LABELS[m]}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#8888a0" }}>
        active: {LABELS[active]} ／ 切替後は共有メモリ surface 文脈スコープが新モード
        ルールで再参照される (v1.1 §10.2)
      </div>
    </div>
  );
}
