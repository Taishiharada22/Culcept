"use client";

/**
 * Pattern B — 状況言語化 (Frame) 文面カード (UI spec §3 / speech template §4)
 *
 * 応答後に二人の状況を言語化する。S5 橋渡しで発火。
 * トーン: 言語化を手伝う、断定しない、両者を均等に扱う。
 */

import { getPatternMock } from "../../mock/patterns";

export default function PatternB() {
  const mock = getPatternMock("B");
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
