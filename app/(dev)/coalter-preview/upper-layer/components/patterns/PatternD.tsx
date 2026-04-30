"use client";

/**
 * Pattern D — 片側フォーカス (Focus Side) 文面カード (UI spec §3 / speech template §6)
 *
 * 一方に丁寧に聞く。S5 橋渡しで発火、片側フォーカス導線追加。
 * トーン: 片側ずつ、相手をないがしろにしない。
 */

import { getPatternMock } from "../../mock/patterns";

export default function PatternD() {
  const mock = getPatternMock("D");
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
