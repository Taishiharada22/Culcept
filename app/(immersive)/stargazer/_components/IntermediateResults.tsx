// app/stargazer/_components/IntermediateResults.tsx
// 中間結果表示 — オンボーディング18問完了後に表示
// ・行動予測（クラスタベース、カジュアル見透かしトーン）
// ・MBTI概算（4軸推定）
// ・ロック済みセクション（深層結果のプレビュー）
// ・Alter CTA + 自動スクロール
// CEO方針: 全テキスト小さめ、Alter導線は格別に目立たせる
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import {
  type ClusterResult,
  type BehavioralPrediction,
  SCENE_LABELS,
  CLUSTER_DESCRIPTIONS,
} from "@/lib/stargazer/behavioralPredictionEngine";
import type { OnboardingAnswer } from "./OnboardingFlowV5";
import ScrollIndicator from "./ScrollIndicator";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MbtiEstimate {
  type: string; // e.g. "INFP"
  axes: {
    EI: { letter: string; confidence: number };
    SN: { letter: string; confidence: number };
    TF: { letter: string; confidence: number };
    JP: { letter: string; confidence: number };
  };
}

interface Props {
  clusterResult: ClusterResult;
  answers: OnboardingAnswer[];
  axisScores: Partial<Record<TraitAxisKey, number>>;
  /** Stargazer 深層観測の開始 */
  onStartStargazer: () => void;
  /** ここで止める */
  onStop?: () => void;
}

// ---------------------------------------------------------------------------
// MBTI estimation from onboarding answers
// ---------------------------------------------------------------------------

function estimateMbti(answers: OnboardingAnswer[]): MbtiEstimate {
  const get = (id: string) => answers.find((a) => a.questionId === id)?.numericValue ?? 0;

  // E/I: Q10 (social_style) + Q16 (solitude)
  const eiRaw = (get("ob10_social_style") + get("ob16_solitude")) / 2;
  const eiLetter = eiRaw >= 0 ? "E" : "I";
  const eiConf = Math.min(1, Math.abs(eiRaw) * 1.2);

  // S/N: Q18 (adaptation) + Q9 (flexibility)
  const snRaw = (get("ob18_adaptation") + get("ob9_flexibility")) / 2;
  const snLetter = snRaw >= 0 ? "N" : "S";
  const snConf = Math.min(1, Math.abs(snRaw) * 1.2);

  // T/F: Q13 (decision) + Q11 (conflict)
  const tfRaw = (get("ob13_decision") + get("ob11_conflict")) / 2;
  const tfLetter = tfRaw >= 0 ? "F" : "T";
  const tfConf = Math.min(1, Math.abs(tfRaw) * 1.2);

  // J/P: Q7 (plan) + Q14 (efficiency)
  const jpRaw = (get("ob7_plan_vs_spontaneous") + get("ob14_efficiency")) / 2;
  const jpLetter = jpRaw >= 0 ? "P" : "J";
  const jpConf = Math.min(1, Math.abs(jpRaw) * 1.2);

  return {
    type: `${eiLetter}${snLetter}${tfLetter}${jpLetter}`,
    axes: {
      EI: { letter: eiLetter, confidence: eiConf },
      SN: { letter: snLetter, confidence: snConf },
      TF: { letter: tfLetter, confidence: tfConf },
      JP: { letter: jpLetter, confidence: jpConf },
    },
  };
}

// ---------------------------------------------------------------------------
// MBTI type descriptions (short)
// ---------------------------------------------------------------------------

const MBTI_SHORT_DESCRIPTIONS: Record<string, string> = {
  INTJ: "戦略的な独立思考者",
  INTP: "論理と可能性を追う探究者",
  ENTJ: "ビジョンを現実に変える指揮者",
  ENTP: "常識を壊して新しい道を拓く人",
  INFJ: "静かに世界を変える洞察者",
  INFP: "理想を心の中に灯し続ける人",
  ENFJ: "人の可能性を引き出す共鳴者",
  ENFP: "情熱で周りを巻き込む冒険家",
  ISTJ: "信頼と責任で組織を支える守護者",
  ISFJ: "思いやりで人を包む支え手",
  ESTJ: "秩序と実行力で場を動かす統率者",
  ESFJ: "和と気配りで場を温める調和者",
  ISTP: "冷静に本質を見抜く職人",
  ISFP: "感覚と美意識で生きる芸術家",
  ESTP: "今この瞬間を掴む行動者",
  ESFP: "場を照らすエネルギーの源泉",
};

// ---------------------------------------------------------------------------
// Locked section visual pattern
// ---------------------------------------------------------------------------

function LockedSection({ title, emoji }: { title: string; emoji: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-[rgba(18,24,44,0.05)] bg-white/50 p-4">
      {/* Noise overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-10 opacity-40"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.4'/%3E%3C/svg%3E")`,
          backgroundSize: "150px",
        }}
      />
      {/* Lock indicator */}
      <div className="relative z-20 flex items-center gap-2.5 text-[rgba(18,24,44,0.3)]">
        <span className="text-lg">{emoji}</span>
        <div>
          <p className="text-xs font-medium text-[rgba(18,24,44,0.4)]">{title}</p>
          <p className="text-[10px] text-[rgba(18,24,44,0.25)]">深層観測で解放</p>
        </div>
      </div>
      {/* Blurred placeholder content */}
      <div className="relative z-0 mt-3 select-none blur-[6px]">
        <div className="h-2.5 w-3/4 rounded bg-[rgba(18,24,44,0.08)]" />
        <div className="mt-1.5 h-2.5 w-1/2 rounded bg-[rgba(18,24,44,0.06)]" />
        <div className="mt-1.5 h-2.5 w-2/3 rounded bg-[rgba(18,24,44,0.07)]" />
        <div className="mt-2.5 h-12 w-full rounded-lg bg-[rgba(18,24,44,0.04)]" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IntermediateResults({
  clusterResult,
  answers,
  axisScores,
  onStartStargazer,
  onStop,
}: Props) {
  const [revealStep, setRevealStep] = useState(0);
  const ctaRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mbti = estimateMbti(answers);

  // Alter導線クリック → CTAへ自動スクロール
  const scrollToCta = useCallback(() => {
    ctaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // 段階的リヴィール
  useEffect(() => {
    const timers = [
      setTimeout(() => setRevealStep(1), 300),   // ヘッダー
      setTimeout(() => setRevealStep(2), 800),    // 行動予測カード1
      setTimeout(() => setRevealStep(3), 1400),   // 行動予測カード2
      setTimeout(() => setRevealStep(4), 2000),   // 行動予測カード3
      setTimeout(() => setRevealStep(5), 2600),   // Alter導線
      setTimeout(() => setRevealStep(6), 3200),   // MBTI
      setTimeout(() => setRevealStep(7), 3800),   // 見えている部分
      setTimeout(() => setRevealStep(8), 4400),   // ロックセクション
      setTimeout(() => setRevealStep(9), 5000),   // 15%/85%
      setTimeout(() => setRevealStep(10), 5600),  // CTA
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // CTA表示時に自動スクロール
  useEffect(() => {
    if (revealStep >= 10 && ctaRef.current) {
      ctaRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [revealStep]);

  return (
    <div ref={scrollRef} className="fixed inset-0 z-50 overflow-y-auto bg-[#fafbfe]">
      <ScrollIndicator scrollRef={scrollRef} light />
      <div className="mx-auto max-w-lg px-5 pb-20 pt-10">
        {/* ━━━ Header ━━━ */}
        <AnimatePresence>
          {revealStep >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6"
            >
              <h1 className="font-['Cormorant_Garamond',serif] text-xl font-light text-[#121830]">
                18問で見えた、あなたの本質
              </h1>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ━━━ 行動予測「あなたはたぶん、こうする」 ━━━ */}
        <AnimatePresence>
          {revealStep >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-2"
            >
              <p className="mb-2 text-xs font-medium text-[rgba(18,24,44,0.45)]">
                あなたはたぶん、こうする
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mb-6 space-y-3">
          {clusterResult.predictions.map((prediction, i) => (
            <AnimatePresence key={prediction.scene}>
              {revealStep >= i + 2 && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="rounded-xl border border-[rgba(18,24,44,0.05)] bg-white/70 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                >
                  <p className="mb-1 text-[10px] font-medium tracking-wide text-[#b09050]">
                    {SCENE_LABELS[prediction.scene]}
                  </p>
                  <p className="whitespace-pre-line text-xs leading-[1.75] text-[#121830]">
                    {prediction.text}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          ))}
        </div>

        {/* ━━━ Alter導線カード — 格別デザイン ━━━ */}
        <AnimatePresence>
          {revealStep >= 5 && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="relative mb-6 cursor-pointer overflow-hidden rounded-2xl"
              onClick={scrollToCta}
            >
              {/* Animated gradient border */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#8B5CF6] via-[#6D28D9] to-[#4C1D95] p-[1.5px]">
                <div className="h-full w-full rounded-[14px] bg-[#fafbfe]" />
              </div>

              {/* Shimmer effect */}
              <motion.div
                className="pointer-events-none absolute inset-0 z-10"
                style={{
                  background: "linear-gradient(105deg, transparent 40%, rgba(139,92,246,0.08) 50%, transparent 60%)",
                  backgroundSize: "200% 100%",
                }}
                animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 2, ease: "linear" }}
              />

              {/* Content */}
              <div className="relative z-20 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <motion.div
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9]"
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <span className="text-sm text-white">A</span>
                  </motion.div>
                  <span className="text-xs font-semibold tracking-wider text-[#6D28D9]">
                    ALTER
                  </span>
                </div>

                <p className="text-sm font-medium leading-relaxed text-[#121830]">
                  Alterは、あなたの本音を見抜いている。
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-[rgba(18,24,44,0.55)]">
                  「あなたのことをもっと知りたい？」をタップすると、
                  Alterがあなたのために動き出す。
                </p>

                <div className="mt-3 flex items-center gap-1.5">
                  <span className="text-[10px] font-medium text-[#8B5CF6]">深層観測へ進む</span>
                  <motion.span
                    className="text-xs text-[#8B5CF6]"
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    →
                  </motion.span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ━━━ MBTI推定バッジ ━━━ */}
        <AnimatePresence>
          {revealStep >= 6 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 rounded-xl border border-[rgba(18,24,44,0.05)] bg-white/70 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            >
              <p className="mb-2 text-[10px] font-medium tracking-wide text-[rgba(18,24,44,0.4)]">
                MBTI推定
              </p>
              <div className="mb-2.5 flex items-baseline gap-2.5">
                <span className="font-['Cormorant_Garamond',serif] text-2xl font-light text-[#121830]">
                  {mbti.type}
                </span>
                <span className="text-xs text-[rgba(18,24,44,0.45)]">
                  ——「{MBTI_SHORT_DESCRIPTIONS[mbti.type] ?? ""}」
                </span>
              </div>

              {/* 4軸バー */}
              <div className="space-y-1.5">
                {(["EI", "SN", "TF", "JP"] as const).map((axis) => {
                  const data = mbti.axes[axis];
                  const leftLabel = axis === "EI" ? "I" : axis === "SN" ? "S" : axis === "TF" ? "T" : "J";
                  const rightLabel = axis === "EI" ? "E" : axis === "SN" ? "N" : axis === "TF" ? "F" : "P";
                  const isRight = data.letter === rightLabel;
                  const percent = 50 + (isRight ? 1 : -1) * data.confidence * 40;

                  return (
                    <div key={axis} className="flex items-center gap-1.5 text-[10px]">
                      <span className={`w-3 text-center ${!isRight ? "font-bold text-[#121830]" : "text-[rgba(18,24,44,0.3)]"}`}>
                        {leftLabel}
                      </span>
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(18,24,44,0.05)]">
                        <motion.div
                          className="absolute top-0 h-full rounded-full bg-[#b09050]"
                          style={{ left: 0 }}
                          initial={{ width: "50%" }}
                          animate={{ width: `${percent}%` }}
                          transition={{ duration: 0.6, delay: 0.2 }}
                        />
                      </div>
                      <span className={`w-3 text-center ${isRight ? "font-bold text-[#121830]" : "text-[rgba(18,24,44,0.3)]"}`}>
                        {rightLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="mt-2.5 text-[10px] text-[rgba(18,24,44,0.25)]">
                ※ 18問からの推定です。精度は参考程度。
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ━━━ 見えている部分 ━━━ */}
        <AnimatePresence>
          {revealStep >= 7 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6"
            >
              <p className="mb-2 text-xs font-medium text-[rgba(18,24,44,0.45)]">
                見えている部分
              </p>
              <div className="rounded-xl border border-[rgba(18,24,44,0.05)] bg-white/70 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <p className="whitespace-pre-line text-xs leading-relaxed text-[rgba(18,24,44,0.6)]">
                  {clusterResult.clusterLabel}の傾向が見えてきた。{"\n"}
                  {clusterResult.predictions[0]?.text
                    ? `行動パターンには一貫した特徴がある。`
                    : ""}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ━━━ まだ見えない部分（ロック6枚） ━━━ */}
        <AnimatePresence>
          {revealStep >= 8 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-6 space-y-2"
            >
              <p className="mb-1.5 text-xs font-medium text-[rgba(18,24,44,0.45)]">
                まだ見えない部分
              </p>
              <LockedSection emoji="🔮" title="深層の矛盾" />
              <LockedSection emoji="🧠" title="無自覚の判断癖" />
              <LockedSection emoji="⚡" title="ストレス時の変化" />
              <LockedSection emoji="🫀" title="本当の欲求" />
              <LockedSection emoji="🤝" title="対人関係の裏パターン" />
              <LockedSection emoji="🌱" title="成長の鍵" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ━━━ 15%/85% テキスト ━━━ */}
        <AnimatePresence>
          {revealStep >= 9 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-8 rounded-xl border border-[rgba(18,24,44,0.05)] bg-white/70 p-4 text-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            >
              <p className="text-xs leading-relaxed text-[rgba(18,24,44,0.55)]">
                18問では、あなたの約<span className="font-semibold text-[#121830]">15%</span>しか見えていない。
                <br />
                残りの<span className="font-semibold text-[#121830]">85%</span>は、あなただけの完全独立レポートとして
                <br />
                生成される。<span className="font-semibold text-[#b09050]">全て無料。</span>費用はかかりません。
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ━━━ CTA: 2ボタン ━━━ */}
        <AnimatePresence>
          {revealStep >= 10 && (
            <motion.div
              ref={ctaRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center gap-3"
            >
              <motion.button
                onClick={onStartStargazer}
                className="flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-[#121830] px-6 py-3.5 text-sm font-medium text-white shadow-[0_4px_16px_rgba(18,24,44,0.2)] transition-all hover:shadow-[0_6px_24px_rgba(18,24,44,0.3)]"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span>あなたのことをもっと知りたい？</span>
                <span className="text-base">→</span>
              </motion.button>

              {onStop && (
                <button
                  onClick={onStop}
                  className="text-xs text-[rgba(18,24,44,0.3)] underline underline-offset-4 transition-colors hover:text-[rgba(18,24,44,0.45)]"
                >
                  ここで止める
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
