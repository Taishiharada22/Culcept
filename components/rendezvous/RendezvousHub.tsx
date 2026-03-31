"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { RV_COLORS, RvHeartbeat } from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import {
  trackHubView,
  trackLaneClick,
  type RendezvousLane,
} from "@/lib/rendezvous/trackRendezvous";

// =============================================================================
// 3枠定義
// =============================================================================

type TierConfig = {
  id: "romance" | "connection" | "partner";
  title: string;
  subtitle: string;
  description: string;
  color: string;
  colorGlow: string;
  colorSoft: string;
  path: string;
  badge?: string;
  modes?: string[];
  previewLabel?: string;
};

const TIERS: TierConfig[] = [
  {
    id: "romance",
    title: "恋愛",
    subtitle: "Romance",
    description:
      "直感が導く出会い。写真とフィーリングで、運命の一瞬を掴む。",
    color: "#E91E63",
    colorGlow: "rgba(233,30,99,0.15)",
    colorSoft: "rgba(233,30,99,0.05)",
    path: "/rendezvous/romance",
    badge: "身元確認必須",
    previewLabel: "今日の候補",
  },
  {
    id: "connection",
    title: "つながり",
    subtitle: "Connection",
    description:
      "内面が先に出会う。分身があなたの代わりに相性を確かめ、本当に合う人だけを届ける。",
    color: "#7B61FF",
    colorGlow: "rgba(123,97,255,0.15)",
    colorSoft: "rgba(123,97,255,0.05)",
    path: "/rendezvous/connection",
    modes: ["友達", "コミュニティ", "ビジネス"],
  },
  {
    id: "partner",
    title: "パートナー",
    subtitle: "Partner",
    description:
      "人生設計から逆算する、本気の出会い。3層スコアリングとAIカウンセラーが伴走。",
    color: "#D4776B",
    colorGlow: "rgba(212,119,107,0.15)",
    colorSoft: "rgba(212,119,107,0.05)",
    path: "/rendezvous/partner",
    badge: "恋愛クリア済みの方",
  },
];

// =============================================================================
// Chevron icon
// =============================================================================

function ChevronRight({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 3L11 8L6 13"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// =============================================================================
// TierCard
// =============================================================================

function TierCard({ tier, index }: { tier: TierConfig; index: number }) {
  const router = useRouter();

  return (
    <motion.button
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.3 + index * 0.15,
        type: "spring",
        stiffness: 260,
        damping: 28,
      }}
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -3, boxShadow: `0 12px 40px ${RV_COLORS.shadowDeep}` }}
      onClick={() => {
        trackLaneClick(tier.id as RendezvousLane);
        router.push(tier.path);
      }}
      className="w-full text-left rounded-2xl overflow-hidden cursor-pointer"
      style={{
        background: RV_COLORS.surface,
        border: `1px solid ${RV_COLORS.border}`,
        boxShadow: `0 4px 24px ${RV_COLORS.shadow}`,
        padding: 0,
      }}
    >
      {/* Gradient accent bar — 3px */}
      <div
        className="w-full"
        style={{
          height: 3,
          background: `linear-gradient(90deg, ${tier.color}, ${tier.color}90, ${tier.color}40)`,
        }}
      />

      <div className="px-6 py-6">
        {/* Title row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-baseline gap-2.5">
              <h3
                className="font-bold"
                style={{
                  color: RV_COLORS.text,
                  fontSize: 20,
                  lineHeight: 1.3,
                  fontFamily: '"Noto Serif JP", serif',
                }}
              >
                {tier.title}
              </h3>
              <span
                className="font-medium tracking-wider"
                style={{
                  color: `${tier.color}B0`,
                  fontSize: 12,
                  letterSpacing: "0.12em",
                }}
              >
                {tier.subtitle}
              </span>
            </div>

            {/* Badge */}
            {tier.badge && (
              <span
                className="inline-block mt-2 text-[10px] font-semibold px-2.5 py-1 rounded-full"
                style={{
                  background: `${tier.color}0C`,
                  color: tier.color,
                  border: `1px solid ${tier.color}20`,
                }}
              >
                {tier.badge}
              </span>
            )}
          </div>

          {/* Chevron */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
            style={{ background: tier.colorGlow }}
          >
            <ChevronRight color={tier.color} />
          </div>
        </div>

        {/* Description */}
        <p
          style={{
            color: RV_COLORS.textSub,
            fontSize: 13,
            lineHeight: 1.8,
          }}
        >
          {tier.description}
        </p>

        {/* Mode chips (connection only) */}
        {tier.modes && (
          <div className="flex items-center gap-2 mt-4">
            {tier.modes.map((mode) => (
              <span
                key={mode}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: tier.colorSoft,
                  color: `${tier.color}D0`,
                  border: `1px solid ${tier.color}15`,
                }}
              >
                {mode}
              </span>
            ))}
          </div>
        )}

        {/* Preview area (romance only) */}
        {tier.previewLabel && (
          <div
            className="flex items-center justify-between mt-4 pt-3"
            style={{ borderTop: `1px solid ${RV_COLORS.border}` }}
          >
            <span
              className="text-[11px] font-medium"
              style={{ color: RV_COLORS.textMuted }}
            >
              {tier.previewLabel}
            </span>
            <span
              className="text-[11px] font-bold"
              style={{ color: tier.color }}
            >
              ---
            </span>
          </div>
        )}
      </div>
    </motion.button>
  );
}

// =============================================================================
// TodaySignal — ライブ感を出す日替わりメッセージ
// =============================================================================

function TodaySignal() {
  const messages = [
    { text: "今日、新しい候補が追加されました", accent: RV_COLORS.primary },
    { text: "あなたと相性の高い人が見つかっています", accent: RV_COLORS.secondary },
    { text: "分身が新しい接点を探索中です", accent: RV_COLORS.accent },
  ];

  const evolutionMessages = [
    "昨日よりマッチング精度が向上しました",
    "新しい傾向を学習しました",
    "あなたの判断パターンをより深く理解しました",
    "相性予測の確信度が上がりました",
    "コミュニケーション傾向の分析が進みました",
  ];

  const dayIndex = new Date().getDate() % messages.length;
  const evoIndex = new Date().getDate() % evolutionMessages.length;
  const msg = messages[dayIndex];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.5 }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 14px",
        borderRadius: 12,
        backgroundColor: RV_COLORS.surface,
        border: `1px solid ${RV_COLORS.border}`,
      }}
    >
      {/* Live signal */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
          <motion.div
            animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              backgroundColor: msg.accent,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              backgroundColor: msg.accent,
            }}
          />
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, color: RV_COLORS.textSub, lineHeight: 1.5 }}>
          {msg.text}
        </span>
      </div>
      {/* Daily evolution */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingTop: 8,
          borderTop: `1px solid ${RV_COLORS.border}`,
        }}
      >
        <span style={{ fontSize: 10, color: RV_COLORS.primary, fontWeight: 600, flexShrink: 0 }}>↑</span>
        <span style={{ fontSize: 11, color: RV_COLORS.textMuted, lineHeight: 1.5 }}>
          {evolutionMessages[evoIndex]}
        </span>
      </div>
    </motion.div>
  );
}

// =============================================================================
// UnderstandingMeter — 成長の可視化
// =============================================================================

function UnderstandingMeter() {
  // Derive a pseudo-growth score from localStorage interaction count
  const [score, setScore] = useState(0);
  useEffect(() => {
    const raw = localStorage.getItem("rv_interaction_count") ?? "0";
    const count = parseInt(raw, 10);
    // Map interaction count to a 0-100 understanding score (logarithmic growth)
    // Starts at 42 (base from onboarding), maxes near 95
    const base = 42;
    const growth = Math.min(53, Math.round(53 * (1 - Math.exp(-count / 20))));
    setScore(base + growth);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.5 }}
      style={{
        padding: "14px 18px",
        borderRadius: 14,
        backgroundColor: RV_COLORS.surface,
        border: `1px solid ${RV_COLORS.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: RV_COLORS.text, letterSpacing: "0.03em" }}>
          分身の理解度
        </span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: RV_COLORS.primary,
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
          }}
        >
          {score}%
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: RV_COLORS.surfaceMuted, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.6 }}
          style={{
            height: "100%",
            borderRadius: 2,
            background: RV_COLORS.gradient,
          }}
        />
      </div>
      <p style={{ fontSize: 10, color: RV_COLORS.textMuted, marginTop: 6, lineHeight: 1.5 }}>
        {score >= 70
          ? "あなたの価値観をより正確に捉えています"
          : score >= 55
            ? "候補の精度が向上してきています"
            : "使い続けるほど、あなたの分身は賢くなります"}
      </p>
    </motion.div>
  );
}

// =============================================================================
// TodaySpotlight — 今日の注目候補
// =============================================================================

function TodaySpotlight() {
  // Simple daily highlight — uses deterministic rotation
  const dayOfMonth = new Date().getDate();
  const spotlightMessages = [
    { label: "今日の注目", text: "特に相性が高い候補が1人います", tier: "romance" as const },
    { label: "新しい発見", text: "価値観が深く共鳴する人が見つかりました", tier: "connection" as const },
    { label: "注目の接点", text: "珍しい共通点を持つ候補がいます", tier: "connection" as const },
  ];
  const spot = spotlightMessages[dayOfMonth % spotlightMessages.length];
  const tierConfig = TIERS.find((t) => t.id === spot.tier) ?? TIERS[0];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.55, duration: 0.5, type: "spring", stiffness: 200 }}
      style={{
        padding: "14px 18px",
        borderRadius: 14,
        background: `linear-gradient(135deg, ${tierConfig.colorSoft} 0%, ${RV_COLORS.surface} 100%)`,
        border: `1px solid ${tierConfig.color}18`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: `${tierConfig.color}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 14, color: tierConfig.color }}>★</span>
        </div>
        <div style={{ flex: 1 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: tierConfig.color,
              letterSpacing: "0.06em",
              display: "block",
              marginBottom: 2,
            }}
          >
            {spot.label}
          </span>
          <span style={{ fontSize: 12, color: RV_COLORS.textSub, lineHeight: 1.5 }}>
            {spot.text}
          </span>
        </div>
        <ChevronRight color={tierConfig.color} />
      </div>
    </motion.div>
  );
}

// =============================================================================
// PremiumUnlockedBanner — サブスクリプション価値ヒント
// =============================================================================

function PremiumUnlockedBanner() {
  const features = [
    "深層分析が解放されています",
    "詳細な相性理由を閲覧できます",
    "分身の判断根拠を確認できます",
  ];
  const dayIndex = new Date().getDate() % features.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.7, duration: 0.6 }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderRadius: 10,
        background: `linear-gradient(90deg, ${RV_COLORS.primarySoft}, ${RV_COLORS.secondarySoft})`,
        border: `1px solid ${RV_COLORS.primaryGlow}`,
      }}
    >
      <span style={{ fontSize: 12, color: RV_COLORS.primary, fontWeight: 600, flexShrink: 0 }}>◎</span>
      <span style={{ fontSize: 11, color: RV_COLORS.textSub, lineHeight: 1.5 }}>
        {features[dayIndex]}
      </span>
    </motion.div>
  );
}

// =============================================================================
// RendezvousHub
// =============================================================================

export default function RendezvousHub() {
  useEffect(() => {
    trackHubView();
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col pb-28"
      style={{
        background: `linear-gradient(180deg, rgba(194,24,91,0.03) 0%, ${RV_COLORS.base} 35%, rgba(255,109,0,0.02) 100%)`,
      }}
    >
      {/* ============================================================= */}
      {/* Hero Section                                                  */}
      {/* ============================================================= */}
      <div className="relative px-6 pt-12 pb-8">
        {/* Subtle heartbeat in corner */}
        <div className="absolute top-8 right-6 opacity-40">
          <RvHeartbeat size={36} intensity={0.3} color={RV_COLORS.primaryLight} />
        </div>

        <motion.h1
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{
            fontFamily: '"Noto Serif JP", serif',
            color: RV_COLORS.text,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.08em",
            lineHeight: 1.2,
          }}
        >
          Rendezvous
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="mt-3"
          style={{
            fontFamily: '"Noto Serif JP", serif',
            color: RV_COLORS.textMuted,
            fontSize: 14,
            letterSpacing: "0.06em",
            lineHeight: 1.6,
          }}
        >
          深層が導く、かつてない出会い
        </motion.p>

        {/* Divider line with gradient */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
          className="mt-6 h-px origin-left"
          style={{
            background: `linear-gradient(90deg, ${RV_COLORS.primary}30, ${RV_COLORS.accent}20, transparent)`,
          }}
        />
      </div>

      {/* Today's signal — ライブ感 + デイリー進化 */}
      <FadeInView delay={0.4} className="px-6 mt-6 mb-2">
        <TodaySignal />
      </FadeInView>

      {/* Understanding Meter — 成長の可視化 */}
      <FadeInView delay={0.45} className="px-6 mt-3 mb-2">
        <UnderstandingMeter />
      </FadeInView>

      {/* Today's Spotlight — 今日の注目候補 */}
      <FadeInView delay={0.5} className="px-6 mt-1 mb-4">
        <TodaySpotlight />
      </FadeInView>

      {/* ============================================================= */}
      {/* Three Tier Cards                                              */}
      {/* ============================================================= */}
      <div className="px-5 flex flex-col gap-5">
        {TIERS.map((tier, i) => (
          <TierCard key={tier.id} tier={tier} index={i} />
        ))}
      </div>

      {/* Premium value banner */}
      <FadeInView delay={0.55} className="px-6 mt-6 mb-2">
        <PremiumUnlockedBanner />
      </FadeInView>

      {/* ============================================================= */}
      {/* Bottom Section                                                */}
      {/* ============================================================= */}
      <FadeInView delay={0.6} className="px-6 mt-6 flex flex-col items-center gap-4">
        {/* Settings button */}
        <motion.a
          href="/rendezvous/settings"
          whileHover={{ opacity: 0.7 }}
          whileTap={{ scale: 0.97 }}
          className="text-xs font-medium px-4 py-2 rounded-lg transition-colors"
          style={{
            color: RV_COLORS.textMuted,
            background: RV_COLORS.surfaceMuted,
          }}
        >
          Rendezvous 設定
        </motion.a>

        {/* Footer attribution */}
        <p
          className="text-center"
          style={{
            color: `${RV_COLORS.textMuted}80`,
            fontSize: 10,
            letterSpacing: "0.08em",
          }}
        >
          Powered by Aneurasync Deep Observation
        </p>
      </FadeInView>
    </div>
  );
}
