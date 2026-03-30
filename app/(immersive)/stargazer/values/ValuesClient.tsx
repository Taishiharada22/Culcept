"use client";

// app/stargazer/values/ValuesClient.tsx
// 価値観の発見 — 選択パターンから暗黙の価値観を可視化する

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
  extractImplicitValues,
  type ImplicitValue,
  type ValueConflict,
  type ImplicitValuesResult,
  type SchwartzCategory,
} from "@/lib/stargazer/implicitValuesExtractor";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import SchwartzCircumplex from "@/app/stargazer/_components/SchwartzCircumplex";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SCHWARTZ_LABELS: Record<SchwartzCategory, string> = {
  self_direction: "自律",
  stimulation: "刺激",
  hedonism: "快楽",
  achievement: "達成",
  power: "力",
  security: "安全",
  conformity: "従順",
  tradition: "伝統",
  benevolence: "慈善",
  universalism: "普遍",
};

const SCHWARTZ_ORDER: SchwartzCategory[] = [
  "self_direction",
  "stimulation",
  "hedonism",
  "achievement",
  "power",
  "security",
  "conformity",
  "tradition",
  "benevolence",
  "universalism",
];

const SG_GOLD = "var(--sg-gold, #b09050)";
const SG_GOLD_RGB = "176,144,80";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub-components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 薄いゴールドの区切り線 */
function GoldDivider({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        height: 1,
        background: `linear-gradient(90deg, transparent, rgba(${SG_GOLD_RGB},0.25), transparent)`,
      }}
    />
  );
}

/** 確信度プログレスバー */
function ConfidenceBar({ confidence }: { confidence: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{
          height: 3,
          background: `rgba(${SG_GOLD_RGB},0.12)`,
        }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, rgba(${SG_GOLD_RGB},0.5), ${SG_GOLD})`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(confidence * 100)}%` }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <span
        className="text-xs font-mono tabular-nums shrink-0"
        style={{ color: `rgba(${SG_GOLD_RGB},0.65)` }}
      >
        {Math.round(confidence * 100)}%
      </span>
    </div>
  );
}

/** 単一の価値観カード */
function ValueCard({
  value,
  index,
}: {
  value: ImplicitValue;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <FadeInView delay={0.1 + index * 0.1}>
      <GlassCard
        variant="elevated"
        padding="none"
        hoverEffect={false}
        className="overflow-hidden"
        style={{
          boxShadow: `0 4px 24px rgba(0,0,0,0.04), 0 0 40px rgba(${SG_GOLD_RGB},${0.03 + value.confidence * 0.04})`,
        }}
      >
        {/* Top accent line proportional to confidence */}
        <motion.div
          className="w-full"
          style={{
            height: 2,
            background: `linear-gradient(90deg, transparent, rgba(${SG_GOLD_RGB},${0.2 + value.confidence * 0.5}), transparent)`,
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.1 + index * 0.06, duration: 0.2 }}
        />

        <div className="p-5 sm:p-6">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3
              className="font-serif text-xl sm:text-2xl font-semibold leading-tight"
              style={{ color: "rgba(30,35,55,0.9)" }}
            >
              {value.name}
            </h3>
            <GlassBadge variant="default" size="sm" className="shrink-0 mt-0.5">
              {SCHWARTZ_LABELS[value.schwartzCategory]}
            </GlassBadge>
          </div>

          {/* Confidence bar */}
          <div className="mb-4">
            <ConfidenceBar confidence={value.confidence} />
          </div>

          {/* Description */}
          <p
            className="text-sm sm:text-base leading-relaxed mb-4"
            style={{ color: "rgba(50,55,80,0.78)", lineHeight: 1.8 }}
          >
            {value.description}
          </p>

          {/* Expand/collapse toggle */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
            style={{ color: `rgba(${SG_GOLD_RGB},0.65)` }}
          >
            <motion.span
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.25 }}
              style={{ display: "inline-block" }}
            >
              &#9654;
            </motion.span>
            {expanded ? "閉じる" : "詳細を見る"}
          </button>

          {/* Expandable detail */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="detail"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="pt-4 space-y-3">
                  <GoldDivider />
                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{ background: `rgba(${SG_GOLD_RGB},0.04)`, border: `1px solid rgba(${SG_GOLD_RGB},0.08)` }}
                  >
                    {/* Manifestation */}
                    <div>
                      <p
                        className="text-xs font-medium mb-1 tracking-wider"
                        style={{ color: `rgba(${SG_GOLD_RGB},0.55)` }}
                      >
                        現れ方
                      </p>
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: "rgba(50,55,80,0.7)", lineHeight: 1.75 }}
                      >
                        {value.manifestation}
                      </p>
                    </div>
                    {/* When threatened */}
                    <div>
                      <p
                        className="text-xs font-medium mb-1 tracking-wider"
                        style={{ color: `rgba(${SG_GOLD_RGB},0.55)` }}
                      >
                        脅かされた時
                      </p>
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: "rgba(50,55,80,0.7)", lineHeight: 1.75 }}
                      >
                        {value.whenThreatened}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlassCard>
    </FadeInView>
  );
}

/** 価値観の対立カード */
function ConflictCard({
  conflict,
  index,
}: {
  conflict: ValueConflict;
  index: number;
}) {
  return (
    <FadeInView delay={0.1 + index * 0.12}>
      <GlassCard
        variant="default"
        padding="none"
        hoverEffect={false}
        className="overflow-hidden"
      >
        <div className="p-5 sm:p-6">
          {/* Tension visualization */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <span
              className="font-serif text-base font-semibold px-3 py-1 rounded-lg"
              style={{
                color: "rgba(30,35,55,0.85)",
                background: `rgba(${SG_GOLD_RGB},0.08)`,
                border: `1px solid rgba(${SG_GOLD_RGB},0.15)`,
              }}
            >
              {conflict.valueA}
            </span>
            <motion.span
              className="text-sm font-light"
              style={{ color: `rgba(${SG_GOLD_RGB},0.5)` }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            >
              &#8596;
            </motion.span>
            <span
              className="font-serif text-base font-semibold px-3 py-1 rounded-lg"
              style={{
                color: "rgba(30,35,55,0.85)",
                background: `rgba(${SG_GOLD_RGB},0.08)`,
                border: `1px solid rgba(${SG_GOLD_RGB},0.15)`,
              }}
            >
              {conflict.valueB}
            </span>
          </div>

          {/* Description */}
          <p
            className="text-sm leading-relaxed mb-4"
            style={{ color: "rgba(50,55,80,0.72)", lineHeight: 1.8 }}
          >
            {conflict.description}
          </p>

          {/* Integration hint */}
          <div
            className="rounded-xl p-4"
            style={{
              background: `rgba(${SG_GOLD_RGB},0.05)`,
              border: `1px solid rgba(${SG_GOLD_RGB},0.1)`,
            }}
          >
            <p
              className="text-xs font-medium mb-1.5 tracking-wider"
              style={{ color: `rgba(${SG_GOLD_RGB},0.55)` }}
            >
              統合のヒント
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "rgba(60,65,90,0.7)", lineHeight: 1.75 }}
            >
              {conflict.integrationHint}
            </p>
          </div>
        </div>
      </GlassCard>
    </FadeInView>
  );
}

/** データ不足時の空状態 */
function EmptyState() {
  return (
    <FadeInView>
      <div className="text-center py-16 px-6">
        {/* Pulsing circle */}
        <div className="relative w-20 h-20 mx-auto mb-8">
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ border: `1px solid rgba(${SG_GOLD_RGB},0.15)` }}
            animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-3 rounded-full"
            style={{ border: `1px solid rgba(${SG_GOLD_RGB},0.25)` }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ fontSize: 28 }}
          >
            &#9789;
          </div>
        </div>

        <GoldDivider className="mb-6 max-w-xs mx-auto" />

        <p
          className="font-serif text-base leading-relaxed"
          style={{ color: "rgba(80,85,110,0.7)", lineHeight: 1.9 }}
        >
          観測データがまだ十分ではありません。
          <br />
          日々の観測を重ねると、あなたの価値観が浮かび上がります。
        </p>

        <motion.div className="mt-8">
          <Link
            href="/stargazer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm transition-opacity hover:opacity-70"
            style={{
              background: `rgba(${SG_GOLD_RGB},0.08)`,
              border: `1px solid rgba(${SG_GOLD_RGB},0.18)`,
              color: `rgba(${SG_GOLD_RGB},0.85)`,
            }}
          >
            観測を始める
          </Link>
        </motion.div>
      </div>
    </FadeInView>
  );
}

/** 価値考古学カード — 価値観を支える軸の可視化 */
function ValueArchaeologyCard({
  value,
  index,
}: {
  value: ImplicitValue;
  index: number;
}) {
  if (value.supportingAxes.length === 0) return null;

  // 上位3軸のみ表示
  const topAxes = [...value.supportingAxes]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  const axisFragments = topAxes
    .map((sa) => {
      const pct = Math.round(sa.contribution * 10) / 10;
      return `${sa.axis.replace(/_/g, " ")}(${pct.toFixed(1)})`;
    })
    .join(" + ");

  return (
    <FadeInView delay={0.08 + index * 0.07}>
      <div
        className="rounded-xl p-3.5 sm:p-4"
        style={{
          background: `rgba(${SG_GOLD_RGB},0.03)`,
          border: `1px solid rgba(${SG_GOLD_RGB},0.1)`,
        }}
      >
        <div className="flex items-baseline gap-2 flex-wrap">
          {/* Value name */}
          <span
            className="font-serif text-sm font-semibold shrink-0"
            style={{ color: "rgba(30,35,55,0.85)" }}
          >
            「{value.name}」
          </span>

          {/* Arrow */}
          <span
            className="text-xs shrink-0"
            style={{ color: `rgba(${SG_GOLD_RGB},0.45)` }}
          >
            ←
          </span>

          {/* Axes */}
          <span
            className="text-xs font-mono leading-relaxed"
            style={{ color: "rgba(80,90,120,0.65)" }}
          >
            {axisFragments}
          </span>
        </div>
      </div>
    </FadeInView>
  );
}

/** ローディング状態 */
function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <motion.div
        className="text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          className="w-8 h-8 mx-auto rounded-full"
          style={{ border: `2px solid rgba(${SG_GOLD_RGB},0.3)` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
        <p
          className="mt-4 font-serif text-sm tracking-widest"
          style={{ color: "rgba(120,130,160,0.6)" }}
        >
          価値観を読み解いています...
        </p>
      </motion.div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function ValuesClient() {
  const [mounted, setMounted] = useState(false);
  const [result, setResult] = useState<ImplicitValuesResult | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("stargazer_axis_scores_v1");
      const axisScores: Partial<Record<TraitAxisKey, number>> = raw
        ? JSON.parse(raw)
        : {};
      setResult(extractImplicitValues(axisScores));
    } catch {
      setResult(null);
    } finally {
      setMounted(true);
    }
  }, []);

  if (!mounted) return <LoadingState />;

  const topValues = result?.values.slice(0, 5) ?? [];

  return (
    <div className="min-h-screen relative">
      <div className="max-w-lg mx-auto px-4 pt-6 pb-24">

        {/* Back navigation */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Link
            href="/stargazer"
            className="inline-flex items-center gap-2 text-sm transition-opacity hover:opacity-70"
            style={{ color: "rgba(120,130,160,0.7)" }}
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
          transition={{ delay: 0.05, duration: 0.25 }}
        >
          <p
            className="font-serif text-xs tracking-[0.2em] mb-2"
            style={{ color: `rgba(${SG_GOLD_RGB},0.5)` }}
          >
            深層観測 &mdash; 価値観の発見
          </p>
          <h1
            className="font-serif text-3xl sm:text-4xl font-semibold mb-3"
            style={{ color: "rgba(25,30,50,0.9)" }}
          >
            価値観の発見
          </h1>

          {/* Decorative gold line */}
          <motion.div
            className="mx-auto mb-5"
            style={{
              width: 48,
              height: 1,
              background: `linear-gradient(90deg, transparent, ${SG_GOLD}, transparent)`,
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.2, duration: 0.22 }}
          />

          {result ? (
            <motion.p
              className="text-sm sm:text-base leading-relaxed"
              style={{ color: "rgba(60,65,90,0.68)", lineHeight: 1.9 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.22 }}
            >
              {result.summary}
            </motion.p>
          ) : (
            <motion.p
              className="text-sm"
              style={{ color: "rgba(120,130,160,0.6)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              選択パターンから、無意識に優先している価値観を浮かび上がらせる。
            </motion.p>
          )}
        </motion.div>

        {/* Empty state */}
        {!result && <EmptyState />}

        {/* ── Section 1b: Schwartz Circumplex ── */}
        {result && result.values.length > 0 && (() => {
          const circumplexScores = SCHWARTZ_ORDER.map((cat) => {
            const match = result.values.find((v) => v.schwartzCategory === cat);
            return {
              category: cat,
              label: SCHWARTZ_LABELS[cat],
              score: match ? match.confidence : 0,
            };
          });
          return (
            <section className="mb-10">
              <FadeInView delay={0.08}>
                <SchwartzCircumplex scores={circumplexScores} />
              </FadeInView>
            </section>
          );
        })()}

        {/* ── Section 2: Top Values ── */}
        {topValues.length > 0 && (
          <section className="mb-10">
            <FadeInView delay={0.05}>
              <div className="flex items-center gap-3 mb-5">
                <GoldDivider className="flex-1" />
                <h2
                  className="font-serif text-sm tracking-wider shrink-0"
                  style={{ color: `rgba(${SG_GOLD_RGB},0.6)` }}
                >
                  価値観の優先順位
                </h2>
                <GoldDivider className="flex-1" />
              </div>
            </FadeInView>

            <div className="space-y-4">
              {topValues.map((value, i) => (
                <ValueCard key={value.name} value={value} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* ── Section 3: Core Theme ── */}
        {result && (
          <section className="mb-10">
            <FadeInView delay={0.1}>
              <div className="flex items-center gap-3 mb-5">
                <GoldDivider className="flex-1" />
                <h2
                  className="font-serif text-sm tracking-wider shrink-0"
                  style={{ color: `rgba(${SG_GOLD_RGB},0.6)` }}
                >
                  人生の中心テーマ
                </h2>
                <GoldDivider className="flex-1" />
              </div>
            </FadeInView>

            <FadeInView delay={0.15}>
              <GlassCard
                variant="elevated"
                padding="none"
                hoverEffect={false}
                className="overflow-hidden"
                style={{
                  boxShadow: `0 0 60px rgba(${SG_GOLD_RGB},0.08), 0 4px 24px rgba(0,0,0,0.04)`,
                  border: `1px solid rgba(${SG_GOLD_RGB},0.18)`,
                }}
              >
                {/* Gold shimmer top */}
                <motion.div
                  className="w-full"
                  style={{
                    height: 1,
                    background: `linear-gradient(90deg, transparent 0%, rgba(${SG_GOLD_RGB},0.6) 50%, transparent 100%)`,
                  }}
                  animate={{ opacity: [0.4, 0.9, 0.4] }}
                  transition={{ duration: 4, repeat: Infinity }}
                />

                <div className="px-6 py-8 text-center">
                  <p
                    className="font-serif text-base sm:text-lg leading-relaxed"
                    style={{
                      color: "rgba(35,40,60,0.82)",
                      fontStyle: "italic",
                      lineHeight: 1.9,
                    }}
                  >
                    {result.coreTheme}
                  </p>
                </div>

                {/* Gold shimmer bottom */}
                <motion.div
                  className="w-full"
                  style={{
                    height: 1,
                    background: `linear-gradient(90deg, transparent 0%, rgba(${SG_GOLD_RGB},0.6) 50%, transparent 100%)`,
                  }}
                  animate={{ opacity: [0.4, 0.9, 0.4] }}
                  transition={{ duration: 4, repeat: Infinity, delay: 2 }}
                />
              </GlassCard>
            </FadeInView>
          </section>
        )}

        {/* ── Section 4: Value Conflicts ── */}
        {result && result.conflicts.length > 0 && (
          <section className="mb-10">
            <FadeInView delay={0.05}>
              <div className="flex items-center gap-3 mb-5">
                <GoldDivider className="flex-1" />
                <h2
                  className="font-serif text-sm tracking-wider shrink-0"
                  style={{ color: `rgba(${SG_GOLD_RGB},0.6)` }}
                >
                  価値観の対立
                </h2>
                <GoldDivider className="flex-1" />
              </div>
            </FadeInView>

            <div className="space-y-4">
              {result.conflicts.map((conflict, i) => (
                <ConflictCard key={`${conflict.valueA}-${conflict.valueB}`} conflict={conflict} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* ── Section 4b: Value Archaeology ── */}
        {result && topValues.length > 0 && (
          <section className="mb-10">
            <FadeInView delay={0.05}>
              <div className="flex items-center gap-3 mb-2">
                <GoldDivider className="flex-1" />
                <h2
                  className="font-serif text-sm tracking-wider shrink-0"
                  style={{ color: `rgba(${SG_GOLD_RGB},0.6)` }}
                >
                  価値考古学
                </h2>
                <GoldDivider className="flex-1" />
              </div>
              <p
                className="text-center text-xs mb-5"
                style={{ color: "rgba(140,150,180,0.5)", letterSpacing: "0.12em" }}
              >
                価値観を支える軸の構造
              </p>
            </FadeInView>

            <div className="space-y-2.5">
              {topValues.map((value, i) => (
                <ValueArchaeologyCard key={value.name} value={value} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* ── Section 5: Terminal vs Instrumental ── */}
        {result && (
          <section className="mb-10">
            <FadeInView delay={0.05}>
              <div className="flex items-center gap-3 mb-5">
                <GoldDivider className="flex-1" />
                <h2
                  className="font-serif text-sm tracking-wider shrink-0"
                  style={{ color: `rgba(${SG_GOLD_RGB},0.6)` }}
                >
                  目的と手段
                </h2>
                <GoldDivider className="flex-1" />
              </div>
            </FadeInView>

            <FadeInView delay={0.1}>
              <GlassCard variant="default" padding="none" hoverEffect={false}>
                <div className="p-5 sm:p-6">
                  <p
                    className="text-sm sm:text-base leading-relaxed"
                    style={{ color: "rgba(50,55,80,0.72)", lineHeight: 1.85 }}
                  >
                    {result.terminalVsInstrumental}
                  </p>
                </div>
              </GlassCard>
            </FadeInView>
          </section>
        )}

        {/* Footer note */}
        {result && (
          <FadeInView delay={0.2}>
            <div className="text-center mt-4">
              <GoldDivider className="mb-6 max-w-[60px] mx-auto" />
              <p
                className="text-xs leading-relaxed"
                style={{ color: "rgba(140,150,180,0.5)", lineHeight: 1.8 }}
              >
                これらはアンケートの回答ではなく、
                <br />
                あなたの選択パターンから浮かび上がった価値観です。
              </p>
            </div>
          </FadeInView>
        )}
      </div>
    </div>
  );
}
