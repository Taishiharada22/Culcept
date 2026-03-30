"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  RV_COLORS,
  RV_CATEGORY_COLORS,
  RvCard,
  RvGlowCard,
  RvBadge,
  RvButton,
} from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import { safeLSSet } from "@/lib/safeLocalStorage";
import AbsenceJournalModal from "@/components/rendezvous/AbsenceJournalModal";
import WelcomeBackOverlay from "@/components/rendezvous/WelcomeBackOverlay";
import AbsenceJournal from "@/components/rendezvous/AbsenceJournal";
import { DailyTopicCard, type DailyTopicData } from "@/components/rendezvous/DailyTopicCard";
import { ProphecyCard, type ProphecyData } from "@/components/rendezvous/ProphecyCard";
import { TonightSessionBanner } from "@/components/rendezvous/TonightSessionBanner";
import { PartnerObservationNudge } from "@/components/rendezvous/PartnerObservationNudge";
import { ZeroMatchWarmth } from "@/components/rendezvous/ZeroMatchWarmth";
import { AvatarDiaryCard } from "@/components/rendezvous/AvatarDiaryCard";
import { DailyResonanceCard } from "@/components/rendezvous/DailyResonanceCard";
import { FirstConnectionCeremony } from "@/components/rendezvous/FirstConnectionCeremony";
import { ProgressiveQuestionCard } from "@/components/rendezvous/ProgressiveQuestionCard";
import { ProfileStrengthMeter } from "@/components/rendezvous/ProfileStrengthMeter";
import type { DailyResonance } from "@/lib/rendezvous/dailyResonance";
import type { AvatarDiaryEntry } from "@/lib/rendezvous/avatarGrowthDiary";
import FeatureIntroduction from "@/components/ui/FeatureIntroduction";
import { RENDEZVOUS_INTRO } from "@/lib/ui/featureIntroConfigs";
import type { ProgressiveQuestion } from "@/lib/rendezvous/progressiveProfile";
import AbsenceCard from "@/components/rendezvous/AbsenceCard";
import type { AbsenceSuggestion } from "@/lib/rendezvous/absenceDesign";
import ActivityPulseOrb from "@/components/rendezvous/ActivityPulseOrb";
import { AvatarEscalationCard } from "@/components/rendezvous/AvatarEscalationCard";
import type { EscalationState } from "@/lib/rendezvous/avatarLiveEngine";
import AvatarJourney from "@/components/rendezvous/AvatarJourney";
import AvatarStoryViewer from "@/components/rendezvous/AvatarStoryViewer";
import type { AvatarStory, ReactionEmoji } from "@/components/rendezvous/AvatarStoryTypes";

// NEW: Tab system imports
import RendezvousHomeTabs, {
  TabContentWrapper,
  type RendezvousHomeTabId,
} from "@/components/rendezvous/home/RendezvousHomeTabs";
import TodayTab from "@/components/rendezvous/home/TodayTab";
import AvatarTab from "@/components/rendezvous/home/AvatarTab";
import ConnectionsTab from "@/components/rendezvous/home/ConnectionsTab";
import DiscoverTab from "@/components/rendezvous/home/DiscoverTab";
import AvatarFloatingWidget from "@/components/rendezvous/AvatarFloatingWidget";
import AvatarMessageToast from "@/components/rendezvous/AvatarMessageToast";
import { getRandomAvatarMessage } from "@/lib/rendezvous/avatarMessages";

// =============================================================================
// Types (unchanged from original)
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

type Story = {
  id: string;
  candidateId: string;
  name: string;
  avatarUrl: string | null;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
  summary: string;
  read: boolean;
  createdAt: string;
};

type AnimaWhisperData = {
  id: string;
  message: string;
  subtext: string | null;
  tone: "warm" | "reflective" | "playful" | "serious" | "celebratory";
};

type ActiveRelationship = {
  candidateId: string;
  name: string;
  avatarUrl: string | null;
  stage: "spark" | "kindling" | "flame" | "glow" | "constellation";
  lastActivityRecent: boolean;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
  unreadCount?: number;
};

type RecommendedAction = {
  id: string;
  icon: string;
  title: string;
  description: string;
  actionPath: string;
};

type FeedItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  category: "romantic" | "friendship" | "cocreation" | "community" | "partner";
  createdAt: string;
};

type HomeData = {
  avatarStatus: AvatarStatus;
  stories: Story[];
  animaWhisper: AnimaWhisperData | null;
  activeRelationships: ActiveRelationship[];
  recommendedAction: RecommendedAction | null;
  feedPreview: FeedItem[];
  interestedUsers?: InterestedUser[];
  todayCandidates?: CandidatePreview[];
  activeChats?: ActiveChat[];
};

// =============================================================================
// RendezvousHome -- Tab-based layout
// =============================================================================

export default function RendezvousHome() {
  const router = useRouter();

  // --- Tab state ---
  const [activeTab, setActiveTab] = useState<RendezvousHomeTabId>("today");

  // --- All original state (unchanged) ---
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyTopic, setDailyTopic] = useState<DailyTopicData | null>(null);
  const [prophecy, setProphecy] = useState<ProphecyData | null>(null);
  const [absenceData, setAbsenceData] = useState<{
    showJournal: boolean;
    journal: any;
    welcomeBack: any;
  } | null>(null);
  const [dailyResonance, setDailyResonance] = useState<DailyResonance | null>(null);
  const [avatarDiary, setAvatarDiary] = useState<AvatarDiaryEntry | null>(null);
  const [showCeremony, setShowCeremony] = useState(false);
  const [ceremonyReasons, setCeremonyReasons] = useState<string[]>([]);
  const [ceremonyCategory, setCeremonyCategory] = useState("romantic");
  const [progressiveQ, setProgressiveQ] = useState<ProgressiveQuestion[]>([]);
  const [absenceSuggestion, setAbsenceSuggestion] = useState<AbsenceSuggestion | null>(null);
  const [escalation, setEscalation] = useState<{ state: EscalationState; candidateName: string; candidateId: string } | null>(null);
  const [avatarStories, setAvatarStories] = useState<AvatarStory[]>([]);
  const [showStoryViewer, setShowStoryViewer] = useState(false);

  // --- NEW: Avatar message toast ---
  const [avatarToast, setAvatarToast] = useState<string | null>(null);

  // --- All original data fetching (unchanged) ---
  useEffect(() => {
    fetch("/api/rendezvous/home", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HomeData | null) => {
        if (d) setData(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/rendezvous/topic/today?category=general", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ok && d.topic) {
          setDailyTopic({
            id: d.topic.id,
            prompt: d.topic.prompt,
            subtext: d.topic.subtext,
            category: d.topic.category,
            myAnswer: d.myAnswer,
            answerCount: d.answerCount,
          });
        }
      })
      .catch(() => {});

    fetch("/api/rendezvous/prophecy/active", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ok && d.prophecy) {
          setProphecy(d.prophecy);
        } else if (d?.ok && !d.prophecy) {
          fetch("/api/rendezvous/prophecy/generate", {
            method: "POST",
            credentials: "include",
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((g) => {
              if (g?.ok && g.prophecy) setProphecy(g.prophecy);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    fetch("/api/rendezvous/daily-resonance", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.resonance) setDailyResonance(d.resonance);
      })
      .catch(() => {});

    fetch("/api/rendezvous/avatar-diary", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.entry) setAvatarDiary(d.entry);
      })
      .catch(() => {});

    fetch("/api/rendezvous/absence-suggestion", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.suggestion) setAbsenceSuggestion(d.suggestion);
      })
      .catch(() => {});

    fetch("/api/rendezvous/escalation", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.escalation?.avatarSuggestion) {
          setEscalation({
            state: d.escalation,
            candidateName: d.candidateName ?? "",
            candidateId: d.candidateId ?? "",
          });
        }
      })
      .catch(() => {});

    fetch("/api/rendezvous/avatar-stories", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.stories?.length > 0) setAvatarStories(d.stories);
      })
      .catch(() => {});

    import("@/lib/rendezvous/progressiveProfile").then(({ getNextQuestions }) => {
      const answeredRaw = localStorage.getItem("rv_progressive_answered_v1");
      const answered: string[] = answeredRaw ? JSON.parse(answeredRaw) : [];
      const recentRaw = localStorage.getItem("rv_progressive_recent_v1");
      const recent: string[] = recentRaw ? JSON.parse(recentRaw) : [];
      const questions = getNextQuestions({
        userId: "current",
        answeredQuestionIds: answered,
        recentlyAnsweredIds: recent,
        date: new Date(),
        maxQuestions: 1,
      });
      setProgressiveQ(questions);
    }).catch(() => {});

    const hasSeenCeremony = localStorage.getItem("rv_first_connection_seen");
    if (!hasSeenCeremony) {
      fetch("/api/rendezvous/home", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const candidates = d?.todayCandidates ?? [];
          if (candidates.length > 0 && !localStorage.getItem("rv_first_connection_seen")) {
            setCeremonyReasons(["深層的な価値観の一致", "自然な会話リズム", "共鳴する世界観"]);
            setCeremonyCategory(candidates[0]?.category ?? "romantic");
            setShowCeremony(true);
            safeLSSet("rv_first_connection_seen", "1");
          }
        })
        .catch(() => {});
    }

    const lastVisit = localStorage.getItem("culcept_last_rendezvous_visit");
    const journalUrl = lastVisit
      ? `/api/rendezvous/absence-journal?lastVisit=${encodeURIComponent(lastVisit)}`
      : "/api/rendezvous/absence-journal";
    fetch(journalUrl, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setAbsenceData(d);
        safeLSSet(
          "culcept_last_rendezvous_visit",
          new Date().toISOString()
        );
      })
      .catch(() => {});
  }, []);

  // --- NEW: Show avatar toast after a delay ---
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => {
      const conversations = data.avatarStatus?.activeConversations ?? 0;
      const state = conversations > 0 ? "contact_made" : "exploring";
      setAvatarToast(getRandomAvatarMessage(state));
    }, 8000);
    return () => clearTimeout(timer);
  }, [data]);

  // -- Loading --
  if (loading) {
    return (
      <div className="flex flex-col gap-5 px-5 py-8 pb-28">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl animate-pulse"
            style={{ background: RV_COLORS.surfaceMuted }}
          />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-5 pb-28">
        <p className="text-sm" style={{ color: RV_COLORS.textMuted }}>
          データの読み込みに失敗しました
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 text-xs underline"
          style={{ color: RV_COLORS.primary }}
        >
          再読み込み
        </button>
      </div>
    );
  }

  const {
    interestedUsers = [],
    todayCandidates = [],
    activeChats = [],
    activeRelationships = [],
    stories = [],
    avatarStatus,
    animaWhisper,
    recommendedAction,
    feedPreview = [],
  } = data;

  const totalUnread = activeChats.reduce((s, c) => s + c.unreadCount, 0);

  return (
    <div className="flex flex-col pb-28" style={{ background: RV_COLORS.base }}>
      {/* ================================================================= */}
      {/* Global overlays (always visible, not tab-specific)               */}
      {/* ================================================================= */}
      <AbsenceJournalModal />

      {absenceData?.showJournal && (
        <>
          {absenceData.welcomeBack && (
            <WelcomeBackOverlay
              greeting={absenceData.welcomeBack.greeting}
              journalSummary={absenceData.welcomeBack.journalSummary}
              animationType={absenceData.welcomeBack.animationType}
              onComplete={() =>
                setAbsenceData((p) =>
                  p ? { ...p, showJournal: false } : p
                )
              }
            />
          )}
          {absenceData.journal && (
            <FadeInView delay={0}>
              <AbsenceJournal
                journal={absenceData.journal}
                onClose={() =>
                  setAbsenceData((p) =>
                    p ? { ...p, journal: null } : p
                  )
                }
              />
            </FadeInView>
          )}
        </>
      )}

      {/* ================================================================= */}
      {/* Tab Navigation                                                    */}
      {/* ================================================================= */}
      <RendezvousHomeTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        unreadCount={totalUnread}
      />

      {/* ================================================================= */}
      {/* Tab Content                                                       */}
      {/* ================================================================= */}
      <TabContentWrapper tabId={activeTab}>
        {activeTab === "today" && (
          <TodayTab
            interestedUsers={interestedUsers}
            todayCandidates={todayCandidates}
            activeChats={activeChats}
            avatarStatus={avatarStatus}
            animaWhisper={animaWhisper}
            dailyTopic={dailyTopic}
            prophecy={prophecy}
            dailyResonance={dailyResonance}
            absenceSuggestion={absenceSuggestion}
            escalation={escalation}
            onDismissAbsence={() => setAbsenceSuggestion(null)}
            onAcceptAbsence={() => {
              if (absenceSuggestion) {
                fetch("/api/rendezvous/absence-accept", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ hours: absenceSuggestion.suggestedHours }),
                }).catch(() => {});
              }
              setAbsenceSuggestion(null);
            }}
            onCustomizeAbsence={(hours) => {
              fetch("/api/rendezvous/absence-accept", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ hours }),
              }).catch(() => {});
              setAbsenceSuggestion(null);
            }}
            onDismissEscalation={() => {
              fetch("/api/rendezvous/escalation/postpone", {
                method: "POST",
                credentials: "include",
              }).then(() => setEscalation(null)).catch(() => {});
            }}
            onArchiveEscalation={() => {
              fetch("/api/rendezvous/escalation/archive", {
                method: "POST",
                credentials: "include",
              }).then(() => setEscalation(null)).catch(() => {});
            }}
          />
        )}

        {activeTab === "avatar" && (
          <AvatarTab
            avatarStatus={avatarStatus}
            avatarDiary={avatarDiary}
          />
        )}

        {activeTab === "connections" && (
          <ConnectionsTab
            activeChats={activeChats}
            activeRelationships={activeRelationships}
            stories={stories}
            todayCandidates={todayCandidates}
            avatarStories={avatarStories}
          />
        )}

        {activeTab === "discover" && (
          <DiscoverTab
            feedPreview={feedPreview}
            recommendedAction={recommendedAction}
          />
        )}
      </TabContentWrapper>

      {/* ================================================================= */}
      {/* Global elements (always visible across all tabs)                  */}
      {/* ================================================================= */}

      {/* Avatar floating widget */}
      <AvatarFloatingWidget
        activeConversations={avatarStatus.activeConversations}
        onTap={() => setActiveTab("avatar")}
      />

      {/* Avatar message toast */}
      <AvatarMessageToast
        message={avatarToast}
        onDismiss={() => setAvatarToast(null)}
        onTap={() => {
          setAvatarToast(null);
          setActiveTab("avatar");
        }}
      />

      {/* First connection ceremony */}
      {showCeremony && (
        <FirstConnectionCeremony
          reasons={ceremonyReasons}
          category={ceremonyCategory}
          onComplete={() => setShowCeremony(false)}
        />
      )}

      {/* Feature introduction */}
      <FeatureIntroduction
        {...RENDEZVOUS_INTRO}
        onComplete={() => {}}
      />

      {/* Bottom spacing for fixed tab bar */}
      <div className="h-24" />
    </div>
  );
}
