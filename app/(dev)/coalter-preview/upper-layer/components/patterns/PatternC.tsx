"use client";

/**
 * Pattern C — 確認質問 (Confirm) 文面カード (UI spec §3 / speech template §5)
 *
 * 仮説を立てて確認を求める。S5 橋渡しで発火。
 * トーン: 「もしかして」「こういう感じかな」など仮置きの質問形。
 */

import { getPatternMock } from "../../mock/patterns";

export default function PatternC() {
  const mock = getPatternMock("C");
  return (
    <article
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
      <div style={{ fontSize: 11, color: "#8888a0", marginBottom: 4 }}>
        Pattern {mock.variant} — {mock.displayName} ({mock.toneCategory})
      </div>
      <div>{mock.sample}</div>
    </article>
  );
}
