"use client";

/**
 * CoAlter Negotiate モード提案カード (Phase 6.C, 2026-04-19)
 *
 * 契約:
 *  - CoAlter Phase 2 の 3-mode discriminated union で、card.mode === "negotiate" のとき描画される
 *  - **decision の UI 要素 (候補 swipe, 軸操作, refine) を混ぜない** (CEO 6.C 条件 #4)
 *  - proposals = 0 件は正常系。pieExpansion (方向性) のみで成立する
 *  - interests = non-negotiable / negotiable を A/B で分けて表示
 *
 * 参照: docs/coalter-phase2-3mode-design.md §4.2 (NegotiateCard 契約)
 */

import { motion } from "framer-motion";
import type { NegotiateCard, ProposalCandidate } from "@/lib/coalter/types";
import AneurasyncLogo from "@/components/ui/AneurasyncLogo";

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

interface Props {
  card: NegotiateCard;
  onDismiss: () => void;
  onAdopt?: (candidate: ProposalCandidate) => void;
}

export default function CoAlterNegotiateCard({ card, onDismiss, onAdopt }: Props) {
  const hasProposals = card.proposals.length > 0;

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
      {/* ヘッダー */}
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{
          background: `linear-gradient(135deg, ${C.coalter}10, ${C.pulse}08)`,
          borderBottom: `1px solid ${C.coalter}10`,
        }}
      >
        <div className="flex items-center gap-2">
          <AneurasyncLogo size={17} color={C.coalter} />
          <span style={{ fontSize: 12, color: C.coalter, fontWeight: 600 }}>
            CoAlter
          </span>
          <span
            style={{
              fontSize: 9,
              color: C.coalter,
              background: `${C.coalter}10`,
              border: `1px solid ${C.coalter}20`,
              borderRadius: 6,
              padding: "1px 6px",
              fontWeight: 500,
            }}
          >
            交渉モード
          </span>
        </div>
        <button
          onClick={onDismiss}
          style={{ fontSize: 10, color: C.t4, padding: 4, opacity: 0.5 }}
          aria-label="閉じる"
        >
          ✕
        </button>
      </div>

      {/* ① summary */}
      <div className="px-4 pt-3 pb-2">
        <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{card.summary}</p>
      </div>

      {/* ② interests: A / B の譲れない点 */}
      <div className="px-4 py-2">
        <div className="rounded-xl px-3 py-2.5" style={{ background: `${C.coalter}04` }}>
          <p style={{ fontSize: 10, color: C.coalter, fontWeight: 600, marginBottom: 4 }}>
            それぞれの譲れない点
          </p>
          {card.interests.a.nonNegotiable.length > 0 && (
            <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>
              A: {card.interests.a.nonNegotiable.join(" / ")}
            </p>
          )}
          {card.interests.b.nonNegotiable.length > 0 && (
            <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.5, marginTop: 2 }}>
              B: {card.interests.b.nonNegotiable.join(" / ")}
            </p>
          )}
        </div>
      </div>

      {/* ③ pieExpansion: 方向性 */}
      <div className="px-4 py-2">
        <p style={{ fontSize: 10, color: C.coalter, fontWeight: 600, marginBottom: 4 }}>
          試せる方向性
        </p>
        <ul className="flex flex-col" style={{ gap: 4 }}>
          {card.pieExpansion.axisShift && (
            <li style={{ fontSize: 11, color: C.t1, lineHeight: 1.5 }}>
              ・軸で: {card.pieExpansion.axisShift}
            </li>
          )}
          {card.pieExpansion.timeShift && (
            <li style={{ fontSize: 11, color: C.t1, lineHeight: 1.5 }}>
              ・時間で: {card.pieExpansion.timeShift}
            </li>
          )}
          {card.pieExpansion.placeShift && (
            <li style={{ fontSize: 11, color: C.t1, lineHeight: 1.5 }}>
              ・場所で: {card.pieExpansion.placeShift}
            </li>
          )}
        </ul>
      </div>

      {/* ④ proposals (0 件は正常系 — 出さない。1+ 件のみ描画) */}
      {hasProposals && (
        <div className="px-4 py-2">
          <p style={{ fontSize: 10, color: C.coalter, fontWeight: 600, marginBottom: 6 }}>
            第三案
          </p>
          <ul className="flex flex-col" style={{ gap: 6 }}>
            {card.proposals.map((p) => (
              <li
                key={p.rank}
                className="rounded-xl px-3 py-2"
                style={{ background: `${C.coalter}06`, border: `1px solid ${C.coalter}15` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p style={{ fontSize: 12, color: C.t1, fontWeight: 600 }}>
                      {p.title}
                    </p>
                    <p style={{ fontSize: 11, color: C.t2, marginTop: 2, lineHeight: 1.45 }}>
                      {p.oneLiner}
                    </p>
                    {p.practicalInfo && (
                      <p style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
                        {p.practicalInfo}
                      </p>
                    )}
                  </div>
                  {onAdopt && (
                    <button
                      onClick={() => onAdopt(p)}
                      className="flex-shrink-0 px-2 py-1 rounded-md"
                      style={{
                        fontSize: 10,
                        background: C.coalter,
                        color: "white",
                        fontWeight: 600,
                      }}
                    >
                      採用
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ⑤ closing */}
      <div
        className="px-4 py-2.5"
        style={{ background: `${C.coalter}04`, borderTop: `1px solid ${C.coalter}08` }}
      >
        <p
          style={{
            fontSize: 11,
            color: C.coalter,
            fontWeight: 500,
            textAlign: "center",
          }}
        >
          {card.closing}
        </p>
      </div>
    </motion.div>
  );
}
