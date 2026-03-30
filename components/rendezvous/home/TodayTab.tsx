"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  RV_COLORS,
  RV_CATEGORY_COLORS,
  RvCard,
} from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import AbsenceCard from "@/components/rendezvous/AbsenceCard";
import { TonightSessionBanner } from "@/components/rendezvous/TonightSessionBanner";
import { PartnerObservationNudge } from "@/components/rendezvous/PartnerObservationNudge";
import { AvatarEscalationCard } from "@/components/rendezvous/AvatarEscalationCard";
import { DailyTopicCard, type DailyTopicData } from "@/components/rendezvous/DailyTopicCard";
import { ProphecyCard, type ProphecyData } from "@/components/rendezvous/ProphecyCard";
import { DailyResonanceCard } from "@/components/rendezvous/DailyResonanceCard";
import { ZeroMatchWarmth } from "@/components/rendezvous/ZeroMatchWarmth";
import ActivityPulseOrb from "@/components/rendezvous/ActivityPulseOrb";
import GrowthTimeline from "@/components/rendezvous/counselor/GrowthTimeline";
import type { GrowthInsight } from "@/lib/rendezvous/counselor/types";
import type { DailyResonance } from "@/lib/rendezvous/dailyResonance";
import type { EscalationState } from "@/lib/rendezvous/avatarLiveEngine";
import type { AbsenceSuggestion } from "@/lib/rendezvous/absenceDesign";

// =============================================================================
// Types (re-export from parent)
// =============================================================================

type InterestedUser = {
  id: string;
  photoUrl: string | null;
  blurredPhotoUrl?: string | null;
};

type CandidatePreview = {
  candidateId: string;
  displayName: string;
  photoUrl: string | null;
  age: number | null;
  area: string | null;
  corePhrase: string;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
};

type ActiveChat = {
  candidateId: string;
  name: string;
  avatarUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
};

type AvatarStatus = {
  activeConversations: number;
  nextActivityIn: string;
};

type AnimaWhisperData = {
  id: string;
  message: string;
  subtext: string | null;
  tone: "warm" | "reflective" | "playful" | "serious" | "celebratory";
};

type Props = {
  interestedUsers: InterestedUser[];
  todayCandidates: CandidatePreview[];
  activeChats: ActiveChat[];
  avatarStatus: AvatarStatus;
  animaWhisper: AnimaWhisperData | null;
  dailyTopic: DailyTopicData | null;
  prophecy: ProphecyData | null;
  dailyResonance: DailyResonance | null;
  absenceSuggestion: AbsenceSuggestion | null;
  escalation: {
    state: EscalationState;
    candidateName: string;
    candidateId: string;
  } | null;
  onDismissAbsence: () => void;
  onAcceptAbsence: () => void;
  onCustomizeAbsence: (hours: number) => void;
  onDismissEscalation: () => void;
  onArchiveEscalation: () => void;
};

// =============================================================================
// TodayTab: 今日 -- Primary action + today's match
// =============================================================================

export default function TodayTab({
  interestedUsers,
  todayCandidates,
  activeChats,
  avatarStatus,
  animaWhisper,
  dailyTopic,
  prophecy,
  dailyResonance,
  absenceSuggestion,
  escalation,
  onDismissAbsence,
  onAcceptAbsence,
  onCustomizeAbsence,
  onDismissEscalation,
  onArchiveEscalation,
}: Props) {
  const router = useRouter();
  const interestedCount = interestedUsers.length;

  return (
    <div className="flex flex-col">
      {/* 不在提案カード */}
      {absenceSuggestion && (
        <FadeInView delay={0}>
          <div className="px-5 pt-4 pb-2">
            <AbsenceCard
              suggestion={absenceSuggestion}
              onAccept={onAcceptAbsence}
              onDecline={onDismissAbsence}
              onCustomize={onCustomizeAbsence}
            />
          </div>
        </FadeInView>
      )}

      {/* セッションバナー */}
      <FadeInView delay={0}>
        <div className="px-5 pt-4 pb-2">
          <TonightSessionBanner />
        </div>
      </FadeInView>

      {/* 相手観測の誘導 */}
      <PartnerObservationNudge />

      {/* エスカレーション */}
      {escalation && (
        <FadeInView delay={0}>
          <div className="px-5 pt-4 pb-2">
            <AvatarEscalationCard
              escalation={escalation.state}
              candidateName={escalation.candidateName}
              onBatonChange={() => {
                router.push(
                  `/rendezvous/${escalation.candidateId}?chat=1`
                );
              }}
              onPostpone={onDismissEscalation}
              onArchive={onArchiveEscalation}
            />
          </div>
        </FadeInView>
      )}

      {/* ================================================================= */}
      {/* Hero: Today's best match / Avatar exploring status               */}
      {/* ================================================================= */}
      <FadeInView delay={0.05}>
        <div
          className="relative overflow-hidden"
          style={{
            minHeight: "36vh",
            background: RV_COLORS.gradientSubtle,
          }}
        >
          {/* Blurred photo circles */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-full h-full">
              {interestedCount > 0 ? (
                <>
                  {interestedUsers.slice(0, 5).map((user, i) => {
                    const positions = [
                      { top: "15%", left: "20%" },
                      { top: "25%", right: "15%" },
                      { top: "55%", left: "12%" },
                      { top: "50%", right: "22%" },
                      { top: "35%", left: "45%" },
                    ];
                    const pos = positions[i % positions.length];
                    const size = i === 4 ? 56 : 64 + (i % 2) * 12;
                    return (
                      <motion.div
                        key={user.id}
                        className="absolute rounded-full overflow-hidden"
                        style={{
                          ...pos,
                          width: size,
                          height: size,
                          filter: "blur(12px)",
                          opacity: 0.6,
                        }}
                        animate={{
                          scale: [1, 1.08, 1],
                          opacity: [0.5, 0.7, 0.5],
                        }}
                        transition={{
                          duration: 3 + i * 0.5,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: i * 0.4,
                        }}
                      >
                        {user.photoUrl ? (
                          <img
                            src={user.blurredPhotoUrl ?? user.photoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div
                            className="w-full h-full"
                            style={{
                              background: `linear-gradient(135deg, ${RV_COLORS.primary}40, ${RV_COLORS.accent}40)`,
                            }}
                          />
                        )}
                      </motion.div>
                    );
                  })}
                </>
              ) : (
                <motion.div
                  className="absolute inset-0"
                  style={{ background: RV_COLORS.gradientSubtle }}
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 4, repeat: Infinity }}
                />
              )}
            </div>
          </div>

          {/* Center text */}
          <div className="relative z-10 flex flex-col items-center justify-center px-6 py-14">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-center"
            >
              {interestedCount > 0 ? (
                <>
                  <motion.p
                    className="text-5xl font-black"
                    style={{
                      background: RV_COLORS.gradient,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                    animate={{ scale: [1, 1.02, 1] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    {interestedCount}
                  </motion.p>
                  <p
                    className="text-base font-bold mt-2"
                    style={{ color: RV_COLORS.text }}
                  >
                    人があなたに気づいています
                  </p>
                  <p
                    className="text-xs mt-2"
                    style={{ color: RV_COLORS.textSub }}
                  >
                    タップして確認
                  </p>
                </>
              ) : (
                <>
                  <motion.div
                    className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{
                      background: RV_COLORS.gradientSubtle,
                      border: `1px solid ${RV_COLORS.border}`,
                    }}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    <span className="text-2xl">&#x2728;</span>
                  </motion.div>
                  <div className="flex justify-center mb-2">
                    <ActivityPulseOrb
                      intensity={
                        avatarStatus.activeConversations > 0 ? 0.7 : 0.3
                      }
                    />
                  </div>
                  <p
                    className="text-base font-bold"
                    style={{ color: RV_COLORS.text }}
                  >
                    分身が探索しています
                  </p>
                  <p
                    className="text-xs mt-2"
                    style={{ color: RV_COLORS.textSub }}
                  >
                    {avatarStatus.activeConversations > 0
                      ? `${avatarStatus.activeConversations}人と会話中`
                      : `次の活動まで${avatarStatus.nextActivityIn}`}
                  </p>
                </>
              )}
            </motion.div>

            {/* CTA Button */}
            <motion.div
              className="mt-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Link href="/rendezvous/explore" className="no-underline">
                <motion.button
                  className="px-8 py-3 rounded-full text-sm font-bold text-white border-none cursor-pointer"
                  style={{
                    background: RV_COLORS.gradient,
                    boxShadow: `0 4px 20px ${RV_COLORS.primaryGlow}`,
                  }}
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.03 }}
                >
                  新しい出会いを探す
                </motion.button>
              </Link>
            </motion.div>
          </div>
        </div>
      </FadeInView>

      {/* Daily topic card */}
      {dailyTopic && (
        <FadeInView delay={0}>
          <div className="px-5 pt-4 pb-2">
            <DailyTopicCard topic={dailyTopic} />
          </div>
        </FadeInView>
      )}

      {/* 予言カード */}
      {prophecy && (
        <FadeInView delay={0.1}>
          <div className="px-5 pb-2">
            <ProphecyCard prophecy={prophecy} />
          </div>
        </FadeInView>
      )}

      {/* Daily resonance */}
      {dailyResonance && (
        <FadeInView delay={0.15}>
          <div className="px-5 mt-4">
            <DailyResonanceCard resonance={dailyResonance} />
          </div>
        </FadeInView>
      )}

      {/* Anima Whisper */}
      {animaWhisper && (
        <FadeInView delay={0.15}>
          <div className="px-5 mt-4">
            <RvCard>
              <div className="flex items-start gap-3">
                <motion.span
                  className="text-sm shrink-0 mt-0.5"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  &#x2726;
                </motion.span>
                <div className="flex-1 min-w-0">
                  <span
                    className="text-[10px] tracking-[0.15em] font-bold uppercase"
                    style={{ color: RV_COLORS.textMuted }}
                  >
                    Anima
                  </span>
                  <p
                    className="text-sm leading-relaxed mt-1"
                    style={{
                      fontFamily: "'Noto Serif JP', serif",
                      color: RV_COLORS.text,
                    }}
                  >
                    {animaWhisper.message}
                  </p>
                </div>
              </div>
            </RvCard>
          </div>
        </FadeInView>
      )}

      {/* Quick actions row */}
      <FadeInView delay={0.2}>
        <div className="px-5 mt-4">
          <div className="grid grid-cols-3 gap-2">
            <Link href="/rendezvous/explore" className="no-underline">
              <RvCard>
                <div className="text-center py-1">
                  <p className="text-lg font-black" style={{ color: RV_COLORS.primary }}>
                    {todayCandidates.length}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: RV_COLORS.textMuted }}>
                    候補
                  </p>
                </div>
              </RvCard>
            </Link>
            <Link href="/rendezvous/stories" className="no-underline">
              <RvCard>
                <div className="text-center py-1">
                  <p className="text-lg font-black" style={{ color: RV_COLORS.accent }}>
                    {interestedCount}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: RV_COLORS.textMuted }}>
                    気づき
                  </p>
                </div>
              </RvCard>
            </Link>
            <Link href="/rendezvous/stories" className="no-underline">
              <RvCard>
                <div className="text-center py-1">
                  <p className="text-lg font-black" style={{ color: RV_COLORS.secondary }}>
                    {activeChats.reduce((s, c) => s + c.unreadCount, 0)}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: RV_COLORS.textMuted }}>
                    未読
                  </p>
                </div>
              </RvCard>
            </Link>
          </div>
        </div>
      </FadeInView>

      {/* Zero match warmth */}
      {todayCandidates.length === 0 &&
        interestedUsers.length === 0 &&
        activeChats.length === 0 && (
          <FadeInView delay={0.1}>
            <ZeroMatchWarmth
              avatarName="あなたの分身"
              onStartDailyTopic={() => router.push("/rendezvous/topic")}
              onStartSelfDiscovery={() => router.push("/rendezvous/explore")}
            />
          </FadeInView>
        )}

      {/* AI カウンセラー成長タイムライン */}
      <GrowthTimelineSection />
    </div>
  );
}

/** 成長タイムラインセクション（データ取得込み） */
function GrowthTimelineSection() {
  const [insight, setInsight] = useState<GrowthInsight | null>(null);

  useEffect(() => {
    const key = "rv_growth_loaded";
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
    fetch("/api/rendezvous/counselor/growth", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.insight && data.insight.totalDisconnects >= 1) {
          setInsight(data.insight);
          sessionStorage.setItem(key, "1");
        }
      })
      .catch(() => {});
  }, []);

  if (!insight) return null;

  return (
    <FadeInView delay={0.2}>
      <div className="px-5 pt-4 pb-2">
        <GrowthTimeline insight={insight} />
      </div>
    </FadeInView>
  );
}
