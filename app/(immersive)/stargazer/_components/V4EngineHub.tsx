// app/stargazer/_components/V4EngineHub.tsx
// ──────────────────────────────────────────────────────────────────────
// Stargazer v4 — 自己解読エンジンへのナビゲーションハブ
// 深層タブおよびホームから表示。フェーズに応じて機能を段階解放。
// サブスクリプションティアによる free/premium ゲーティング統合。
// ──────────────────────────────────────────────────────────────────────
"use client";

import { useState, useEffect, useMemo } from "react";
import { safeLSSet } from "@/lib/safeLocalStorage";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  resolvePhaseState,
  type PhaseState,
  type PhaseInput,
  type V4Feature,
  type DepthPhase,
} from "@/lib/stargazer/depthPhaseController";
import {
  type StargazerTier,
  type FeatureLimits,
  getAllFeatureGates,
  isFeatureAvailable as isTierFeatureAvailable,
} from "@/lib/stargazer/subscriptionTier";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";

// ═══ Feature Definitions ═══

interface FeatureDef {
  key: V4Feature;
  label: string;
  sublabel: string;
  icon: string;
  href: string;
  description: string;
  gradient: string;
}

const FEATURE_DEFS: FeatureDef[] = [
  {
    key: "inner_weather",
    label: "内なる天気",
    sublabel: "心の気象観測",
    icon: "\u{1F324}\u{FE0F}",
    href: "/stargazer/weather",
    description: "今のあなたの心の天気を観測する",
    gradient: "from-sky-400/20 to-amber-300/20",
  },
  {
    key: "blind_spot",
    label: "見えない自分",
    sublabel: "毎日ひとつの発見",
    icon: "\u{1F4A7}",
    href: "/stargazer/blind-spot",
    description: "自分が自分に隠していることを、毎日ひとつ",
    gradient: "from-violet-400/20 to-rose-400/20",
  },
  {
    key: "prophecy",
    label: "行動予言",
    sublabel: "明日の自分を予測",
    icon: "\u{1F52E}",
    href: "/stargazer/prophecy",
    description: "明日のあなたの行動を予言し、精度を証明する",
    gradient: "from-indigo-400/20 to-purple-400/20",
  },
  {
    key: "unseen_map",
    label: "未知の地図",
    sublabel: "自己理解の冒険マップ",
    icon: "\u{1F5FA}\u{FE0F}",
    href: "/stargazer/unseen-map",
    description: "自己理解の霧を晴らすRPGマップ",
    gradient: "from-emerald-400/20 to-teal-400/20",
  },
  {
    key: "alter",
    label: "もうひとりの自分",
    sublabel: "影との対話",
    icon: "\u{1F464}",
    href: "/stargazer/alter",
    description: "もうひとりの自分との対話。防衛を超えた深層へ",
    gradient: "from-slate-400/20 to-violet-400/20",
  },
  {
    key: "ghost_resonance",
    label: "似た星の共鳴",
    sublabel: "匿名の共鳴",
    icon: "\u{1F47B}",
    href: "/stargazer/ghost",
    description: "あなたと同じパターンを持つ誰かがいる",
    gradient: "from-cyan-400/20 to-blue-400/20",
  },
  {
    key: "decision_oracle",
    label: "選択の予測",
    sublabel: "判断の道標",
    icon: "\u{2696}\u{FE0F}",
    href: "/stargazer/oracle",
    description: "あなたの選択を予測し、もうひとりの欲望を映す",
    gradient: "from-amber-400/20 to-orange-400/20",
  },
  {
    key: "psyche_signature",
    label: "心の指紋",
    sublabel: "あなただけの形",
    icon: "\u{2726}",
    href: "/stargazer/signature",
    description: "あなたの心の視覚的指紋",
    gradient: "from-rose-400/20 to-pink-400/20",
  },

  // ── 6層フレームワーク追加 ──
  {
    key: "values_discovery",
    label: "価値観の発見",
    sublabel: "無意識の優先順位",
    icon: "\u{1F48E}",
    href: "/stargazer/values",
    description: "無意識に優先している価値観を浮かび上がらせる",
    gradient: "from-emerald-400/20 to-cyan-400/20",
  },
  {
    key: "core_wound",
    label: "苦しみの構造",
    sublabel: "繰り返すパターンの根",
    icon: "\u{1FA79}",
    href: "/stargazer/wound",
    description: "なぜ同じパターンを繰り返すのか",
    gradient: "from-red-400/20 to-rose-400/20",
  },
  {
    key: "transformation",
    label: "変容の意図",
    sublabel: "変わりたい意志",
    icon: "\u{1F98B}",
    href: "/stargazer/transform",
    description: "変わりたいのか、変わりうるのか",
    gradient: "from-amber-400/20 to-yellow-400/20",
  },
  {
    key: "life_events",
    label: "人生の出来事",
    sublabel: "出来事と変化の相関",
    icon: "\u{1F4C5}",
    href: "/stargazer/events",
    description: "出来事と性格変化の相関を観測する",
    gradient: "from-blue-400/20 to-sky-400/20",
  },
  {
    key: "act_hexaflex",
    label: "心理的柔軟性",
    sublabel: "6つの柔軟性プロセス",
    icon: "\u{1F9E0}",
    href: "/stargazer/flexibility",
    description: "6つの心理的柔軟性プロセスを観測する",
    gradient: "from-teal-400/20 to-emerald-400/20",
  },
  {
    key: "transform_simulation",
    label: "変容シミュレーション",
    sublabel: "もし変わったら？",
    icon: "\u{1F52E}",
    href: "/stargazer/simulation",
    description: "もし自分が変わったら、何が起きるか",
    gradient: "from-purple-400/20 to-fuchsia-400/20",
  },
  {
    key: "dream_journal",
    label: "夢日記",
    sublabel: "無意識のシンボル",
    icon: "\u{1F319}",
    href: "/stargazer/dreams",
    description: "夢の中のシンボルから無意識を読み解く",
    gradient: "from-indigo-400/20 to-violet-400/20",
  },
  {
    key: "circadian_rhythm",
    label: "サーカディアンリズム",
    sublabel: "時間帯別パターン",
    icon: "\u{23F0}",
    href: "/stargazer/rhythm",
    description: "時間帯別の心理状態パターンを観測する",
    gradient: "from-orange-400/20 to-amber-400/20",
  },
];

// ═══ Phase Colors ═══

const PHASE_COLORS: Record<DepthPhase, { bg: string; text: string; border: string }> = {
  surface: {
    bg: "bg-slate-100/60",
    text: "text-slate-600",
    border: "border-slate-300/40",
  },
  awakening: {
    bg: "bg-indigo-50/60",
    text: "text-indigo-700",
    border: "border-indigo-300/40",
  },
  maturity: {
    bg: "bg-violet-50/60",
    text: "text-violet-700",
    border: "border-violet-300/40",
  },
  deep: {
    bg: "bg-amber-50/60",
    text: "text-amber-700",
    border: "border-amber-300/40",
  },
};

const PHASE_LABELS: Record<DepthPhase, string> = {
  surface: "表層期",
  awakening: "覚醒期",
  maturity: "成熟期",
  deep: "深層期",
};

// ═══ Props ═══

interface V4EngineHubProps {
  totalObservations: number;
  firstObservationDate?: string | Date;
  isPremium?: boolean;
  /** サーバーから渡されるティア情報（指定がなければ isPremium から推定） */
  tier?: StargazerTier;
  /** ベータテスター: 全機能を強制解放 */
  isBetaTester?: boolean;
}

// ═══ Sub-Components ═══

/** Premium 限定バッジ */
function PremiumBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{
        background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(236,72,153,0.15))",
        color: "rgba(168,85,247,0.9)",
        border: "1px solid rgba(168,85,247,0.2)",
      }}
    >
      プレミアム
    </span>
  );
}

/** Free ティアでの制限付きバッジ */
function FreeLimitedBadge({ description }: { description?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{
        background: "rgba(100,116,139,0.1)",
        color: "rgba(100,116,139,0.8)",
        border: "1px solid rgba(100,116,139,0.15)",
      }}
      title={description}
    >
      制限あり
    </span>
  );
}

/** アップグレード促進カード — invitation, not paywall */
function UpgradePromptCard() {
  return (
    <GlassCard className="relative overflow-hidden p-0">
      {/* Animated gradient background */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, rgba(168,85,247,0.08), rgba(236,72,153,0.06), rgba(99,102,241,0.06))",
        }}
        animate={{
          background: [
            "linear-gradient(135deg, rgba(168,85,247,0.08), rgba(236,72,153,0.06), rgba(99,102,241,0.06))",
            "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(168,85,247,0.08), rgba(236,72,153,0.06))",
            "linear-gradient(135deg, rgba(236,72,153,0.06), rgba(99,102,241,0.06), rgba(168,85,247,0.08))",
          ],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Blurred preview mockup strip */}
      <div className="relative px-5 pt-5 pb-3">
        <div className="flex gap-2 mb-4 overflow-hidden">
          {[
            { icon: "rgba(168,85,247,0.2)", w: "40%" },
            { icon: "rgba(236,72,153,0.15)", w: "35%" },
            { icon: "rgba(99,102,241,0.15)", w: "45%" },
          ].map((bar, i) => (
            <motion.div
              key={i}
              className="h-8 rounded-lg flex-shrink-0"
              style={{
                width: bar.w,
                background: bar.icon,
                filter: "blur(3px)",
              }}
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 3, delay: i * 0.5, repeat: Infinity }}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10 px-5 pb-5">
        <p
          className="font-display text-base font-semibold mb-1"
          style={{ color: "rgba(24,30,50,0.9)" }}
        >
          もうひとりの自分はもっと多くを知っている
        </p>
        <p
          className="text-sm leading-relaxed mb-4"
          style={{ color: "rgba(72,78,100,0.65)" }}
        >
          プレミアムで全ての自己解読エンジンを解放する
        </p>

        <ul className="space-y-2 mb-5">
          {[
            { text: "もうひとりの自分との対話", icon: "\u{1F464}" },
            { text: "似た星の共鳴・選択の予測", icon: "\u{1F47B}" },
            { text: "心の指紋・月次レポート", icon: "\u{2726}" },
            { text: "全機能の回数制限解除", icon: "\u{267E}\u{FE0F}" },
          ].map((item) => (
            <li
              key={item.text}
              className="flex items-center gap-2.5 text-sm"
              style={{ color: "rgba(72,78,100,0.75)" }}
            >
              <span className="text-sm opacity-70">{item.icon}</span>
              {item.text}
            </li>
          ))}
        </ul>

        <motion.button
          className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all"
          style={{
            background: "linear-gradient(135deg, #a855f7, #ec4899)",
            boxShadow: "0 4px 20px rgba(168,85,247,0.2)",
          }}
          whileHover={{ scale: 1.01, boxShadow: "0 6px 25px rgba(168,85,247,0.3)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            // TODO: プレミアムアップグレードフローへ遷移（将来実装）
          }}
        >
          Premium で解放する
        </motion.button>
      </div>
    </GlassCard>
  );
}

// ═══ Component ═══

export default function V4EngineHub({
  totalObservations,
  firstObservationDate,
  isPremium = false,
  tier: tierProp,
  isBetaTester = false,
}: V4EngineHubProps) {
  // ティアを props から決定（ベータテスターは強制 premium）
  const tier: StargazerTier = isBetaTester
    ? { level: "premium" }
    : tierProp ?? { level: isPremium ? "premium" : "free" };

  const featureGates = getAllFeatureGates(tier);

  // localStorage に初回観測日を永続化（初回のみ副作用）
  const [storedFirstDate] = useState<string>(() => {
    if (typeof window === "undefined") return new Date().toISOString();
    const stored = localStorage.getItem("sg_first_observation");
    if (stored) return stored;
    const now = new Date().toISOString();
    safeLSSet("sg_first_observation", now);
    return now;
  });

  // フェーズ状態を同期的に計算（useEffect → useMemo でちらつき防止）
  const phaseState = useMemo<PhaseState>(() => {
    const firstDate = firstObservationDate || storedFirstDate;

    const input: PhaseInput = {
      firstObservationDate: firstDate,
      totalObservations,
      isPremium: tier.level === "premium",
      forceFullAccess: isBetaTester,
    };

    return resolvePhaseState(input);
  }, [totalObservations, firstObservationDate, storedFirstDate, tier.level, isBetaTester]);

  const { phase, phaseProgress, features, phaseMessage, nextPhase, daysToNextPhase } =
    phaseState;
  const colors = PHASE_COLORS[phase];

  // 機能をフェーズ制限とティア制限の両方で分類
  const featureMap = new Map(features.map((f) => [f.feature, f]));

  // フェーズ解放済み + ティアで利用可能
  const availableFeatures = FEATURE_DEFS.filter((d) => {
    const s = featureMap.get(d.key);
    const tierAvailable = isTierFeatureAvailable(tier, d.key);
    return s && s.access !== "locked" && tierAvailable;
  });

  // フェーズ解放済みだがティアでロック中（premium 限定）
  const premiumLockedFeatures = FEATURE_DEFS.filter((d) => {
    const s = featureMap.get(d.key);
    const tierAvailable = isTierFeatureAvailable(tier, d.key);
    return s && s.access !== "locked" && !tierAvailable;
  });

  // フェーズ自体がロック（観測不足）
  const phaseLockedFeatures = FEATURE_DEFS.filter((d) => {
    const s = featureMap.get(d.key);
    return s && s.access === "locked";
  });

  const hasPremiumLockedFeatures = premiumLockedFeatures.length > 0;

  return (
    <FadeInView delay={0.1}>
      <div className="space-y-6">
        {/* ── Phase Header ── */}
        <GlassCard variant="elevated" className="relative overflow-hidden">
          {/* Progress bar background */}
          <div
            className="absolute inset-0 bg-gradient-to-r from-indigo-100/30 to-violet-100/30"
            style={{ width: `${phaseProgress * 100}%`, transition: "width 1s ease-out" }}
          />
          <div className="relative z-10 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${colors.bg} ${colors.text} ${colors.border}`}
                >
                  {PHASE_LABELS[phase]}
                </span>
                <span className="font-mono-sg text-sm" style={{ color: "rgba(72,78,100,0.7)" }}>
                  Day {phaseState.daysSinceFirstObservation}
                </span>
                {tier.level === "premium" && <PremiumBadge />}
              </div>
              {nextPhase && daysToNextPhase !== undefined && daysToNextPhase > 0 && (
                <span className="text-xs" style={{ color: "rgba(72,78,100,0.6)" }}>
                  {PHASE_LABELS[nextPhase]}まで約{daysToNextPhase}日
                </span>
              )}
            </div>
            <p
              className="font-display text-base leading-relaxed"
              style={{ color: "rgba(24,30,50,0.9)" }}
            >
              {phaseMessage}
            </p>
          </div>
        </GlassCard>

        {/* ── Available Features Grid ── */}
        {availableFeatures.length > 0 && (
          <div>
            <h3
              className="text-sm font-medium mb-3 px-1"
              style={{ color: "rgba(72,78,100,0.8)" }}
            >
              自己解読エンジン
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {availableFeatures.map((def, i) => {
                const state = featureMap.get(def.key)!;
                const gate = featureGates[def.key];
                return (
                  <motion.div
                    key={def.key}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <Link href={def.href} className="block">
                      <GlassCard
                        className={`relative overflow-hidden p-4 h-full bg-gradient-to-br ${def.gradient} hover:shadow-md transition-shadow`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-2xl">{def.icon}</span>
                          <div className="flex flex-col items-end gap-1">
                            {state.access === "limited" && (
                              <GlassBadge className="text-[10px]">制限中</GlassBadge>
                            )}
                            {gate?.limited && (
                              <FreeLimitedBadge description={gate?.limitDescription} />
                            )}
                          </div>
                        </div>
                        <p
                          className="font-display text-sm font-medium mb-0.5"
                          style={{ color: "rgba(24,30,50,0.95)" }}
                        >
                          {def.label}
                        </p>
                        <p
                          className="text-[11px] leading-snug"
                          style={{ color: "rgba(72,78,100,0.75)" }}
                        >
                          {def.description}
                        </p>
                        {gate?.limited && gate?.dailyLimit && (
                          <p
                            className="text-[10px] mt-1.5"
                            style={{ color: "rgba(100,116,139,0.6)" }}
                          >
                            {gate.dailyLimit}回/日
                          </p>
                        )}
                      </GlassCard>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Premium Locked Features ── */}
        {hasPremiumLockedFeatures && (
          <div>
            <h3
              className="text-sm font-medium mb-3 px-1 font-display"
              style={{ color: "rgba(168,85,247,0.8)" }}
            >
              もっと深くへ
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {premiumLockedFeatures.map((def, i) => {
                const gate = featureGates[def.key];
                return (
                  <motion.div
                    key={def.key}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.06 }}
                  >
                    <GlassCard
                      className={`relative overflow-hidden p-4 h-full bg-gradient-to-br ${def.gradient}`}
                    >
                      {/* Blurred overlay to suggest locked content */}
                      <div
                        className="absolute inset-0 z-10 rounded-2xl"
                        style={{
                          background: "linear-gradient(180deg, transparent 30%, rgba(255,255,255,0.5) 100%)",
                          backdropFilter: "blur(1px)",
                        }}
                      />

                      <div className="relative z-20">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-2xl opacity-60">{def.icon}</span>
                          <PremiumBadge />
                        </div>
                        <p
                          className="font-display text-sm font-medium mb-0.5"
                          style={{ color: "rgba(24,30,50,0.7)" }}
                        >
                          {def.label}
                        </p>
                        <p
                          className="text-[11px] leading-snug"
                          style={{ color: "rgba(72,78,100,0.5)" }}
                        >
                          {gate?.upgradePrompt || def.description}
                        </p>
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })}
            </div>
            {/* アップグレード促進カード */}
            <UpgradePromptCard />
          </div>
        )}

        {/* ── Phase Locked Features ── */}
        {phaseLockedFeatures.length > 0 && (
          <div>
            <h3
              className="text-sm font-medium mb-3 px-1 font-display"
              style={{ color: "rgba(72,78,100,0.55)" }}
            >
              観測を重ねると現れる機能
            </h3>
            <div className="space-y-2">
              {phaseLockedFeatures.map((def, i) => {
                const state = featureMap.get(def.key)!;
                const tierAvailable = isTierFeatureAvailable(tier, def.key);
                return (
                  <motion.div
                    key={def.key}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{
                      background: "rgba(200,200,210,0.08)",
                      border: "1px solid rgba(200,200,210,0.15)",
                    }}
                  >
                    <motion.span
                      className="text-xl"
                      style={{ opacity: 0.25, filter: "grayscale(0.6)" }}
                      animate={{ opacity: [0.2, 0.35, 0.2] }}
                      transition={{ duration: 4, delay: i * 0.5, repeat: Infinity }}
                    >
                      {def.icon}
                    </motion.span>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "rgba(72,78,100,0.5)" }}
                      >
                        {def.label}
                      </p>
                      <p
                        className="text-[11px] truncate"
                        style={{ color: "rgba(72,78,100,0.4)" }}
                      >
                        {state.unlockHint}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!tierAvailable && <PremiumBadge />}
                      <span className="text-xs" style={{ color: "rgba(72,78,100,0.3)" }}>
                        {"\uD83D\uDD12"}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </FadeInView>
  );
}
