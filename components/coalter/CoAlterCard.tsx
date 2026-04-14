"use client";

/**
 * CoAlter 提案カード — Phase 1 固定テンプレート
 *
 * ① ここまでの要点
 * ② 二人が重視している点
 * ③ 候補 2〜3
 * ④ なぜこの候補か
 * ⑤ あとは二人で決めてね
 */

import { motion } from "framer-motion";
import type { ProposalCard } from "@/lib/coalter/types";

const C = {
  coalter: "#6366F1",
  pulse: "#EC4899",
  s1: "#ffffff",
  s2: "#f5f6fa",
  t1: "#1a1a2e",
  t2: "#4a4a68",
  t3: "#8888a0",
  t4: "#c8c8dc",
};

const RANK_EMOJI = ["🥇", "🥈", "🥉"];

interface Props {
  proposal: ProposalCard;
  onDismiss: () => void;
}

export default function CoAlterCard({ proposal, onDismiss }: Props) {
  return (
    <motion.div
      className="mx-auto max-w-sm rounded-2xl overflow-hidden"
      style={{
        background: C.s1,
        border: `1px solid ${C.coalter}20`,
        boxShadow: `0 4px 20px ${C.coalter}08`,
      }}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {/* ═══ ヘッダー ═══ */}
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{
          background: `linear-gradient(135deg, ${C.coalter}10, ${C.pulse}08)`,
          borderBottom: `1px solid ${C.coalter}10`,
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 13 }}>✦</span>
          <span style={{ fontSize: 12, color: C.coalter, fontWeight: 600 }}>
            CoAlter
          </span>
        </div>
        <button
          onClick={onDismiss}
          style={{ fontSize: 11, color: C.t4, padding: 4 }}
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>

      {/* ═══ ① ここまでの要点 ═══ */}
      <div className="px-4 pt-3 pb-2">
        <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.6 }}>
          {proposal.summary}
        </p>
      </div>

      {/* ═══ ② 二人が重視している点 ═══ */}
      <div className="px-4 py-2">
        <div
          className="rounded-xl px-3 py-2.5"
          style={{ background: `${C.coalter}04` }}
        >
          <p style={{ fontSize: 10, color: C.coalter, fontWeight: 600, marginBottom: 4 }}>
            重視している点
          </p>
          <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>
            {proposal.priorities.userA}
          </p>
          <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.5, marginTop: 2 }}>
            {proposal.priorities.userB}
          </p>
          {proposal.priorities.common && (
            <p
              style={{
                fontSize: 11,
                color: C.coalter,
                lineHeight: 1.5,
                marginTop: 4,
                fontWeight: 500,
              }}
            >
              共通: {proposal.priorities.common}
            </p>
          )}
        </div>
      </div>

      {/* ═══ ③ 候補 2〜3 ═══ */}
      <div className="px-4 py-1">
        {proposal.candidates.map((c, i) => (
          <div
            key={c.rank}
            className="flex items-start gap-2 py-2"
            style={{
              borderTop: i > 0 ? `1px solid ${C.s2}` : undefined,
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>
              {RANK_EMOJI[i] ?? "•"}
            </span>
            <div className="flex-1 min-w-0">
              <p style={{ fontSize: 12, color: C.t1, fontWeight: 600 }}>
                {c.title}
              </p>
              <p style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
                {c.oneLiner}
              </p>
              {c.practicalInfo && (
                <p
                  style={{
                    fontSize: 10,
                    color: C.t4,
                    marginTop: 2,
                  }}
                >
                  {c.practicalInfo}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ ④ なぜこの候補か ═══ */}
      <div className="px-4 py-2">
        <p style={{ fontSize: 11, color: C.t3, lineHeight: 1.6, fontStyle: "italic" }}>
          {proposal.reasoning}
        </p>
      </div>

      {/* ═══ ⑤ あとは二人で決めてね ═══ */}
      <div
        className="px-4 py-2.5 text-center"
        style={{
          background: `${C.coalter}04`,
          borderTop: `1px solid ${C.coalter}08`,
        }}
      >
        <p style={{ fontSize: 11, color: C.coalter, fontWeight: 500 }}>
          {proposal.closing}
        </p>
      </div>
    </motion.div>
  );
}
