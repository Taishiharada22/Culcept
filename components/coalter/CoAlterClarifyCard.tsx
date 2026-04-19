"use client";

/**
 * CoAlter Clarify モード提案カード (Phase 6.C, 2026-04-19)
 *
 * 契約:
 *  - CoAlter Phase 2 の 3-mode discriminated union で、card.mode === "clarify" のとき描画される
 *  - **候補を持たない** (types.ts §2.2, §3 棲み分け)
 *    → ProposalCandidate 系の UI（swipe / axis / refine / 採用ボタン）を出さない
 *  - neutralTranslation は**言い換え（paraphrase）のみ**の表示
 *    → 感情調停・提案・感情中立化は行わない
 *  - question は 0 問または 1 問。emotion_heat mid または target 不明時は 0 問（非表示）
 *
 * 参照: docs/coalter-phase2-3mode-design.md §4.2 (ClarifyCard 契約)
 */

import { motion } from "framer-motion";
import type { ClarifyCard } from "@/lib/coalter/types";
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
  card: ClarifyCard;
  onDismiss: () => void;
  /**
   * 「この質問に会話で答える」押下時に呼ばれる（任意）。
   * ChatClient 側で awaitingAnswer マーカーを立てるのに使う。
   */
  onAnswerInChat?: (questionText: string) => void;
}

export default function CoAlterClarifyCard({ card, onDismiss, onAnswerInChat }: Props) {
  const hasFacts = card.pointList.facts.length > 0;
  const hasFeelings = card.pointList.feelings.length > 0;
  const hasAToB = !!card.neutralTranslation.aToB;
  const hasBToA = !!card.neutralTranslation.bToA;
  const hasQuestion = card.question !== null;

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
            すり合わせモード
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

      {/* ② pointList: 事実 / 気持ち */}
      {(hasFacts || hasFeelings) && (
        <div className="px-4 py-2">
          <div className="rounded-xl px-3 py-2.5" style={{ background: `${C.coalter}04` }}>
            {hasFacts && (
              <>
                <p
                  style={{
                    fontSize: 10,
                    color: C.coalter,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  事実
                </p>
                <ul className="flex flex-col" style={{ gap: 2, marginBottom: hasFeelings ? 8 : 0 }}>
                  {card.pointList.facts.map((f, i) => (
                    <li
                      key={`fact-${i}`}
                      style={{ fontSize: 11, color: C.t1, lineHeight: 1.5 }}
                    >
                      ・{f}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {hasFeelings && (
              <>
                <p
                  style={{
                    fontSize: 10,
                    color: C.coalter,
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  気持ち
                </p>
                <ul className="flex flex-col" style={{ gap: 2 }}>
                  {card.pointList.feelings.map((f, i) => (
                    <li
                      key={`feel-${i}`}
                      style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}
                    >
                      ・{f}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {/* ③ neutralTranslation: 言い換えのみ (paraphrase) */}
      {(hasAToB || hasBToA) && (
        <div className="px-4 py-2">
          <p
            style={{
              fontSize: 10,
              color: C.coalter,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            言い換え
          </p>
          <ul className="flex flex-col" style={{ gap: 4 }}>
            {hasAToB && (
              <li
                style={{
                  fontSize: 11,
                  color: C.t1,
                  lineHeight: 1.5,
                }}
              >
                A → B: 「{card.neutralTranslation.aToB}」
              </li>
            )}
            {hasBToA && (
              <li
                style={{
                  fontSize: 11,
                  color: C.t1,
                  lineHeight: 1.5,
                }}
              >
                B → A: 「{card.neutralTranslation.bToA}」
              </li>
            )}
          </ul>
        </div>
      )}

      {/* ④ question (最大 1 問、emotion_heat mid / target 不明時は 0 問 = null) */}
      {hasQuestion && card.question && (
        <div className="px-4 py-2">
          <div
            className="rounded-xl px-3 py-2.5"
            style={{
              background: `${C.pulse}06`,
              border: `1px solid ${C.pulse}15`,
            }}
          >
            <p
              style={{
                fontSize: 10,
                color: C.pulse,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {card.question.target === "a" ? "A さんへ" : "B さんへ"}
            </p>
            <p style={{ fontSize: 12, color: C.t1, lineHeight: 1.5 }}>
              {card.question.text}
            </p>
            {onAnswerInChat && (
              <div className="mt-2 flex justify-end">
                <button
                  onClick={() => onAnswerInChat(card.question!.text)}
                  className="px-3 py-1 rounded-md"
                  style={{
                    fontSize: 10,
                    background: C.coalter,
                    color: "white",
                    fontWeight: 600,
                  }}
                >
                  会話で答える
                </button>
              </div>
            )}
          </div>
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
