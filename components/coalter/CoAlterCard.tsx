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

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ProposalCard } from "@/lib/coalter/types";
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

const RANK_EMOJI = ["🥇", "🥈", "🥉"];

/** 文字数超過時にtruncate */
function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

interface Props {
  proposal: ProposalCard;
  onDismiss: () => void;
  /** 候補を採用（Plan Shelfに追加） */
  onAdopt?: (candidate: ProposalCard["candidates"][number]) => void;
  /** 条件を変えて再提案 */
  onRefine?: () => void;
}

export default function CoAlterCard({ proposal, onDismiss, onAdopt, onRefine }: Props) {
  const [showRefine, setShowRefine] = useState(false);

  // refine時に表示するmissing constraint（最優先の1つ）
  const topMissing = proposal.missingConstraints?.[0] ?? null;
  const hasMissing = (proposal.missingConstraints?.length ?? 0) > 0;
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
          <AneurasyncLogo size={17} color={C.coalter} />
          <span style={{ fontSize: 12, color: C.coalter, fontWeight: 600 }}>
            CoAlter
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

      {/* ═══ ① ここまでの要点 ═══ */}
      <div className="px-4 pt-3 pb-2">
        <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>
          {clamp(proposal.summary, 100)}
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
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 12,
                        color: C.coalter,
                        fontWeight: 600,
                        textDecoration: "underline",
                        textUnderlineOffset: 2,
                      }}
                    >
                      {c.title} ↗
                    </a>
                  ) : (
                    <p style={{ fontSize: 12, color: C.t1, fontWeight: 600 }}>
                      {c.title}
                    </p>
                  )}
                  <p style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
                    {c.oneLiner}
                  </p>
                  {c.practicalInfo && (
                    <p style={{ fontSize: 10, color: C.t4, marginTop: 2 }}>
                      {c.practicalInfo}
                    </p>
                  )}
                </div>
                {onAdopt && (
                  <motion.button
                    onClick={() => onAdopt(c)}
                    className="flex-shrink-0 px-2.5 py-1 rounded-lg text-xs"
                    style={{
                      background: `${C.coalter}10`,
                      color: C.coalter,
                      border: `1px solid ${C.coalter}20`,
                      fontWeight: 500,
                      marginTop: 2,
                    }}
                    whileTap={{ scale: 0.95 }}
                  >
                    採用
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ ④ なぜこの候補か ═══ */}
      <div className="px-4 py-2">
        <p style={{ fontSize: 11, color: C.t3, lineHeight: 1.5, fontStyle: "italic" }}>
          {clamp(proposal.reasoning, 100)}
        </p>
      </div>

      {/* ═══ ⑤ アクションバー + 退出シグナル ═══ */}
      <div
        className="px-4 py-2.5"
        style={{
          background: `${C.coalter}04`,
          borderTop: `1px solid ${C.coalter}08`,
        }}
      >
        {/* Refine パネル（追加質問表示） */}
        <AnimatePresence>
          {showRefine && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div
                className="rounded-xl px-3 py-2.5 mb-2"
                style={{ background: `${C.coalter}08`, border: `1px solid ${C.coalter}15` }}
              >
                {topMissing ? (
                  <>
                    <p style={{ fontSize: 10, color: C.coalter, fontWeight: 600, marginBottom: 4 }}>
                      もう少し教えてくれると絞れそう
                    </p>
                    <p style={{ fontSize: 12, color: C.t1, lineHeight: 1.5 }}>
                      {topMissing.question}
                    </p>
                    {(proposal.missingConstraints?.length ?? 0) > 1 && (
                      <p style={{ fontSize: 10, color: C.t4, marginTop: 4 }}>
                        他にも: {proposal.missingConstraints!.slice(1).map(m => m.question).join("、")}
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: 11, color: C.t3, lineHeight: 1.5 }}>
                    条件はだいたい揃ってるけど、ピンとこなかったら二人で話を続けてみてね。
                    もう一度呼んでくれたら新しい候補を出すよ。
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 退出シグナル */}
        {!showRefine && (
          <p style={{ fontSize: 11, color: C.coalter, fontWeight: 500, textAlign: "center", marginBottom: 8 }}>
            {proposal.closing}
          </p>
        )}

        {/* アクションボタン */}
        <div className="flex gap-2">
          {!showRefine ? (
            <>
              <button
                onClick={() => {
                  setShowRefine(true);
                }}
                className="flex-1 py-2 rounded-xl text-xs transition-all"
                style={{
                  background: `${C.coalter}08`,
                  color: C.coalter,
                  border: `1px solid ${C.coalter}15`,
                  fontWeight: 500,
                }}
              >
                もう少し聞かせて
              </button>
              <button
                onClick={onDismiss}
                className="px-3 py-2 rounded-xl text-xs transition-all"
                style={{ background: C.s2, color: C.t4 }}
              >
                閉じる
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                onRefine?.();
              }}
              className="flex-1 py-2 rounded-xl text-xs transition-all"
              style={{ background: C.s2, color: C.t3 }}
            >
              わかった、話を続ける
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
