// app/stargazer/flexibility/FlexibilityClient.tsx
// 心理的柔軟性ページ — ACT Hexaflex クライアントコンポーネント
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
  assessHexaflex,
  PROCESS_LABELS,
  type HexaflexResult,
  type HexaflexScore,
} from "@/lib/stargazer/actHexaflex";
import HexaflexRadar from "@/app/stargazer/_components/HexaflexRadar";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

// デザイントークン
const SG_GOLD = "rgba(212,175,55,0.85)";
const SG_GOLD_STRONG = "rgba(180,140,20,0.9)";
const SG_TEXT_PRIMARY = "rgba(25,30,50,0.9)";
const SG_TEXT_SECONDARY = "rgba(60,70,100,0.7)";
const SG_TEXT_MUTED = "rgba(120,130,160,0.6)";

// プロセスごとのアイコン（概念を視覚化）
const PROCESS_ICONS: Record<string, string> = {
  acceptance: "○",
  defusion: "◇",
  present_moment: "◎",
  self_as_context: "◈",
  values: "★",
  committed_action: "→",
};

// プロセスごとのアクセントカラー
const PROCESS_COLORS: Record<string, string> = {
  acceptance: "rgba(52,211,153,0.15)",
  defusion: "rgba(96,165,250,0.15)",
  present_moment: "rgba(251,191,36,0.15)",
  self_as_context: "rgba(167,139,250,0.15)",
  values: "rgba(212,175,55,0.15)",
  committed_action: "rgba(249,115,22,0.15)",
};

const PROCESS_ACCENT: Record<string, string> = {
  acceptance: "rgba(52,211,153,0.8)",
  defusion: "rgba(96,165,250,0.8)",
  present_moment: "rgba(251,191,36,0.8)",
  self_as_context: "rgba(167,139,250,0.8)",
  values: "rgba(212,175,55,0.9)",
  committed_action: "rgba(249,115,22,0.8)",
};

function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <motion.div
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        style={{ color: SG_TEXT_MUTED }}
        className="text-sm"
      >
        観測中...
      </motion.div>
    </div>
  );
}

function EmptyState() {
  return (
    <FadeInView>
      <GlassCard variant="bordered" padding="lg" className="text-center">
        <div className="mb-4" style={{ fontSize: 40, opacity: 0.4 }}>
          ◎
        </div>
        <h3
          className="font-semibold mb-2"
          style={{ color: SG_TEXT_PRIMARY }}
        >
          観測データが不足しています
        </h3>
        <p
          className="text-sm leading-relaxed mb-6"
          style={{ color: SG_TEXT_MUTED }}
        >
          心理的柔軟性を観測するには、深層観測で質問に回答してください。
          <br />
          回答が蓄積されると自動的に分析が行われます。
        </p>
        <Link
          href="/stargazer"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all hover:opacity-80"
          style={{
            background:
              "linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.08))",
            border: "1px solid rgba(212,175,55,0.3)",
            color: SG_GOLD_STRONG,
          }}
        >
          深層観測で観測を始める
        </Link>
      </GlassCard>
    </FadeInView>
  );
}

interface ProcessCardProps {
  score: HexaflexScore;
  index: number;
  isWeakest: boolean;
}

function ProcessCard({ score, index, isWeakest }: ProcessCardProps) {
  const icon = PROCESS_ICONS[score.process] ?? "◉";
  const bg = PROCESS_COLORS[score.process] ?? "rgba(200,210,230,0.12)";
  const accent = PROCESS_ACCENT[score.process] ?? SG_GOLD;

  return (
    <FadeInView delay={0.05 * index}>
      <GlassCard
        variant={isWeakest ? "gradient" : "default"}
        padding="md"
        hoverEffect={false}
      >
        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-base font-bold shrink-0"
              style={{ background: bg, color: accent }}
            >
              {icon}
            </div>
            <div>
              <p
                className="font-semibold text-sm"
                style={{ color: SG_TEXT_PRIMARY }}
              >
                {score.label}
              </p>
              {isWeakest && (
                <GlassBadge variant="warning" className="mt-0.5">
                  成長の余地
                </GlassBadge>
              )}
            </div>
          </div>
          <span
            className="text-lg font-bold shrink-0 ml-2"
            style={{ color: accent }}
          >
            {(score.score * 100).toFixed(0)}%
          </span>
        </div>

        {/* スコアバー */}
        <div
          className="h-1.5 rounded-full overflow-hidden mb-3"
          style={{ background: "rgba(180,190,220,0.2)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: accent }}
            initial={{ width: 0 }}
            animate={{ width: `${score.score * 100}%` }}
            transition={{
              duration: 1.0,
              ease: "easeOut",
              delay: 0.3 + index * 0.07,
            }}
          />
        </div>

        {/* 説明 */}
        <p
          className="text-xs leading-relaxed mb-3"
          style={{ color: SG_TEXT_MUTED }}
        >
          {score.description}
        </p>

        {/* 現れ方 */}
        <div
          className="rounded-xl px-3 py-2.5 mb-3"
          style={{
            background: bg,
            border: `1px solid ${accent.replace("0.8", "0.2").replace("0.9", "0.2")}`,
          }}
        >
          <p
            className="text-xs leading-relaxed"
            style={{ color: SG_TEXT_SECONDARY }}
          >
            {score.manifestation}
          </p>
        </div>

        {/* 成長ヒント */}
        <div className="flex gap-2 items-start">
          <span
            className="text-xs shrink-0 mt-0.5"
            style={{ color: SG_GOLD }}
          >
            ヒント
          </span>
          <p
            className="text-xs leading-relaxed"
            style={{ color: SG_TEXT_MUTED }}
          >
            {score.growthHint}
          </p>
        </div>
      </GlassCard>
    </FadeInView>
  );
}

export default function FlexibilityClient() {
  const [mounted, setMounted] = useState(false);
  const [result, setResult] = useState<HexaflexResult | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("stargazer_axis_scores_v1");
      const axisScores: Partial<Record<TraitAxisKey, number>> = raw
        ? JSON.parse(raw)
        : {};
      const hexResult = assessHexaflex(axisScores);
      setResult(hexResult);
      // Cache for weekly report enrichment
      if (hexResult) {
        try { localStorage.setItem("stargazer_hexaflex_v1", JSON.stringify(hexResult)); } catch {}
      }
    } catch {
      setResult(null);
    } finally {
      setMounted(true);
    }
  }, []);

  if (!mounted) return <LoadingState />;

  return (
    <div className="min-h-screen relative">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-28">

        {/* 戻るナビ */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.22 }}
        >
          <Link
            href="/stargazer"
            className="inline-flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
            style={{ color: SG_TEXT_MUTED }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 12L6 8l4-4" />
            </svg>
            深層観測に戻る
          </Link>
        </motion.div>

        {/* ── Section 1: Hero ── */}
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.25 }}
        >
          <p
            className="font-serif text-xs tracking-[0.2em] mb-2 uppercase"
            style={{ color: SG_TEXT_MUTED }}
          >
            Psychological Flexibility
          </p>

          <h1
            className="font-serif text-3xl sm:text-4xl font-semibold mb-3"
            style={{ color: SG_TEXT_PRIMARY }}
          >
            心理的柔軟性
          </h1>

          {/* 装飾ライン */}
          <motion.div
            className="mx-auto mb-5"
            style={{
              width: 48,
              height: 1,
              background: `linear-gradient(90deg, transparent, ${SG_GOLD}, transparent)`,
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          />

          <motion.p
            className="text-sm leading-relaxed"
            style={{ color: SG_TEXT_SECONDARY, lineHeight: 1.9 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            {result
              ? result.summary
              : "ACT（アクセプタンス&コミットメント・セラピー）の6つのプロセスから、あなたの心の柔軟さを観測します。"}
          </motion.p>
        </motion.div>

        {/* データなし */}
        {!result && <EmptyState />}

        {/* ── Section 2: Hexaflex レーダー ── */}
        {result && (
          <section className="mb-8">
            <HexaflexRadar
              scores={result.scores}
              overallFlexibility={result.overallFlexibility}
            />
          </section>
        )}

        {/* ── Section 3: 6プロセスカード ── */}
        {result && result.scores.length > 0 && (
          <section className="mb-8">
            <FadeInView delay={0.1}>
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="flex-1 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(212,175,55,0.3))",
                  }}
                />
                <h2
                  className="font-serif text-sm tracking-wider shrink-0"
                  style={{ color: SG_TEXT_MUTED }}
                >
                  6つのプロセス詳細
                </h2>
                <div
                  className="flex-1 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(212,175,55,0.3), transparent)",
                  }}
                />
              </div>
            </FadeInView>

            <div className="space-y-4">
              {result.scores.map((score, i) => (
                <ProcessCard
                  key={score.process}
                  score={score}
                  index={i}
                  isWeakest={score.process === result.weakest}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Section 4: パターンインサイト ── */}
        {result && (
          <section className="mb-8">
            <FadeInView delay={0.2}>
              <GlassCard variant="gradient" padding="lg">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold"
                    style={{
                      background: "rgba(212,175,55,0.12)",
                      color: SG_GOLD_STRONG,
                    }}
                  >
                    ◎
                  </div>
                  <h3
                    className="font-semibold text-sm"
                    style={{ color: SG_TEXT_PRIMARY }}
                  >
                    柔軟性パターンの読み解き
                  </h3>
                </div>

                <p
                  className="text-sm leading-relaxed"
                  style={{ color: SG_TEXT_SECONDARY, lineHeight: 1.85 }}
                >
                  {result.patternInsight}
                </p>

                {/* 強み / 弱み サマリー */}
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div
                    className="rounded-2xl px-3 py-3"
                    style={{
                      background: "rgba(52,211,153,0.08)",
                      border: "1px solid rgba(52,211,153,0.18)",
                    }}
                  >
                    <p
                      className="text-xs mb-1 font-medium"
                      style={{ color: "rgba(52,211,153,0.8)" }}
                    >
                      最も柔軟
                    </p>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: SG_TEXT_PRIMARY }}
                    >
                      {PROCESS_LABELS[result.strongest]}
                    </p>
                  </div>
                  <div
                    className="rounded-2xl px-3 py-3"
                    style={{
                      background: "rgba(251,191,36,0.08)",
                      border: "1px solid rgba(251,191,36,0.18)",
                    }}
                  >
                    <p
                      className="text-xs mb-1 font-medium"
                      style={{ color: "rgba(200,160,30,0.8)" }}
                    >
                      成長の余地
                    </p>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: SG_TEXT_PRIMARY }}
                    >
                      {PROCESS_LABELS[result.weakest]}
                    </p>
                  </div>
                </div>
              </GlassCard>
            </FadeInView>
          </section>
        )}

        {/* ── Section 5: 最弱プロセスへの行動提案 ── */}
        {result && (() => {
          const weakestScore = result.scores.find(
            (s) => s.process === result.weakest,
          );
          if (!weakestScore) return null;

          const accent = PROCESS_ACCENT[result.weakest] ?? SG_GOLD;

          return (
            <section className="mb-8">
              <FadeInView delay={0.25}>
                <GlassCard variant="bordered" padding="lg">
                  <div className="mb-4">
                    <p
                      className="text-xs font-semibold uppercase tracking-wider mb-2"
                      style={{ color: SG_TEXT_MUTED }}
                    >
                      今日からできること
                    </p>
                    <h3
                      className="font-semibold"
                      style={{ color: SG_TEXT_PRIMARY }}
                    >
                      「{weakestScore.label}」を育てる
                    </h3>
                  </div>

                  <div
                    className="rounded-2xl px-4 py-3 mb-4"
                    style={{
                      background:
                        PROCESS_COLORS[result.weakest] ??
                        "rgba(200,210,230,0.1)",
                      border: `1px solid ${accent.replace("0.8", "0.15").replace("0.9", "0.15")}`,
                    }}
                  >
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: SG_TEXT_SECONDARY, lineHeight: 1.85 }}
                    >
                      {weakestScore.growthHint}
                    </p>
                  </div>

                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: SG_TEXT_MUTED, lineHeight: 1.8 }}
                  >
                    心理的柔軟性は「正しく考えること」ではなく、「どんな思考や感情が来ても、
                    価値に向かって動き続けられること」です。今日の小さな一歩が、明日の柔軟性を作ります。
                  </p>
                </GlassCard>
              </FadeInView>
            </section>
          );
        })()}

        {/* ACT 参考情報 */}
        <FadeInView delay={0.3}>
          <div
            className="text-center text-xs leading-relaxed"
            style={{ color: SG_TEXT_MUTED }}
          >
            <p>
              ACT（Acceptance and Commitment Therapy）は
              <br />
              Steven C. Hayes らが開発した心理療法です。
            </p>
            <p className="mt-1 opacity-60">
              Hayes, S. C., et al. (2006). Psychological Record.
            </p>
          </div>
        </FadeInView>
      </div>
    </div>
  );
}
