"use client";

/**
 * Pattern A — 入口発話 (Entry) 文面カード (UI spec §3 / speech template §3)
 *
 * 介入気配からの最初の声がけ。S2 入口発話で発火。
 * トーン: 気配を寄せる、急がない、短い 1 行。
 */

import { getPatternMock } from "../../mock/patterns";

export default function PatternA() {
  const mock = getPatternMock("A");
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
