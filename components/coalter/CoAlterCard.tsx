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
import CoAlterCandidateDetailSheet, {
  type HandoffLogPayload,
} from "@/components/coalter/CoAlterCandidateDetailSheet";
import {
  SLOT_ICON,
  SLOT_LABEL,
  THEME_WHAT_ICON,
  getThemeRule,
  type SlotKey,
  type SlotBundle,
} from "@/lib/coalter/slots";
import type { ConversationTheme } from "@/lib/coalter/types";
import { splitStage1Prefix } from "@/lib/coalter/stage1Narration";
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

/**
 * [M1 C2b] ① summary 本文 clamp 上限。
 * Stage 1 narration prefix 導入に伴う 100→240 の引き上げ。
 * 実サマリは 40–80 字中心、prefix 併置時でも 140 字前後で収まる想定。
 */
const SUMMARY_BODY_CLAMP = 240;

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
  // ─ Phase 1.5.3 ─
  /** 「会話で答える」で待機中の質問文（null=待機なし） */
  awaitingAnswer?: string | null;
  /** 「会話で答える」押下時のコールバック（質問文を渡す） */
  onAnswerInChat?: (question: string) => void;
  /** 待機を取り消す */
  onCancelAwaiting?: () => void;
  // ─ Phase A (2026-04-18) ─
  /**
   * bottom sheet 展開 / 外部導線タップのイベントロガー。
   * coalter_handoff_events への書き込みを親側で行う想定。
   */
  onHandoffEvent?: (payload: HandoffLogPayload) => void;
}

export default function CoAlterCard({
  proposal,
  onDismiss,
  onAdopt,
  pendingAxisDeltas = {},
  onAxisToggle,
  onReroll,
  onCloseRefine,
  awaitingAnswer = null,
  onAnswerInChat,
  onCancelAwaiting,
  onHandoffEvent,
}: Props) {
  const [showRefine, setShowRefine] = useState(false);
  const [detailCandidate, setDetailCandidate] =
    useState<ProposalCandidate | null>(null);
  const isAwaiting = !!awaitingAnswer;

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
          {/* hasMissing 時（考え中）はロゴをゆっくり脈動させる */}
          <motion.div
            animate={hasMissing ? { opacity: [1, 0.55, 1], scale: [1, 0.94, 1] } : { opacity: 1, scale: 1 }}
            transition={hasMissing ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
            style={{ display: "inline-flex" }}
          >
            <AneurasyncLogo size={17} color={C.coalter} />
          </motion.div>
          <span style={{ fontSize: 12, color: C.coalter, fontWeight: 600 }}>
            CoAlter
          </span>
          {hasMissing ? (
            // 考え中バッジ（相性より優先して出す）
            <motion.span
              animate={{ opacity: [0.65, 1, 0.65] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
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
              考え中
            </motion.span>
          ) : (
            pairFit !== undefined && (
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
            )
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

      {/* ═══ 答え待ちバナー（Phase 1.5.3）═══ */}
      {isAwaiting && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-4 py-2.5 overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${C.coalter}12, ${C.pulse}08)`,
            borderBottom: `1px solid ${C.coalter}15`,
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <motion.p
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                style={{ fontSize: 10, color: C.coalter, fontWeight: 600, marginBottom: 2 }}
              >
                会話の答えを待ってるよ
              </motion.p>
              <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>
                「{awaitingAnswer}」
              </p>
              <p style={{ fontSize: 10, color: C.t3, lineHeight: 1.5, marginTop: 2 }}>
                チャットに返信すると、その内容をふまえて続きを提案するよ。
              </p>
            </div>
            {onCancelAwaiting && (
              <button
                onClick={onCancelAwaiting}
                className="flex-shrink-0 px-2 py-1 rounded-md"
                style={{
                  fontSize: 10,
                  color: C.t3,
                  background: C.s2,
                  border: `1px solid ${C.t4}40`,
                }}
              >
                取り消す
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* ═══ ① ここまでの要点 ═══
          [M1 C2b] Stage 1 narration prefix が前置されている場合は `\n` で split し、
          prefix は有界（契約 max ≈60 字）なので clamp せず、本文側のみ clamp。
          prefix が無い (legacy / flag OFF) ときは body === proposal.summary で挙動互換。

          [CEO lock 2026-04-20 M1 C2b 追加指示] clamp 上限 100 → SUMMARY_BODY_CLAMP。
          現行 buildSummary の出力は ~40–80 字、narrationEnricher も logic-only path で
          暴走余地が小さいため、240 字で「実用域では truncate しない + 病的長文のみ保護」。 */}
      {(() => {
        const parts = splitStage1Prefix(proposal.summary);
        return (
          <div className="px-4 pt-3 pb-2">
            {parts.prefix && (
              <p
                style={{
                  fontSize: 12,
                  color: C.t2,
                  lineHeight: 1.5,
                  marginBottom: 4,
                }}
              >
                {parts.prefix}
              </p>
            )}
            <p style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>
              {clamp(parts.body, SUMMARY_BODY_CLAMP)}
            </p>
          </div>
        );
      })()}

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

      {/* ═══ ③ 候補（スワイプ） ═══ */}
      <CandidateSwipeDeck
        candidates={proposal.candidates}
        availableAxes={availableAxes}
        onAdopt={onAdopt}
        onOpenDetail={(c) => setDetailCandidate(c)}
      />

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
                    <p style={{ fontSize: 10, color: C.t3, lineHeight: 1.5, marginTop: 6 }}>
                      会話で答えてくれたら、それをふまえて提案を続けるよ。
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
            {hasMissing
              ? "会話で答えてくれたら、続きから提案するよ"
              : proposal.closing}
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
                  if (topMissing && onAnswerInChat) {
                    onAnswerInChat(topMissing.question);
                  } else {
                    onCloseRefine?.();
                  }
                }}
                className="flex-1 py-2 rounded-xl text-xs transition-all"
                style={{
                  background: C.coalter,
                  color: "white",
                  fontWeight: 600,
                }}
              >
                会話で答える
              </button>
              <button
                onClick={() => {
                  setShowRefine(false);
                  onReroll?.();
                }}
                className="flex-1 py-2 rounded-xl text-xs transition-all"
                style={{ background: C.s2, color: C.t3 }}
              >
                いったん別案を見る
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

      {/* Phase A: Candidate Detail Sheet */}
      <CoAlterCandidateDetailSheet
        candidate={detailCandidate}
        isOpen={detailCandidate !== null}
        onClose={() => setDetailCandidate(null)}
        onHandoffEvent={onHandoffEvent}
      />
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

/**
 * 5W1H 束プランのスロット描画（Phase 1.5.4）
 *
 * 重み差の方針:
 *  - coreSlot: 濃い色（t1）+ bold + 「主」バッジ
 *  - aux（テーマルールの aux に含まれる）: 中間色（t2）+ regular
 *  - その他スロット: 薄い色（t3）
 *  - status=tentative: 「仮」バッジ + さらに薄い
 *
 * アイコンは SLOT_ICON ベース。what のみテーマ別上書き（THEME_WHAT_ICON）。
 */
function SlotBundleBlock({
  slots,
  coreSlot,
  theme,
}: {
  slots: SlotBundle;
  coreSlot: SlotKey;
  theme?: ConversationTheme;
}) {
  const rule = getThemeRule(theme ?? null);
  const auxSet = new Set<SlotKey>(rule?.aux ?? []);

  // 表示順: core → aux（ルール順） → 残り（5W1H 定義順）
  const ORDER: SlotKey[] = ["what", "where", "when", "who", "why", "how"];
  const auxOrdered = (rule?.aux ?? []).filter((k) => !!slots[k]);
  const rest = ORDER.filter(
    (k) => k !== coreSlot && !auxSet.has(k) && !!slots[k],
  );
  const orderedKeys: SlotKey[] = [
    coreSlot,
    ...auxOrdered.filter((k) => k !== coreSlot),
    ...rest,
  ].filter((k, i, arr) => arr.indexOf(k) === i && !!slots[k]);

  if (orderedKeys.length === 0) return null;

  return (
    <div
      className="flex flex-col"
      style={{
        gap: 3,
        marginTop: 6,
        paddingTop: 6,
        borderTop: `1px dashed ${C.coalter}15`,
      }}
    >
      {orderedKeys.map((key) => {
        const content = slots[key];
        if (!content) return null;

        const isCore = key === coreSlot;
        const isAux = auxSet.has(key);
        const isTentative = content.status === "tentative";
        const isConfirmed = content.status === "confirmed";

        // 重み: core > aux > rest、tentative は 1 段薄く
        const textColor = isCore
          ? isTentative
            ? C.t2
            : C.t1
          : isAux
            ? isTentative
              ? C.t3
              : C.t2
            : isTentative
              ? C.t4
              : C.t3;
        const fontWeight = isCore ? 600 : 500;

        // what のみテーマに応じたアイコンに差し替え
        const icon =
          key === "what" && theme && THEME_WHAT_ICON[theme]
            ? THEME_WHAT_ICON[theme]!
            : SLOT_ICON[key];

        return (
          <div
            key={key}
            className="flex items-start"
            style={{ gap: 6, lineHeight: 1.45 }}
          >
            <span
              style={{
                fontSize: 11,
                opacity: isCore ? 1 : 0.75,
                flexShrink: 0,
                marginTop: 1,
              }}
              aria-hidden
            >
              {icon}
            </span>
            <span
              style={{
                fontSize: 9,
                color: isCore ? C.coalter : C.t4,
                flexShrink: 0,
                marginTop: 3,
                minWidth: 22,
                fontWeight: 500,
              }}
            >
              {SLOT_LABEL[key]}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center" style={{ gap: 4, flexWrap: "wrap" }}>
                {content.url ? (
                  <a
                    href={content.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      color: isCore ? C.coalter : textColor,
                      fontWeight,
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    {content.label} ↗
                  </a>
                ) : (
                  <span
                    style={{
                      fontSize: 11,
                      color: textColor,
                      fontWeight,
                    }}
                  >
                    {content.label}
                  </span>
                )}
                {isCore && (
                  <span
                    style={{
                      fontSize: 8,
                      color: C.coalter,
                      background: `${C.coalter}10`,
                      border: `1px solid ${C.coalter}25`,
                      borderRadius: 4,
                      padding: "0 4px",
                      fontWeight: 600,
                      lineHeight: 1.4,
                    }}
                    title="主軸スロット"
                  >
                    主
                  </span>
                )}
                {isTentative && (
                  <span
                    style={{
                      fontSize: 8,
                      color: C.t3,
                      background: C.s2,
                      border: `1px solid ${C.t4}50`,
                      borderRadius: 4,
                      padding: "0 4px",
                      fontWeight: 600,
                      lineHeight: 1.4,
                    }}
                    title="仮置き"
                  >
                    仮
                  </span>
                )}
                {isConfirmed && !isCore && (
                  <span
                    style={{
                      fontSize: 8,
                      color: C.coalter,
                      background: `${C.coalter}08`,
                      borderRadius: 4,
                      padding: "0 4px",
                      fontWeight: 500,
                      lineHeight: 1.4,
                    }}
                    title="確定"
                  >
                    ✓
                  </span>
                )}
              </div>
              {content.detail && (
                <p
                  style={{
                    fontSize: 10,
                    color: C.t4,
                    marginTop: 1,
                    lineHeight: 1.4,
                  }}
                >
                  {content.detail}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 候補スワイプデッキ（Phase 1.5.4.6+）
 *
 * 縦リスト → 横スワイプに変更。1候補ずつ見せることで
 *  - 1枚あたりの情報密度を上げられる（slots + axis + practicalInfo + oneLiner）
 *  - 3件並列を前提にできる（CEO 指示）
 *  - 左右 drag / ドット / ← → ボタンで遷移
 */
function CandidateSwipeDeck({
  candidates,
  availableAxes,
  onAdopt,
  onOpenDetail,
}: {
  candidates: ProposalCandidate[];
  availableAxes: AxisKey[];
  onAdopt?: (candidate: ProposalCandidate) => void;
  /** 詳細シートを開く (Phase A) */
  onOpenDetail?: (candidate: ProposalCandidate) => void;
}) {
  const [index, setIndex] = useState(0);
  const total = candidates.length;

  if (total === 0) return null;

  const clampIndex = (n: number) => Math.max(0, Math.min(total - 1, n));
  const go = (delta: number) => setIndex((i) => clampIndex(i + delta));

  const current = candidates[index];

  return (
    <div className="px-4 py-2">
      {/* ペーシネーション: 🥇🥈🥉 + ドット */}
      <div
        className="flex items-center justify-between"
        style={{ marginBottom: 6 }}
      >
        <div className="flex items-center" style={{ gap: 6 }}>
          <span style={{ fontSize: 18 }}>
            {RANK_EMOJI[index] ?? "•"}
          </span>
          <span style={{ fontSize: 10, color: C.t3, fontWeight: 500 }}>
            {index + 1} / {total}
          </span>
        </div>
        <div className="flex items-center" style={{ gap: 4 }}>
          {candidates.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`候補 ${i + 1} を見る`}
              style={{
                width: i === index ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: i === index ? C.coalter : `${C.coalter}25`,
                transition: "all 0.2s ease",
                cursor: "pointer",
                border: "none",
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* スワイプ可能なカード本体 */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 12,
          background: `${C.coalter}04`,
          border: `1px solid ${C.coalter}10`,
          minHeight: 120,
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.rank}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.22}
            onDragEnd={(_, info) => {
              if (info.offset.x < -50 && index < total - 1) go(1);
              else if (info.offset.x > 50 && index > 0) go(-1);
            }}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="px-3 py-3"
            style={{ cursor: "grab" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {current.url ? (
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 14,
                      color: C.coalter,
                      fontWeight: 700,
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                      lineHeight: 1.35,
                    }}
                  >
                    {current.title} ↗
                  </a>
                ) : (
                  <p
                    style={{
                      fontSize: 14,
                      color: C.t1,
                      fontWeight: 700,
                      lineHeight: 1.35,
                    }}
                  >
                    {current.title}
                  </p>
                )}
                <p
                  style={{
                    fontSize: 11,
                    color: C.t2,
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {current.oneLiner}
                </p>
              </div>
              {onAdopt && (
                <motion.button
                  onClick={() => onAdopt(current)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs"
                  style={{
                    background: C.coalter,
                    color: "white",
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  この案を採用
                </motion.button>
              )}
            </div>

            {/* 5W1H 束 */}
            {current.slots && current.coreSlot && (
              <SlotBundleBlock
                slots={current.slots}
                coreSlot={current.coreSlot}
                theme={current.theme}
              />
            )}

            {/* 軸スコア */}
            {current.axisScores && availableAxes.length > 0 && (
              <AxisScoresStrip
                scores={current.axisScores}
                axes={availableAxes}
              />
            )}

            {/* 実用情報 */}
            {current.practicalInfo && (
              <p
                style={{
                  fontSize: 10,
                  color: C.t3,
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: `1px dashed ${C.coalter}15`,
                  lineHeight: 1.45,
                }}
              >
                {current.practicalInfo}
              </p>
            )}

            {/* Phase A: 詳しく見る (bottom sheet を開く) */}
            {current.detail && onOpenDetail && (
              <div style={{ marginTop: 8, textAlign: "right" }}>
                <motion.button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDetail(current);
                  }}
                  whileTap={{ scale: 0.96 }}
                  style={{
                    fontSize: 10,
                    color: C.coalter,
                    background: `${C.coalter}10`,
                    border: `1px solid ${C.coalter}25`,
                    borderRadius: 8,
                    padding: "4px 10px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  詳しく見る →
                </motion.button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* 左右矢印（モバイル以外用アクセシビリティ） */}
        {total > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              disabled={index === 0}
              aria-label="前の候補"
              style={{
                position: "absolute",
                left: 4,
                top: "50%",
                transform: "translateY(-50%)",
                width: 24,
                height: 24,
                borderRadius: 12,
                background: C.s1,
                border: `1px solid ${C.coalter}20`,
                color: index === 0 ? C.t4 : C.coalter,
                fontSize: 12,
                fontWeight: 700,
                opacity: index === 0 ? 0.3 : 0.85,
                cursor: index === 0 ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              ‹
            </button>
            <button
              onClick={() => go(1)}
              disabled={index === total - 1}
              aria-label="次の候補"
              style={{
                position: "absolute",
                right: 4,
                top: "50%",
                transform: "translateY(-50%)",
                width: 24,
                height: 24,
                borderRadius: 12,
                background: C.s1,
                border: `1px solid ${C.coalter}20`,
                color: index === total - 1 ? C.t4 : C.coalter,
                fontSize: 12,
                fontWeight: 700,
                opacity: index === total - 1 ? 0.3 : 0.85,
                cursor: index === total - 1 ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
              }}
            >
              ›
            </button>
          </>
        )}
      </div>
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
