"use client";

/**
 * Pattern F-2 — 生活提案 (Life Proposal) 文面カード
 * (UI spec §3 / speech template §9 / 統合契約 §4.2 family/variant 二層命名)
 *
 * 生活面に対する提案。S7 提案表示で発火。
 * トーン: 生活への配慮、押し付けない、Daily/Travel mode で主表示。
 *
 * 注: 内部表記は F2（ハイフン無し）、外部表記は F-2（統合契約 §4.2）。
 */

import { getPatternMock } from "../../mock/patterns";

export default function PatternF2() {
  const mock = getPatternMock("F-2");
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
      <div style={{ fontWeight: 600, marginBottom: 4 }}>提案:</div>
      <div>{mock.sample}</div>
    </article>
  );
}
