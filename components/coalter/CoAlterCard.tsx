"use client";

/**
 * CoAlter 提案カード — Phase 1.5
 *
 * ① ここまでの要点
 * ② 二人が重視している点
 * ③ 候補 2〜3（各候補に軸スコアの小可視化）
 * ④ なぜこの候補か
 * ⑤ アクションバー
 *
 * Phase 1.5 の追加:
 * - pairFit バッジ（ヘッダー下）
 * - 軸スコアの可視化（候補ごと）
 * - refine 2分岐（missingConstraints あり or 条件揃い＋軸チップ）
 * - pendingAxisDeltas の ± トグル
 * - reroll（軸で出し直す）／この3つから選ぶ
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  ProposalCard,
  ProposalCandidate,
  AxisKey,
  AxisDelta,
  PendingAxisDeltas,
  AxisScores,
} from "@/lib/coalter/types";
import { getAxisMeta } from "@/lib/coalter/axes";
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

/** ●/○ で軸スコアを描画（max=3） */
function ScoreDots({ value }: { value: 0 | 1 | 2 | 3 }) {
  return (
    <span style={{ letterSpacing: 1, fontSize: 9, color: C.t3 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <span key={i} style={{ color: i < value ? C.coalter : C.t4, marginLeft: i === 0 ? 0 : 0 }}>
          {i < value ? "●" : "○"}
        </span>
      ))}
    </span>
  );
}

interface Props {
  proposal: ProposalCard;
  onDismiss: () => void;
  /** 候補を採用（Plan Shelfに追加） */
  onAdopt?: (candidate: ProposalCandidate) => void;
  /** 条件を変えて再提案（deprecated、互換のため残す） */
  onRefine?: () => void;
  // ─ Phase 1.5 ─
  pendingAxisDeltas?: PendingAxisDeltas;
  onAxisToggle?: (key: AxisKey, direction: AxisDelta) => void;
  onReroll?: () => void;
  onCloseRefine?: () => void;
}

export default function CoAlterCard({
  proposal,
  onDismiss,
  onAdopt,
  pendingAxisDeltas = {},
  onAxisToggle,
  onReroll,
  onCloseRefine,
}: Props) {
  const [showRefine, setShowRefine] = useState(false);

  const topMissing = proposal.missingConstraints?.[0] ?? null;
  const hasMissing = (proposal.missingConstraints?.length ?? 0) > 0;
  const availableAxes = proposal.availableAxes ?? [];
  const pairFit = proposal.pairFitScore;
  const hasPendingDelta = Object.keys(pendingAxisDeltas).length > 0;

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
          {pairFit !== undefined && (
            <span
              style={{
                fontSize: 9,
                color: C.coalter,
                background: `${C.coalter}10`,
                border: `1px solid ${C.coalter}20`,
                borderRadius: 6,
                padding: "1px 6px",
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontWeight: 500,
              }}
              title="二人への適合度"
            >
              相性 <ScoreDots value={pairFit} />
            </span>
          )}
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
                  {/* 軸スコアの小可視化 */}
                  {c.axisScores && availableAxes.length > 0 && (
                    <AxisScoresStrip
                      scores={c.axisScores}
                      axes={availableAxes}
                    />
                  )}
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
          {clamp(proposal.reasoning, 140)}
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
        {/* Refine パネル（2分岐） */}
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
                {hasMissing && topMissing ? (
                  // ─── 分岐 A: missingConstraints あり ───
                  <>
                    <p style={{ fontSize: 11, color: C.coalter, fontWeight: 600, marginBottom: 6 }}>
                      あと1つだけ教えて
                    </p>
                    <p style={{ fontSize: 12, color: C.t1, lineHeight: 1.5 }}>
                      {topMissing.question}
                    </p>
                  </>
                ) : (
                  // ─── 分岐 B: 条件揃い → 軸チップ ───
                  <>
                    <p style={{ fontSize: 11, color: C.coalter, fontWeight: 600, marginBottom: 6 }}>
                      条件は揃ってる。どの軸を動かす？
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {availableAxes.map((key) => {
                        const meta = getAxisMeta(key);
                        const current = pendingAxisDeltas[key];
                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between"
                            style={{ gap: 8 }}
                          >
                            <span style={{ fontSize: 11, color: C.t2, minWidth: 56, fontWeight: 500 }}>
                              {meta.label}
                            </span>
                            <span style={{ fontSize: 9, color: C.t4, flex: 1, textAlign: "right", paddingRight: 6 }}>
                              {meta.lowLabel}
                            </span>
                            <div className="flex gap-1">
                              <AxisDeltaButton
                                active={current === -1}
                                direction={-1}
                                onClick={() => onAxisToggle?.(key, -1)}
                              />
                              <AxisDeltaButton
                                active={current === 1}
                                direction={1}
                                onClick={() => onAxisToggle?.(key, 1)}
                              />
                            </div>
                            <span style={{ fontSize: 9, color: C.t4, flex: 1, paddingLeft: 6 }}>
                              {meta.highLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 退出シグナル */}
        {!showRefine && (
          <p
            style={{
              fontSize: 11,
              color: C.coalter,
              fontWeight: 500,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            {proposal.closing}
          </p>
        )}

        {/* アクションボタン */}
        <div className="flex gap-2">
          {!showRefine ? (
            <>
              <button
                onClick={() => setShowRefine(true)}
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
          ) : hasMissing ? (
            // ─── 分岐 A のボタン ───
            <>
              <button
                onClick={() => {
                  setShowRefine(false);
                  onReroll?.();
                }}
                className="flex-1 py-2 rounded-xl text-xs transition-all"
                style={{
                  background: C.coalter,
                  color: "white",
                  fontWeight: 600,
                }}
              >
                別方向で探す
              </button>
              <button
                onClick={() => {
                  setShowRefine(false);
                  onCloseRefine?.();
                }}
                className="flex-1 py-2 rounded-xl text-xs transition-all"
                style={{ background: C.s2, color: C.t3 }}
              >
                もう少し話す
              </button>
            </>
          ) : (
            // ─── 分岐 B のボタン ───
            <>
              <button
                onClick={() => {
                  setShowRefine(false);
                  onReroll?.();
                }}
                disabled={!hasPendingDelta}
                className="flex-1 py-2 rounded-xl text-xs transition-all"
                style={{
                  background: hasPendingDelta ? C.coalter : C.s2,
                  color: hasPendingDelta ? "white" : C.t4,
                  fontWeight: 600,
                  opacity: hasPendingDelta ? 1 : 0.6,
                }}
              >
                この軸で出し直す
              </button>
              <button
                onClick={() => {
                  setShowRefine(false);
                  onCloseRefine?.();
                }}
                className="flex-1 py-2 rounded-xl text-xs transition-all"
                style={{ background: C.s2, color: C.t3 }}
              >
                この3つから選ぶ
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────

/**
 * 候補の軸スコア一列
 *
 * 方針: 密度を抑えるため、スコアが定義されている軸のうち最大3軸のみ表示。
 * 優先順: availableAxes の順（共通軸→固有軸）でスコアが定義されているものから拾う。
 */
function AxisScoresStrip({
  scores,
  axes,
}: {
  scores: AxisScores;
  axes: AxisKey[];
}) {
  const defined = axes.filter((k) => scores[k] !== undefined).slice(0, 3);
  if (defined.length === 0) return null;
  return (
    <div
      className="flex flex-wrap"
      style={{ gap: 10, marginTop: 4 }}
    >
      {defined.map((key) => {
        const v = scores[key]!;
        const meta = getAxisMeta(key);
        return (
          <span
            key={key}
            style={{
              fontSize: 9,
              color: C.t4,
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            {meta.label} <ScoreDots value={v} />
          </span>
        );
      })}
    </div>
  );
}

/** 軸の +/- ボタン */
function AxisDeltaButton({
  active,
  direction,
  onClick,
}: {
  active: boolean;
  direction: AxisDelta;
  onClick: () => void;
}) {
  const symbol = direction > 0 ? "+" : "−";
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        background: active ? C.coalter : `${C.coalter}10`,
        color: active ? "white" : C.coalter,
        border: `1px solid ${active ? C.coalter : `${C.coalter}25`}`,
        fontSize: 13,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      {symbol}
    </motion.button>
  );
}
