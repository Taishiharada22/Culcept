"use client";

/**
 * RateLimitDemo (L1-j)
 *
 * 正本: UI spec §1.6 連投抑制の構造的担保 / Core UX v1.1 §11.4 連投禁止
 *       v1.1 §8.6 5 分再起動禁止 (recentProposalWithin5Min)
 *
 * v1.1 §3.2 の通り、上部レイヤーは一度に 1 発話単位。UI 側で連投を構造的に抑制:
 *   - 発話本文カードは同時に 1 枚しか表示しない
 *   - S2 / S5 / S7 のいずれかがアクティブな間、次の発話は表示しない
 *   - S8 退出を経ないと S0 → S1 → S2 の再起動はかからない
 *   - 最短再起動間隔 = 5 分 (recentProposalWithin5Min と整合)
 *
 * 本 demo は連投を試みても 2 連発が起きないことを visual で示す
 * (Stage 2 reducer 接続前の構造保証)。
 */

import { useEffect, useRef, useState } from "react";

type SpeechState = "idle" | "speaking" | "cooldown";

export default function RateLimitDemo() {
  const [state, setState] = useState<SpeechState>("idle");
  const [attempts, setAttempts] = useState(0);
  const [active, setActive] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
    };
  }, []);

  const trySpeak = () => {
    setAttempts((a) => a + 1);
    if (state !== "idle") {
      // 連投抑制: speaking / cooldown 中は新規発話を表示しない
      return;
    }
    setActive((n) => n + 1);
    setState("speaking");
    // mock: speaking 2s → cooldown 3s → idle
    cooldownRef.current = setTimeout(() => {
      setState("cooldown");
      cooldownRef.current = setTimeout(() => {
        setState("idle");
      }, 3000);
    }, 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#4a4a68", lineHeight: 1.6 }}>
        §1.6 連投抑制 demo。試行回数を増やしても発話本文カードは同時に 1 枚以上
        表示されない (active 数 ≤ 1 が構造保証)。
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={trySpeak}
          style={{
            padding: "6px 14px",
            fontSize: 12,
            background: "#6366F1",
            color: "#ffffff",
            border: "1px solid #6366F1",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          発話を試みる (連打可)
        </button>
        <span style={{ fontSize: 11, color: "#4a4a68" }}>
          試行: {attempts} / 実発話: {active} / state:{" "}
          <strong
            style={{
              color:
                state === "speaking"
                  ? "#6366F1"
                  : state === "cooldown"
                    ? "#0EA5E9"
                    : "#1a1a2e",
            }}
          >
            {state}
          </strong>
        </span>
      </div>

      {/* 発話本文カード: 同時に 1 枚のみ */}
      <div
        style={{
          height: 80,
          padding: 12,
          border: "1px solid #c8c8dc",
          borderRadius: 6,
          background: "#ffffff",
          fontSize: 12,
          color: "#1a1a2e",
          display: "flex",
          alignItems: "center",
        }}
        aria-label="発話本文カード (同時に 1 枚のみ)"
      >
        {state === "speaking" ? (
          <>
            <span style={{ marginRight: 8, color: "#6366F1" }}>🔵</span>
            発話中 (mock #{active})
          </>
        ) : state === "cooldown" ? (
          <span style={{ color: "#0EA5E9", fontStyle: "italic" }}>
            cooldown 中 (S8 退出待ち / 5 分再起動禁止と整合 mock)
          </span>
        ) : (
          <span style={{ color: "#8888a0", fontStyle: "italic" }}>
            idle (新規発話を受け付ける状態)
          </span>
        )}
      </div>

      <div
        style={{
          padding: "8px 10px",
          background: "#f5f6fa",
          borderRadius: 6,
          fontSize: 11,
          color: "#4a4a68",
          lineHeight: 1.6,
        }}
      >
        <div>· 発話本文カードは同時 1 枚 (active ≤ 1 を構造保証)</div>
        <div>· S2 / S5 / S7 アクティブ中は次発話を表示しない</div>
        <div>· S8 退出を経ないと S0 → S1 → S2 再起動なし</div>
        <div>· 最短再起動 5 分 (v1.1 §8.6 / recentProposalWithin5Min)</div>
      </div>
    </div>
  );
}
