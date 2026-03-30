"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  RV_COLORS,
  RvCard,
} from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import AvatarJourney from "@/components/rendezvous/AvatarJourney";
import { AvatarDiaryCard } from "@/components/rendezvous/AvatarDiaryCard";
import { ProfileStrengthMeter } from "@/components/rendezvous/ProfileStrengthMeter";
import { ProgressiveQuestionCard } from "@/components/rendezvous/ProgressiveQuestionCard";
import AvatarReportShare from "@/components/rendezvous/AvatarReportShare";
import type { AvatarDiaryEntry } from "@/lib/rendezvous/avatarGrowthDiary";

// =============================================================================
// Types
// =============================================================================

type AvatarStatus = {
  activeConversations: number;
  nextActivityIn: string;
};

type Props = {
  avatarStatus: AvatarStatus;
  avatarDiary: AvatarDiaryEntry | null;
  /** 分身が惹かれる印象タイプ (AvatarReportShare用) */
  attractedImpressions?: string[];
  /** 分身が大切にしている価値 (AvatarReportShare用) */
  coreValues?: string[];
  /** ユーザー表示名 */
  displayName?: string | null;
  /** アーキタイプラベル */
  archetypeLabel?: string | null;
};

// =============================================================================
// Avatar status animation variants
// =============================================================================

function AvatarStateAnimation({ status }: { status: AvatarStatus }) {
  const isExploring = status.activeConversations === 0;
  const isContacting = status.activeConversations > 0;

  return (
    <div className="relative flex items-center justify-center" style={{ height: 200 }}>
      {/* Outer ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 180,
          height: 180,
          border: `2px solid ${RV_COLORS.primary}15`,
        }}
        animate={
          isContacting
            ? { scale: [1, 1.05, 1], borderColor: [`${RV_COLORS.primary}15`, `${RV_COLORS.primary}40`, `${RV_COLORS.primary}15`] }
            : { scale: [1, 1.02, 1] }
        }
        transition={{ duration: isContacting ? 2 : 4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Middle ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 140,
          height: 140,
          border: `1.5px solid ${RV_COLORS.accent}20`,
        }}
        animate={
          isContacting
            ? { scale: [1, 1.08, 1], opacity: [0.5, 1, 0.5] }
            : { scale: [1, 1.03, 1] }
        }
        transition={{ duration: isContacting ? 1.8 : 5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
      />

      {/* Central avatar orb */}
      <motion.div
        className="relative rounded-full flex items-center justify-center"
        style={{
          width: 100,
          height: 100,
          background: RV_COLORS.gradientSubtle,
          border: `2px solid ${RV_COLORS.border}`,
          boxShadow: isContacting
            ? `0 0 30px ${RV_COLORS.primaryGlow}`
            : `0 0 15px ${RV_COLORS.shadow}`,
        }}
        animate={
          isExploring
            ? { y: [0, -6, 0] } // floating
            : { scale: [1, 1.04, 1] } // pulsing glow
        }
        transition={{
          duration: isExploring ? 3 : 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <span className="text-4xl">&#x1F47B;</span>
      </motion.div>

      {/* Floating particles (exploring) */}
      {isExploring &&
        [0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute w-1.5 h-1.5 rounded-full"
            style={{ background: `${RV_COLORS.primary}40` }}
            animate={{
              x: [0, Math.cos((i * 72 * Math.PI) / 180) * 80],
              y: [0, Math.sin((i * 72 * Math.PI) / 180) * 80],
              opacity: [0, 0.8, 0],
              scale: [0, 1, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 0.6,
              ease: "easeOut",
            }}
          />
        ))}
    </div>
  );
}

// =============================================================================
// Vitality Meter
// =============================================================================

function VitalityMeter({ conversations }: { conversations: number }) {
  const vitality = Math.min(100, 30 + conversations * 20);
  return (
    <RvCard>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold" style={{ color: RV_COLORS.text }}>
          分身の活力
        </span>
        <span className="text-xs font-bold" style={{ color: RV_COLORS.primary }}>
          {vitality}%
        </span>
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: RV_COLORS.surfaceMuted }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: RV_COLORS.gradient }}
          initial={{ width: 0 }}
          animate={{ width: `${vitality}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
      <p className="text-[10px] mt-2" style={{ color: RV_COLORS.textMuted }}>
        {conversations > 0
          ? `${conversations}人との接触でエネルギーが高まっています`
          : "静かに充電中。新しい出会いでエネルギーが上がります"}
      </p>
    </RvCard>
  );
}

// =============================================================================
// AvatarTab Component
// =============================================================================

export default function AvatarTab({
  avatarStatus,
  avatarDiary,
  attractedImpressions,
  coreValues,
  displayName,
  archetypeLabel,
}: Props) {
  const statusLabel =
    avatarStatus.activeConversations > 0
      ? "接触中"
      : "探索中";

  return (
    <div className="flex flex-col">
      {/* Hero: Avatar with state animation */}
      <FadeInView delay={0}>
        <div className="flex flex-col items-center pt-6 pb-4">
          <AvatarStateAnimation status={avatarStatus} />
          <motion.p
            className="text-sm font-bold mt-2"
            style={{ color: RV_COLORS.text }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            あなたの分身 &#x2014; {statusLabel}
          </motion.p>
          <p className="text-xs mt-1" style={{ color: RV_COLORS.textSub }}>
            {avatarStatus.activeConversations > 0
              ? `${avatarStatus.activeConversations}人と会話中`
              : `次の活動まで${avatarStatus.nextActivityIn}`}
          </p>
        </div>
      </FadeInView>

      {/* Vitality meter */}
      <FadeInView delay={0.05}>
        <div className="px-5 mt-2">
          <VitalityMeter conversations={avatarStatus.activeConversations} />
        </div>
      </FadeInView>

      {/* Avatar diary */}
      {avatarDiary && (
        <FadeInView delay={0.1}>
          <div className="px-5 mt-4">
            <AvatarDiaryCard entry={avatarDiary} />
          </div>
        </FadeInView>
      )}

      {/* 分身の発見レポート */}
      {attractedImpressions && attractedImpressions.length > 0 && (
        <FadeInView delay={0.12}>
          <div className="px-5 mt-4">
            <RvCard>
              <p
                className="text-xs font-bold mb-3"
                style={{ color: RV_COLORS.text }}
              >
                分身の発見
              </p>
              <AvatarReportShare
                attractedImpressions={attractedImpressions}
                coreValues={coreValues ?? []}
                displayName={displayName}
                archetypeLabel={archetypeLabel}
              />
            </RvCard>
          </div>
        </FadeInView>
      )}

      {/* Avatar journey timeline */}
      <FadeInView delay={0.15}>
        <div className="px-5 mt-4">
          <AvatarJourney />
        </div>
      </FadeInView>

      {/* Progressive question */}
      <FadeInView delay={0.2}>
        <div className="px-5 mt-4">
          <ProgressiveQuestionCard />
        </div>
      </FadeInView>

      {/* Profile strength */}
      <FadeInView delay={0.25}>
        <div className="px-5 mt-4">
          <ProfileStrengthMeter />
        </div>
      </FadeInView>

      {/* Baton change button */}
      <FadeInView delay={0.3}>
        <div className="px-5 mt-6 mb-4">
          <Link href="/rendezvous/settings" className="no-underline">
            <RvCard>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: RV_COLORS.secondarySoft }}
                >
                  <span className="text-lg">&#x1F3AD;</span>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold" style={{ color: RV_COLORS.text }}>
                    分身の性格を変える
                  </p>
                  <p className="text-[10px]" style={{ color: RV_COLORS.textMuted }}>
                    バトンチェンジで探索スタイルを調整
                  </p>
                </div>
                <span className="text-xs" style={{ color: RV_COLORS.textMuted }}>&#x203A;</span>
              </div>
            </RvCard>
          </Link>
        </div>
      </FadeInView>
    </div>
  );
}
