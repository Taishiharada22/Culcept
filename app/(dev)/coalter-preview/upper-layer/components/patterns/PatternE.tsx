"use client";

/**
 * Pattern E — 橋渡し・翻訳 (Bridge) 文面カード (UI spec §3 / speech template §7)
 *
 * 両者の差・ずれを翻訳する。S5 橋渡しで発火。
 * トーン: 差を翻訳する、どちらにも肩入れしない。
 */

import { getPatternMock } from "../../mock/patterns";

export default function PatternE() {
  const mock = getPatternMock("E");
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
