"use client";

import { safeLSSet } from "@/lib/safeLocalStorage";

/**
 * RendezvousDetailClient — Three Act Progressive Disclosure
 *
 * Act 1: "Spark" (第一印象) — photo-first, name, sync%, core phrase, CTA
 * Act 2: "Bridge" (架け橋) — 4-context scores, match summary, reasons, avatar judgment
 * Act 3: "Depth" (深層) — deep compatibility, observatory, relational intelligence
 *
 * Horizontal swipe between acts with RvStoryProgressBar navigation.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import type { RendezvousDetailDTO, RendezvousCategory } from "@/lib/rendezvous/types";
import { CONTEXT_COLORS, CONTEXT_LABELS } from "@/lib/rendezvous/questions/types";
import type { ContextType } from "@/lib/rendezvous/questions/types";
import RendezvousStateBadge from "@/components/rendezvous/RendezvousStateBadge";
import RendezvousContextBadge from "@/components/rendezvous/RendezvousContextBadge";
import RendezvousDetailActions from "@/components/rendezvous/RendezvousDetailActions";
import GraduationTrigger from "@/components/rendezvous/GraduationTrigger";
import type { RevealLevel } from "@/components/rendezvous/PhotoCarousel";
import type { PhotoSlot } from "@/components/rendezvous/PhotoPreview";
import type { MetamorphosisSignal } from "@/lib/rendezvous/metamorphosis";
import DetailSkeleton from "@/components/rendezvous/skeletons/DetailSkeleton";
import type { Crystal } from "@/lib/rendezvous/memoryCrystal";
import { FadeInView } from "@/components/ui/glassmorphism-design";
import PreBriefingCard from "@/components/rendezvous/counselor/PreBriefingCard";
import type { PreConnectionBriefing } from "@/lib/rendezvous/counselor/types";
import {
  RV_COLORS,
  RvCard,
  RvGlowCard,
  RvBadge,
  RvSectionTitle,
  RvStoryProgressBar,
  RvProgressRing,
  RvAnimaText,
} from "@/components/ui/rendezvous-design";

// Dynamic imports for heavy components (code splitting)
const loadingPlaceholder = () => <DetailSkeleton />;
const PhotoCarousel = dynamic(() => import("@/components/rendezvous/PhotoCarousel"), { ssr: false, loading: loadingPlaceholder });
const CompatibilityInsightCard = dynamic(() => import("@/components/rendezvous/CompatibilityInsightCard"), { ssr: false, loading: loadingPlaceholder });
const ObservatoryInsightsCard = dynamic(() => import("@/components/rendezvous/ObservatoryInsightsCard"), { ssr: false, loading: loadingPlaceholder });
const JourneyTimelineSection = dynamic(() => import("@/components/rendezvous/JourneyTimelineSection"), { ssr: false, loading: loadingPlaceholder });
const GrowthNudgeSection = dynamic(() => import("@/components/rendezvous/GrowthNudgeSection"), { ssr: false, loading: loadingPlaceholder });
const EncounterTheatre = dynamic(() => import("@/components/rendezvous/EncounterTheatre"), { ssr: false, loading: loadingPlaceholder });
const OrbiterHeadline = dynamic(() => import("@/components/orbiter/OrbiterHeadline"), { ssr: false, loading: loadingPlaceholder });
const SelfStateAlert = dynamic(() => import("@/components/orbiter/SelfStateAlert"), { ssr: false, loading: loadingPlaceholder });
const FrictionForecastSection = dynamic(() => import("@/components/orbiter/FrictionForecastSection"), { ssr: false, loading: loadingPlaceholder });
const SceneRecommendSection = dynamic(() => import("@/components/orbiter/SceneRecommendSection"), { ssr: false, loading: loadingPlaceholder });
const TrajectorySection = dynamic(() => import("@/components/orbiter/TrajectorySection"), { ssr: false, loading: loadingPlaceholder });
const DualOutfitSection = dynamic(() => import("@/components/orbiter/DualOutfitSection"), { ssr: false, loading: loadingPlaceholder });
const MetamorphosisWhisper = dynamic(() => import("@/components/rendezvous/MetamorphosisWhisper"), { ssr: false });
const RelationshipTemperature = dynamic(() => import("@/components/rendezvous/RelationshipTemperature"), { ssr: false });
const CrystalGallery = dynamic(() => import("@/components/rendezvous/CrystalGallery"), { ssr: false, loading: loadingPlaceholder });
const AvatarContactAnimation = dynamic(() => import("@/components/rendezvous/AvatarContactAnimation"), { ssr: false });
const BehaviorContrastMap = dynamic(() => import("@/components/rendezvous/BehaviorContrastMap"), { ssr: false });
const CatalystCard = dynamic(() => import("@/components/rendezvous/CatalystCard"), { ssr: false });
const GenomeCardPreview = dynamic(() => import("@/components/rendezvous/GenomeCardPreview"), { ssr: false });
const CompatibilityRadar = dynamic(() => import("@/components/rendezvous/CompatibilityRadar"), { ssr: false });
const AvatarConversationTimeline = dynamic(() => import("@/components/rendezvous/AvatarConversationTimeline"), { ssr: false });
const PhotoPreview = dynamic(() => import("@/components/rendezvous/PhotoPreview"), { ssr: false, loading: loadingPlaceholder });
const PhotoUnlockAnimation = dynamic(() => import("@/components/rendezvous/PhotoUnlockAnimation"), { ssr: false });
const MutualReveal = dynamic(() => import("@/components/rendezvous/chat/MutualReveal"), { ssr: false });
const PartnerDetailSection = dynamic(() => import("@/components/rendezvous/partner/PartnerDetailSection"), { ssr: false, loading: loadingPlaceholder });

const CATEGORY_COLOR: Record<RendezvousCategory, string> = {
  romantic: "#EC4899",
  friendship: "#6366F1",
  cocreation: "#F59E0B",
  community: "#8B5CF6",
  partner: "#D4776B",
};

// Act labels for navigation
const ACT_LABELS = ["印象", "架け橋", "深層"] as const;
const ACT_COUNT = 3;

// Swipe animation variants
const actVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
};

type Props = {
  detail: RendezvousDetailDTO;
};

export default function RendezvousDetailClient({ detail }: Props) {
  const catColor = CATEGORY_COLOR[detail.category] ?? "#6366F1";
  const hasLens = !!detail.contextLens || !!detail.contextLensDetail;
  const lens = detail.contextLensDetail ?? detail.contextLens;
  const bestCtx = lens?.bestContext;
  const bestCtxColor = bestCtx ? CONTEXT_COLORS[bestCtx] : catColor;
  // Show insight card for mutual_liked/chat_opened states
  const showInsight = detail.candidateState === "mutual_liked" || detail.candidateState === "chat_opened";

  // Photo blur progression based on relationship state
  const revealLevel: RevealLevel = (() => {
    switch (detail.candidateState) {
      case "candidate_generated":
      case "delivered":
        return "heavy";
      case "a_liked":
      case "b_liked":
        return "medium";
      default:
        return "clear";
    }
  })();

  // --- Act navigation ---
  const [[currentAct, swipeDirection], setActState] = useState([0, 0]);
  const navigateAct = useCallback((newAct: number) => {
    if (newAct < 0 || newAct >= ACT_COUNT) return;
    setActState([newAct, newAct > currentAct ? 1 : -1]);
  }, [currentAct]);

  // Swipe gesture tracking
  const dragStartX = useRef(0);

  // --- Counselor briefing ---
  const [briefing, setBriefing] = useState<PreConnectionBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const showBriefingSection = detail.candidateState === "mutual_liked" || detail.candidateState === "chat_opened";

  useEffect(() => {
    if (!showBriefingSection) return;
    const key = `briefing_loaded_${detail.candidateId}`;
    if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
    setBriefingLoading(true);
    fetch(`/api/rendezvous/counselor/briefing?candidateId=${detail.candidateId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.briefing) {
          setBriefing(data.briefing);
          sessionStorage.setItem(key, "1");
        }
      })
      .catch(() => {})
      .finally(() => setBriefingLoading(false));
  }, [showBriefingSection, detail.candidateId]);

  // AvatarContactAnimation: show before EncounterTheatre for first crossing
  const contactKey = `rv_contact_${detail.candidateId}`;
  const [showContactAnimation, setShowContactAnimation] = useState(() => {
    if (typeof window === "undefined") return false;
    if (detail.candidateState !== "delivered" && detail.candidateState !== "candidate_generated") return false;
    return !localStorage.getItem(contactKey);
  });

  // EncounterTheatre: show on first view of unseen candidates
  const theatreKey = `rv_theatre_${detail.candidateId}`;
  const [showTheatre, setShowTheatre] = useState(() => {
    if (typeof window === "undefined") return false;
    if (detail.candidateState !== "delivered" && detail.candidateState !== "candidate_generated") return false;
    return !localStorage.getItem(theatreKey);
  });

  // Memory crystals
  const [crystals, setCrystals] = useState<Crystal[]>([]);
  useEffect(() => {
    const isChatLike =
      detail.candidateState === "mutual_liked" ||
      detail.candidateState === "chat_opened";
    if (!isChatLike) return;
    fetch(`/api/rendezvous/${detail.candidateId}/crystals`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data?.crystals) setCrystals(data.crystals);
      })
      .catch(() => {});
  }, [detail.candidateId, detail.candidateState]);

  // BehaviorContrastMap + CatalystCard data
  const [contrastData, setContrastData] = useState<any[] | null>(null);
  const [catalystData, setCatalystData] = useState<any | null>(null);

  useEffect(() => {
    if (!showInsight) return;
    fetch(`/api/rendezvous/${detail.candidateId}/behavior-contrast`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.contrasts) setContrastData(d.contrasts); })
      .catch(() => {});
    fetch(`/api/rendezvous/${detail.candidateId}/catalyst`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.potential) setCatalystData(d.potential); })
      .catch(() => {});
  }, [detail.candidateId, showInsight]);

  // Metamorphosis signals
  const [metamorphosisSignals, setMetamorphosisSignals] = useState<
    (MetamorphosisSignal & { id: string })[]
  >([]);
  const isChatState =
    detail.candidateState === "mutual_liked" ||
    detail.candidateState === "chat_opened";

  useEffect(() => {
    if (!isChatState) return;
    fetch(`/api/rendezvous/${detail.candidateId}/metamorphosis`)
      .then((r) => r.json())
      .then((data) => {
        if (data.signals && data.signals.length > 0) {
          setMetamorphosisSignals(data.signals);
        }
      })
      .catch(() => {});
  }, [detail.candidateId, isChatState]);

  // Phase 2: Mutual photo reveal state
  const [showMutualReveal, setShowMutualReveal] = useState(false);
  const [revealInitialState, setRevealInitialState] = useState<
    "idle" | "requesting" | "partner_requested" | "revealed"
  >("idle");
  const [partnerRevealRequested, setPartnerRevealRequested] = useState(false);

  useEffect(() => {
    if (!isChatState) return;
    fetch(`/api/rendezvous/${detail.candidateId}/photos?check=1`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        if (d.status === "revealed") {
          setRevealInitialState("revealed");
        } else if (d.status === "partner_requested") {
          setPartnerRevealRequested(true);
          setRevealInitialState("partner_requested");
        } else if (d.status === "requesting") {
          setRevealInitialState("requesting");
        }
      })
      .catch(() => {});
  }, [detail.candidateId, isChatState]);

  // Photo unlock detection (Phase 1 first view)
  const unlockKey = `rv_photo_unlock_${detail.candidateId}`;
  const isNewPhotoUnlock = (() => {
    if (typeof window === "undefined") return false;
    if (revealLevel !== "clear") return false;
    if (localStorage.getItem(unlockKey)) return false;
    return true;
  })();

  useEffect(() => {
    if (isNewPhotoUnlock) {
      safeLSSet(unlockKey, "1");
    }
  }, [isNewPhotoUnlock, unlockKey]);

  const handleAcknowledgeMetamorphosis = (signalId: string) => {
    fetch(`/api/rendezvous/${detail.candidateId}/metamorphosis`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signalId }),
    }).catch(() => {});
    setMetamorphosisSignals((prev) => prev.filter((s) => s.id !== signalId));
  };

  // Orbiter: view duration beacon
  const viewStartRef = useRef(Date.now());
  useEffect(() => {
    const sendBeacon = () => {
      const durationMs = Date.now() - viewStartRef.current;
      if (durationMs > 2000) {
        navigator.sendBeacon(
          "/api/orbiter/signal",
          new Blob([JSON.stringify({
            candidateId: detail.candidateId,
            signalType: "detail_view_end",
            payload: { durationMs },
          })], { type: "application/json" }),
        );
      }
    };
    window.addEventListener("pagehide", sendBeacon);
    return () => {
      window.removeEventListener("pagehide", sendBeacon);
      sendBeacon();
    };
  }, [detail.candidateId]);

  // -----------------------------------------------------------------------
  // Pre-detail overlays (AvatarContactAnimation, EncounterTheatre)
  // -----------------------------------------------------------------------
  if (showContactAnimation) {
    return (
      <AvatarContactAnimation
        category={detail.category}
        crossingOrigin={detail.reasons?.[0]}
        onComplete={() => {
          safeLSSet(contactKey, "1");
          setShowContactAnimation(false);
        }}
      />
    );
  }

  if (showTheatre) {
    return (
      <EncounterTheatre
        category={detail.category}
        triggerType="community_overlap"
        syncPercent={detail.syncPercent ?? 50}
        counterpartName={detail.counterpart?.displayName ?? ""}
        label={detail.counterpart?.displayName ?? "新しい出会い"}
        narrativeText={detail.reasons?.[0] ?? "あなたの星座が交わる瞬間"}
        reasonCodes={detail.reasons ?? []}
        onComplete={() => {
          safeLSSet(theatreKey, "1");
          setShowTheatre(false);
        }}
      />
    );
  }

  // -----------------------------------------------------------------------
  // Main three-act layout
  // -----------------------------------------------------------------------
  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: RV_COLORS.base,
        color: RV_COLORS.text,
        fontFamily: "'Noto Sans JP',-apple-system,sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Fixed top bar: back + story progress + act labels */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          paddingTop: "max(12px, env(safe-area-inset-top))",
          backgroundColor: "rgba(250,250,248,0.88)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 20px" }}>
          {/* Back button row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <Link
              href="/rendezvous"
              style={{
                fontSize: 13,
                color: RV_COLORS.textMuted,
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ fontSize: 16 }}>&#x2039;</span>
              戻る
            </Link>
            <span style={{ flex: 1 }} />
            <RendezvousStateBadge state={detail.state} />
          </div>

          {/* Story progress bar */}
          <RvStoryProgressBar
            total={ACT_COUNT}
            current={currentAct}
            progress={1}
            className="mb-1"
          />

          {/* Act tab labels */}
          <div style={{ display: "flex", gap: 0, paddingBottom: 8 }}>
            {ACT_LABELS.map((label, i) => (
              <button
                key={label}
                onClick={() => navigateAct(i)}
                style={{
                  flex: 1,
                  padding: "6px 0",
                  fontSize: 11,
                  fontWeight: i === currentAct ? 700 : 500,
                  color: i === currentAct ? RV_COLORS.primary : RV_COLORS.textMuted,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  transition: "color 0.2s",
                  letterSpacing: "0.05em",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Spacer for fixed header */}
      <div style={{ height: "max(100px, calc(env(safe-area-inset-top) + 88px))" }} />

      {/* Act content area with swipe */}
      <div style={{ maxWidth: 600, margin: "0 auto", position: "relative" }}>
        <AnimatePresence initial={false} custom={swipeDirection} mode="popLayout">
          <motion.div
            key={currentAct}
            custom={swipeDirection}
            variants={actVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30, mass: 0.8 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragStart={(_, info) => { dragStartX.current = info.point.x; }}
            onDragEnd={(_, info) => {
              const dx = info.offset.x;
              const vx = info.velocity.x;
              if (dx < -60 || vx < -500) {
                navigateAct(currentAct + 1);
              } else if (dx > 60 || vx > 500) {
                navigateAct(currentAct - 1);
              }
            }}
            style={{ padding: "0 20px", minHeight: "calc(100dvh - 200px)" }}
          >
            {currentAct === 0 && (
              <ActSpark
                detail={detail}
                catColor={catColor}
                bestCtxColor={bestCtxColor}
                bestCtx={bestCtx}
                revealLevel={revealLevel}
                isNewPhotoUnlock={isNewPhotoUnlock}
                partnerRevealRequested={partnerRevealRequested}
                setRevealInitialState={setRevealInitialState}
                setShowMutualReveal={setShowMutualReveal}
              />
            )}
            {currentAct === 1 && (
              <ActBridge
                detail={detail}
                hasLens={hasLens}
                lens={lens}
                bestCtx={bestCtx}
                bestCtxColor={bestCtxColor}
                catColor={catColor}
              />
            )}
            {currentAct === 2 && (
              <ActDepth
                detail={detail}
                showInsight={showInsight}
                isChatState={isChatState}
                bestCtxColor={bestCtxColor}
                contrastData={contrastData}
                catalystData={catalystData}
                crystals={crystals}
                metamorphosisSignals={metamorphosisSignals}
                revealInitialState={revealInitialState}
                setRevealInitialState={setRevealInitialState}
                partnerRevealRequested={partnerRevealRequested}
                showMutualReveal={showMutualReveal}
                setShowMutualReveal={setShowMutualReveal}
                briefing={briefing}
                showBriefingSection={showBriefingSection}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sticky bottom actions */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "16px 20px",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          background: `linear-gradient(to top, ${RV_COLORS.base} 60%, rgba(250,250,248,0))`,
          zIndex: 30,
        }}
      >
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          {/* Next action nudge */}
          <p
            style={{
              fontSize: 11,
              color: RV_COLORS.textSub,
              textAlign: "center",
              marginBottom: 8,
              fontWeight: 500,
              lineHeight: 1.5,
            }}
          >
            {getNextActionNudge(detail.candidateState, detail.syncPercent ?? 0)}
          </p>
          {detail.candidateState === "mutual_liked" ||
          detail.candidateState === "chat_opened" ? (
            <div>
              <Link
                href={`/rendezvous/${detail.candidateId}?chat=1`}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "14px 0",
                  borderRadius: 12,
                  border: "none",
                  textAlign: "center",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  background: RV_COLORS.gradient,
                  boxShadow: `0 4px 20px ${RV_COLORS.primaryGlow}`,
                  letterSpacing: 0.5,
                }}
              >
                会話へ
              </Link>
              {/* Conversation starters */}
              {detail.reasons.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
                  {getConversationStarters(detail.reasons, detail.counterpart.displayName).map((starter, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        // Copy to clipboard for easy paste
                        navigator.clipboard?.writeText(starter).catch(() => {});
                      }}
                      style={{
                        flexShrink: 0,
                        padding: "6px 12px",
                        borderRadius: 20,
                        border: `1px solid ${RV_COLORS.border}`,
                        background: RV_COLORS.surface,
                        color: RV_COLORS.textSub,
                        fontSize: 11,
                        fontWeight: 500,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        lineHeight: 1.4,
                      }}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <RendezvousDetailActions
              candidateId={detail.candidateId}
              actions={detail.actions}
            />
          )}
        </div>
      </div>

      {/* Metamorphosis Whisper overlay */}
      {metamorphosisSignals.length > 0 && (
        <MetamorphosisWhisper
          signal={metamorphosisSignals[0]}
          onAcknowledge={() =>
            handleAcknowledgeMetamorphosis(metamorphosisSignals[0].id)
          }
        />
      )}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

/** 状態に応じた推奨アクションのナッジ */
function getNextActionNudge(state: string, syncPercent: number): string {
  switch (state) {
    case "mutual_liked":
      return "お互いに興味を持っています。最初のメッセージを送ってみましょう。";
    case "chat_opened":
      return "会話が始まっています。続きを見てみましょう。";
    case "delivered":
    case "candidate_generated":
      if (syncPercent >= 75) return "相性の高い候補です。プロフィールを確認してみましょう。";
      if (syncPercent >= 55) return "興味深い接点があります。詳細を見てから判断してみましょう。";
      return "まずはプロフィールをゆっくり見てみましょう。";
    case "a_liked":
      return "あなたは興味を示しました。相手の返答を待ちましょう。";
    case "b_liked":
      if (syncPercent >= 70) return "相手があなたに興味を持っています。相性も高いです。";
      return "相手があなたに興味を持っています。";
    default:
      return "";
  }
}

/** マッチ理由から会話スターターを生成 */
function getConversationStarters(reasons: string[], name: string): string[] {
  const starters: string[] = [];

  // Reason-based starters (derive from first 2 reasons)
  if (reasons[0]) {
    // Extract topic keywords and create a question
    if (reasons[0].includes("旅行") || reasons[0].includes("冒険")) {
      starters.push("最近どこか旅行に行きましたか？");
    } else if (reasons[0].includes("価値観") || reasons[0].includes("将来")) {
      starters.push("将来のことってよく考えるほうですか？");
    } else if (reasons[0].includes("コミュニケーション") || reasons[0].includes("対話")) {
      starters.push("普段はどんな話をするのが好きですか？");
    } else {
      starters.push("プロフィールを見て気になりました。よろしくお願いします！");
    }
  }

  // Generic good starters
  starters.push("共通点が多くて驚きました！");
  starters.push(`${name}さんの雰囲気がすごく素敵ですね`);

  return starters.slice(0, 3);
}

/** SYNC% を意味あるラベルに変換 */
function getSyncLabel(percent: number): string {
  if (percent >= 90) return "驚くほど深く共鳴しています";
  if (percent >= 80) return "価値観の根幹が一致しています";
  if (percent >= 70) return "多くの側面で相性が良いです";
  if (percent >= 60) return "興味深い共通点があります";
  if (percent >= 50) return "新しい発見がありそうです";
  return "まだ見えていない可能性があります";
}

/** 理由テキストからどの回答が効いたかのヒントを生成 */
function getReasonHint(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("価値観") || r.includes("考え方")) return "あなたの回答: 価値観の一致";
  if (r.includes("将来") || r.includes("設計") || r.includes("ライフ")) return "あなたの回答: 将来設計の方向性";
  if (r.includes("コミュニケーション") || r.includes("対話") || r.includes("会話")) return "あなたの回答: コミュニケーションスタイル";
  if (r.includes("安定") || r.includes("堅実") || r.includes("金銭")) return "あなたの回答: 安定志向";
  if (r.includes("成長") || r.includes("挑戦") || r.includes("キャリア")) return "あなたの回答: 自己成長への姿勢";
  if (r.includes("家族") || r.includes("子ども") || r.includes("親")) return "あなたの回答: 家族観";
  if (r.includes("趣味") || r.includes("文化") || r.includes("芸術")) return "あなたの回答: 文化的関心";
  if (r.includes("健康") || r.includes("習慣") || r.includes("生活")) return "あなたの回答: 生活習慣";
  if (r.includes("相補") || r.includes("補完")) return "異なる強みが補い合います";
  return "観測データに基づく分析";
}

/** 今日の注目候補かどうか（SYNC%上位 = spotlight） */
function isTodaySpotlight(syncPercent: number): boolean {
  // Top candidates (75%+) get the spotlight badge
  // Combined with day-based variation so it feels dynamic
  const dayMod = new Date().getDate() % 3;
  if (dayMod === 0) return syncPercent >= 75;
  if (dayMod === 1) return syncPercent >= 78;
  return syncPercent >= 72;
}

/** 観測精度 — 状態が進むほど精度が上がる演出 */
function getObservationAccuracy(syncPercent: number, state: string): number {
  const base = Math.min(60, Math.round(syncPercent * 0.6));
  const stateBonus: Record<string, number> = {
    candidate_generated: 0,
    delivered: 5,
    a_liked: 12,
    b_liked: 12,
    mutual_liked: 22,
    chat_opened: 30,
  };
  return Math.min(95, base + (stateBonus[state] ?? 0));
}

/** 分身の一言コメント — 状態×相性で変化 */
function getAvatarComment(syncPercent: number, state: string, reasons: string[]): string {
  if (state === "mutual_liked" || state === "chat_opened") {
    return "この繋がりには可能性を感じています。大切にしてください。";
  }
  if (state === "b_liked") {
    if (syncPercent >= 70) return "相手の関心とあなたの特性が重なる部分があります。確認してみてください。";
    return "相手があなたに興味を持っています。直感を信じてみてください。";
  }
  if (syncPercent >= 80) return "この人はあなたに合う可能性が高いと感じています。";
  if (syncPercent >= 65) return "いくつかの重要な接点を見つけました。";
  if (syncPercent >= 50) return "まだ判断材料が少ないですが、興味深い候補です。";
  return "もう少し情報が集まると、より正確な判断ができます。";
}

function getMatchNarrative(syncPercent: number, bestCtx?: string): string {
  const ctx = bestCtx === "romance" ? "恋愛"
    : bestCtx === "friend" ? "友人"
    : bestCtx === "orbiter" ? "内面"
    : bestCtx === "cocreation" ? "共創" : "";

  if (syncPercent >= 85) return `${ctx ? ctx + "の文脈で" : ""}深い共鳴が見つかりました。`;
  if (syncPercent >= 70) return `${ctx ? ctx + "として" : ""}良い相性です。その理由を見てみましょう。`;
  if (syncPercent >= 55) return `いくつかの興味深い接点があります。`;
  return "まだ発見段階ですが、可能性は開かれています。";
}

// =============================================================================
// Act 1: "Spark" (第一印象)
// =============================================================================

function ActSpark({
  detail,
  catColor,
  bestCtxColor,
  bestCtx,
  revealLevel,
  isNewPhotoUnlock,
  partnerRevealRequested,
  setRevealInitialState,
  setShowMutualReveal,
}: {
  detail: RendezvousDetailDTO;
  catColor: string;
  bestCtxColor: string;
  bestCtx: ContextType | undefined;
  revealLevel: RevealLevel;
  isNewPhotoUnlock: boolean;
  partnerRevealRequested: boolean;
  setRevealInitialState: (s: "idle" | "requesting" | "partner_requested" | "revealed") => void;
  setShowMutualReveal: (v: boolean) => void;
}) {
  return (
    <div style={{ paddingBottom: 120 }}>
      {/* Full-bleed photo area */}
      <FadeInView delay={0}>
        <div
          style={{
            position: "relative",
            width: "100%",
            borderRadius: 20,
            overflow: "hidden",
            marginBottom: 24,
          }}
        >
          {(detail as any).photos && (detail as any).photos.length > 0 ? (
            <PhotoUnlockAnimation isNewUnlock={isNewPhotoUnlock}>
              <PhotoPreview
                photos={((detail as any).photos ?? []) as PhotoSlot[]}
                currentDisclosureLevel={
                  revealLevel === "heavy" ? 0 : revealLevel === "medium" ? 0 : 1
                }
                partnerRevealRequested={partnerRevealRequested}
                onRequestReveal={() => {
                  setRevealInitialState("partner_requested");
                  setShowMutualReveal(true);
                }}
              />
            </PhotoUnlockAnimation>
          ) : (
            <PhotoCarousel
              userId={detail.counterpartUserId}
              fallbackAvatarUrl={detail.counterpart.avatarUrl}
              fallbackName={detail.counterpart.displayName}
              height={400}
              revealLevel={revealLevel}
            />
          )}

          {/* Gradient overlay at bottom of photo */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 120,
              background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)",
              borderRadius: "0 0 20px 20px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              padding: "0 20px 16px",
            }}
          >
            {/* Name + age + area */}
            <h1
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "#FFFFFF",
                margin: 0,
                lineHeight: 1.3,
                textShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }}
            >
              {detail.counterpart.displayName}
            </h1>

            {/* Badge row on photo */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <RvBadge category={detail.category as any} />
              {bestCtx && <RendezvousContextBadge context={bestCtx} size="md" />}
            </div>
          </div>
        </div>
      </FadeInView>

      {/* Today's spotlight badge */}
      {isTodaySpotlight(detail.syncPercent ?? 0) && (
        <FadeInView delay={0.12}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: RV_COLORS.primary,
                padding: "4px 12px",
                borderRadius: 20,
                background: `${RV_COLORS.primary}08`,
                border: `1px solid ${RV_COLORS.primary}15`,
                letterSpacing: "0.05em",
              }}
            >
              ★ 今日の注目候補
            </span>
          </div>
        </FadeInView>
      )}

      {/* Core phrase (共鳴フレーズ) */}
      {detail.corePhrase && (
        <FadeInView delay={0.15}>
          <div style={{ textAlign: "center", marginBottom: 28, padding: "0 8px" }}>
            <RvAnimaText
              text={detail.corePhrase}
              reveal
              revealSpeed={40}
              className="text-[15px] leading-relaxed"
            />
          </div>
        </FadeInView>
      )}

      {/* Large centered sync ring */}
      <FadeInView delay={0.25}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
          <RvProgressRing
            progress={(detail.syncPercent ?? 0) / 100}
            size={96}
            strokeWidth={5}
            color={bestCtxColor}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: bestCtxColor,
                  fontFamily: "'JetBrains Mono','SF Mono',monospace",
                  lineHeight: 1,
                }}
              >
                {detail.syncPercent}%
              </div>
            </div>
          </RvProgressRing>
          <p
            style={{
              marginTop: 10,
              fontSize: 13,
              fontWeight: 600,
              color: bestCtxColor,
              textAlign: "center",
              fontFamily: '"Noto Serif JP", serif',
            }}
          >
            {getSyncLabel(detail.syncPercent ?? 0)}
          </p>
        </div>
      </FadeInView>

      {/* Understanding depth indicator */}
      <FadeInView delay={0.28}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 10, color: RV_COLORS.textMuted, letterSpacing: "0.04em" }}>
            観測精度
          </span>
          <div style={{ width: 60, height: 3, borderRadius: 2, background: RV_COLORS.surfaceMuted, overflow: "hidden" }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${getObservationAccuracy(detail.syncPercent ?? 0, detail.candidateState)}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
              style={{ height: "100%", borderRadius: 2, background: bestCtxColor }}
            />
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: bestCtxColor,
              fontFamily: "'JetBrains Mono','SF Mono',monospace",
            }}
          >
            {getObservationAccuracy(detail.syncPercent ?? 0, detail.candidateState)}%
          </span>
        </div>
      </FadeInView>

      {/* One-line label */}
      <FadeInView delay={0.3}>
        <p
          style={{
            textAlign: "center",
            fontSize: 13,
            color: RV_COLORS.textSub,
            fontWeight: 500,
            margin: 0,
          }}
        >
          {detail.label}
        </p>
      </FadeInView>

      {/* Swipe hint */}
      <FadeInView delay={0.5}>
        <div
          style={{
            textAlign: "center",
            marginTop: 32,
            fontSize: 10,
            color: RV_COLORS.textMuted,
            letterSpacing: "0.1em",
          }}
        >
          スワイプして詳細を見る →
        </div>
      </FadeInView>
    </div>
  );
}

// =============================================================================
// Act 2: "Bridge" (架け橋)
// =============================================================================

function ActBridge({
  detail,
  hasLens,
  lens,
  bestCtx,
  bestCtxColor,
  catColor,
}: {
  detail: RendezvousDetailDTO;
  hasLens: boolean;
  lens: any;
  bestCtx: ContextType | undefined;
  bestCtxColor: string;
  catColor: string;
}) {
  return (
    <div style={{ paddingBottom: 120 }}>
      {/* Narrative opener */}
      <FadeInView delay={0}>
        <p
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: RV_COLORS.text,
            lineHeight: 1.8,
            marginBottom: 20,
            fontFamily: '"Noto Serif JP", serif',
            textAlign: "center",
          }}
        >
          {getMatchNarrative(detail.syncPercent ?? 0, bestCtx)}
        </p>
      </FadeInView>

      {/* 4-context score bars */}
      {hasLens && lens && (
        <FadeInView delay={0}>
          <RvCard className="mb-4" elevated>
            <RvSectionTitle accent={bestCtxColor} className="mb-4">
              文脈別スコア
            </RvSectionTitle>

            {/* Compact horizontal bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {(["friend", "romance", "orbiter", "cocreation"] as const).map((ctx) => {
                const score = lens.contextScores[ctx];
                const color = CONTEXT_COLORS[ctx];
                const isBest = ctx === bestCtx;
                return (
                  <div key={ctx} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: isBest ? color : RV_COLORS.textSub,
                        width: 64,
                        flexShrink: 0,
                      }}
                    >
                      {CONTEXT_LABELS[ctx]}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: RV_COLORS.surfaceMuted,
                        overflow: "hidden",
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${score}%` }}
                        transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                        style={{
                          height: "100%",
                          borderRadius: 3,
                          background: isBest
                            ? `linear-gradient(90deg, ${color}, ${color}CC)`
                            : `${color}60`,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: isBest ? color : RV_COLORS.textMuted,
                        fontFamily: "'JetBrains Mono','SF Mono',monospace",
                        width: 32,
                        textAlign: "right",
                      }}
                    >
                      {score}
                    </span>
                    {isBest && (
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          color,
                          padding: "1px 4px",
                          borderRadius: 3,
                          backgroundColor: `${color}12`,
                        }}
                      >
                        BEST
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </RvCard>
        </FadeInView>
      )}

      {/* Match summary */}
      {detail.contextLensDetail?.matchSummary && (
        <FadeInView delay={0.1}>
          <RvCard className="mb-4">
            <RvSectionTitle className="mb-3">相性サマリー</RvSectionTitle>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.8,
                color: RV_COLORS.textSub,
                margin: 0,
                fontFamily: '"Noto Serif JP", serif',
              }}
            >
              {detail.contextLensDetail.matchSummary}
            </p>
          </RvCard>
        </FadeInView>
      )}

      {/* Top reasons (concise bullet points) */}
      {detail.reasons.length > 0 && (
        <FadeInView delay={0.15}>
          <RvCard className="mb-4">
            <RvSectionTitle accent={bestCtxColor} className="mb-3">
              この出会いの理由
            </RvSectionTitle>
            {detail.reasons.slice(0, 3).map((reason, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "10px 0",
                  borderTop: i > 0 ? `1px solid ${RV_COLORS.border}` : "none",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    backgroundColor: `${bestCtxColor}12`,
                    color: bestCtxColor,
                    fontSize: 11,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontSize: 13,
                      color: RV_COLORS.text,
                      lineHeight: 1.8,
                    }}
                  >
                    {reason}
                  </span>
                  {/* Answer influence hint */}
                  <span
                    style={{
                      display: "block",
                      fontSize: 10,
                      color: RV_COLORS.textMuted,
                      marginTop: 2,
                      lineHeight: 1.4,
                    }}
                  >
                    {getReasonHint(reason)}
                  </span>
                </div>
              </div>
            ))}
          </RvCard>
        </FadeInView>
      )}

      {/* Avatar judgment text */}
      {lens?.avatarJudgmentText && (
        <FadeInView delay={0.2}>
          <RvGlowCard className="mb-4">
            <RvSectionTitle accent={bestCtxColor} className="mb-3">
              分身からの報告
            </RvSectionTitle>
            <p
              style={{
                fontSize: 13,
                color: RV_COLORS.textSub,
                lineHeight: 1.8,
                margin: 0,
                fontFamily: '"Noto Serif JP", serif',
              }}
            >
              {lens.avatarJudgmentText}
            </p>
          </RvGlowCard>
        </FadeInView>
      )}

      {/* Avatar one-line comment (fallback when no avatarJudgmentText) */}
      {!lens?.avatarJudgmentText && (
        <FadeInView delay={0.22}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "12px 16px",
              borderRadius: 12,
              background: `${RV_COLORS.primary}04`,
              border: `1px solid ${RV_COLORS.primary}10`,
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>◈</span>
            <div>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: RV_COLORS.primary,
                  letterSpacing: "0.06em",
                  display: "block",
                  marginBottom: 3,
                }}
              >
                分身より
              </span>
              <span style={{ fontSize: 12, color: RV_COLORS.textSub, lineHeight: 1.7 }}>
                {getAvatarComment(detail.syncPercent ?? 0, detail.candidateState, detail.reasons)}
              </span>
            </div>
          </div>
        </FadeInView>
      )}

      {/* Recommended conversation tone */}
      {detail.contextLensDetail?.recommendedTone && (
        <FadeInView delay={0.25}>
          <RvCard className="mb-4">
            <RvSectionTitle accent={RV_COLORS.secondary} className="mb-3">
              最初の会話の推奨トーン
            </RvSectionTitle>
            <p
              style={{
                fontSize: 13,
                color: RV_COLORS.textSub,
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              {detail.contextLensDetail.recommendedTone}
            </p>
          </RvCard>
        </FadeInView>
      )}

      {/* Contrast point — 1つだけ、完全一致ではないリアルさ */}
      {detail.cautions && detail.cautions.length > 0 && (
        <FadeInView delay={0.3}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "14px 16px",
              borderRadius: 14,
              backgroundColor: `${RV_COLORS.accent}06`,
              border: `1px solid ${RV_COLORS.accent}12`,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                backgroundColor: `${RV_COLORS.accent}15`,
                color: RV_COLORS.accent,
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              △
            </div>
            <div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: RV_COLORS.accent,
                  letterSpacing: "0.05em",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                ここは違う
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: RV_COLORS.textSub,
                  lineHeight: 1.7,
                }}
              >
                {detail.cautions[0]}
              </span>
            </div>
          </div>
        </FadeInView>
      )}

      {/* Public summaries (mood + style) */}
      {(detail.counterpart.publicMoodSummary || detail.counterpart.publicStyleSummary) && (
        <FadeInView delay={0.35}>
          <RvCard className="mb-4">
            <RvSectionTitle accent={RV_COLORS.secondary} className="mb-3">
              相手の雰囲気
            </RvSectionTitle>
            {detail.counterpart.publicMoodSummary && (
              <div style={{ marginBottom: detail.counterpart.publicStyleSummary ? 12 : 0 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: RV_COLORS.textMuted,
                    letterSpacing: 0.5,
                    textTransform: "uppercase" as const,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  MOOD
                </span>
                <p style={{ fontSize: 12, color: RV_COLORS.textSub, lineHeight: 1.7, margin: 0 }}>
                  {detail.counterpart.publicMoodSummary}
                </p>
              </div>
            )}
            {detail.counterpart.publicStyleSummary && (
              <div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: RV_COLORS.textMuted,
                    letterSpacing: 0.5,
                    textTransform: "uppercase" as const,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  STYLE
                </span>
                <p style={{ fontSize: 12, color: RV_COLORS.textSub, lineHeight: 1.7, margin: 0 }}>
                  {detail.counterpart.publicStyleSummary}
                </p>
              </div>
            )}
          </RvCard>
        </FadeInView>
      )}

      {/* Swipe hint */}
      <FadeInView delay={0.4}>
        <div
          style={{
            textAlign: "center",
            marginTop: 16,
            fontSize: 10,
            color: RV_COLORS.textMuted,
            letterSpacing: "0.1em",
          }}
        >
          スワイプして深層を見る →
        </div>
      </FadeInView>
    </div>
  );
}

// =============================================================================
// Act 3: "Depth" (深層)
// =============================================================================

function ActDepth({
  detail,
  showInsight,
  isChatState,
  bestCtxColor,
  contrastData,
  catalystData,
  crystals,
  metamorphosisSignals,
  revealInitialState,
  setRevealInitialState,
  partnerRevealRequested,
  showMutualReveal,
  setShowMutualReveal,
  briefing,
  showBriefingSection,
}: {
  detail: RendezvousDetailDTO;
  showInsight: boolean;
  isChatState: boolean;
  bestCtxColor: string;
  contrastData: any[] | null;
  catalystData: any | null;
  crystals: Crystal[];
  metamorphosisSignals: (MetamorphosisSignal & { id: string })[];
  revealInitialState: "idle" | "requesting" | "partner_requested" | "revealed";
  setRevealInitialState: (s: "idle" | "requesting" | "partner_requested" | "revealed") => void;
  partnerRevealRequested: boolean;
  showMutualReveal: boolean;
  setShowMutualReveal: (v: boolean) => void;
  briefing: PreConnectionBriefing | null;
  showBriefingSection: boolean;
}) {
  const isEarlyState =
    detail.candidateState === "delivered" ||
    detail.candidateState === "candidate_generated" ||
    detail.candidateState === "a_liked" ||
    detail.candidateState === "b_liked";

  return (
    <div style={{ paddingBottom: 120 }}>
      {/* Early state: locked preview */}
      {isEarlyState && (
        <FadeInView delay={0}>
          <RvCard className="mb-4">
            <div
              style={{
                textAlign: "center",
                padding: "32px 16px",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: RV_COLORS.gradientSubtle,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                  fontSize: 20,
                }}
              >
                <span style={{ filter: "grayscale(0.3)" }}>&#x1F512;</span>
              </div>
              <p
                style={{
                  fontSize: 14,
                  color: RV_COLORS.textSub,
                  lineHeight: 1.8,
                  margin: 0,
                  fontFamily: '"Noto Serif JP", serif',
                }}
              >
                関係が深まると、より詳しい情報が見えてきます
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: RV_COLORS.textMuted,
                  marginTop: 8,
                }}
              >
                深層分析・行動予測・関係性シミュレーションが解放されます
              </p>
            </div>
          </RvCard>
        </FadeInView>
      )}

      {/* Graduation Trigger */}
      {showInsight && (
        <FadeInView delay={0}>
          <GraduationTrigger
            candidateId={detail.candidateId}
            candidateState={detail.candidateState}
            matchedAt={detail.matchedAt ?? null}
          />
        </FadeInView>
      )}

      {/* Counselor Briefing */}
      {showBriefingSection && briefing && (
        <FadeInView delay={0.05}>
          <div style={{ marginBottom: 12 }}>
            <PreBriefingCard briefing={briefing} onReady={() => {}} />
          </div>
        </FadeInView>
      )}

      {/* Compatibility Insight */}
      {showInsight && (
        <FadeInView delay={0.1}>
          <div style={{ marginBottom: 12 }}>
            <CompatibilityInsightCard candidateId={detail.candidateId} />
          </div>
        </FadeInView>
      )}

      {/* Compatibility Radar */}
      {showInsight && detail.categoryScores && (
        <FadeInView delay={0.15}>
          <div style={{ marginBottom: 12 }}>
            <CompatibilityRadar
              myView={detail.categoryScores.myView}
              theirView={detail.categoryScores.theirView}
            />
          </div>
        </FadeInView>
      )}

      {/* Observatory Insights */}
      {showInsight && (
        <FadeInView delay={0.2}>
          <ObservatoryInsightsCard candidateId={detail.candidateId} />
        </FadeInView>
      )}

      {/* Journey Timeline */}
      {showInsight && (
        <FadeInView delay={0.25}>
          <JourneyTimelineSection candidateId={detail.candidateId} />
        </FadeInView>
      )}

      {/* Growth Nudge */}
      {showInsight && (
        <FadeInView delay={0.3}>
          <GrowthNudgeSection candidateId={detail.candidateId} />
        </FadeInView>
      )}

      {/* Behavior Contrast Map */}
      {showInsight && contrastData && contrastData.length > 0 && (
        <FadeInView delay={0.35}>
          <div style={{ marginBottom: 12 }}>
            <BehaviorContrastMap contrasts={contrastData} />
          </div>
        </FadeInView>
      )}

      {/* Catalyst Card */}
      {showInsight && catalystData && (
        <FadeInView delay={0.4}>
          <div style={{ marginBottom: 12 }}>
            <CatalystCard potential={catalystData} />
          </div>
        </FadeInView>
      )}

      {/* Relational Intelligence sections */}
      {detail.relationalIntelligence && (
        <>
          {/* Feature 1: 相手の前での自分 */}
          {detail.relationalIntelligence.withThisPerson && (
            <FadeInView delay={0.45}>
              <RvCard className="mb-3">
                <RvSectionTitle accent={bestCtxColor} className="mb-3">
                  相手の前での自分
                </RvSectionTitle>
                {detail.relationalIntelligence.withThisPerson.summaryNarratives.map((narrative, i) => (
                  <div
                    key={`wtp-${i}`}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      borderLeft: `3px solid ${bestCtxColor}30`,
                      background: `${bestCtxColor}04`,
                      marginBottom: i < detail.relationalIntelligence!.withThisPerson!.summaryNarratives.length - 1 ? 8 : 0,
                    }}
                  >
                    <span style={{ fontSize: 12, color: RV_COLORS.textSub, lineHeight: 1.7 }}>
                      {narrative}
                    </span>
                  </div>
                ))}
              </RvCard>
            </FadeInView>
          )}

          {/* Feature 2: 化学反応マップ */}
          {detail.relationalIntelligence.chemistryMap && (
            <FadeInView delay={0.5}>
              <RvCard className="mb-3">
                <RvSectionTitle accent={RV_COLORS.secondary} className="mb-3">
                  化学反応マップ
                </RvSectionTitle>
                <p style={{ fontSize: 12, color: RV_COLORS.textSub, lineHeight: 1.6, margin: "0 0 12px" }}>
                  {detail.relationalIntelligence.chemistryMap.summary}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {([
                    { key: "resonance" as const, label: "共鳴", color: "#10B981", icon: "◎" },
                    { key: "complement" as const, label: "補完", color: "#6366F1", icon: "⊕" },
                    { key: "friction" as const, label: "摩擦", color: "#F59E0B", icon: "△" },
                    { key: "unknown" as const, label: "未知", color: "#9CA3AF", icon: "？" },
                  ] as const).map((q) => {
                    const items = detail.relationalIntelligence!.chemistryMap![q.key];
                    return (
                      <div
                        key={q.key}
                        style={{
                          padding: 10,
                          borderRadius: 10,
                          background: `${q.color}06`,
                          border: `1px solid ${q.color}10`,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                          <span style={{ fontSize: 10 }}>{q.icon}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: q.color }}>{q.label}</span>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 800,
                              color: q.color,
                              marginLeft: "auto",
                              fontFamily: "'JetBrains Mono','SF Mono',monospace",
                            }}
                          >
                            {items.length}
                          </span>
                        </div>
                        {items.slice(0, 2).map((item) => (
                          <div key={item.axis} style={{ fontSize: 10, color: RV_COLORS.textSub, lineHeight: 1.5 }}>
                            {item.axisLabel}
                          </div>
                        ))}
                        {items.length === 0 && (
                          <div style={{ fontSize: 10, color: RV_COLORS.textMuted }}>--</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </RvCard>
            </FadeInView>
          )}

          {/* Feature 3: ズレの前向き読み替え */}
          {detail.relationalIntelligence.positiveFriction.length > 0 && (
            <FadeInView delay={0.55}>
              <RvCard className="mb-3" accentBorder={`${RV_COLORS.accent}15`}>
                <RvSectionTitle accent={RV_COLORS.accent} className="mb-3">
                  ズレの前向き読み替え
                </RvSectionTitle>
                {detail.relationalIntelligence.positiveFriction.map((item, i) => (
                  <div
                    key={`pf-${i}`}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: RV_COLORS.accentSoft,
                      marginBottom: i < detail.relationalIntelligence!.positiveFriction.length - 1 ? 8 : 0,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: RV_COLORS.textMuted,
                        marginBottom: 4,
                        textDecoration: "line-through",
                        textDecorationColor: RV_COLORS.textMuted,
                      }}
                    >
                      {item.cautionText}
                    </div>
                    <div style={{ fontSize: 12, color: RV_COLORS.text, lineHeight: 1.6, fontWeight: 500 }}>
                      {item.positiveFrame}
                    </div>
                    <div style={{ fontSize: 10, color: RV_COLORS.textSub, lineHeight: 1.5, marginTop: 6, fontStyle: "italic" }}>
                      {item.growthHint}
                    </div>
                  </div>
                ))}
              </RvCard>
            </FadeInView>
          )}

          {/* Feature 4: 感覚翻訳 */}
          {detail.relationalIntelligence.styleVoice && (
            <FadeInView delay={0.6}>
              <RvCard className="mb-3" accentBorder={`${RV_COLORS.primaryLight}12`}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <RvSectionTitle accent={RV_COLORS.primaryLight}>感覚翻訳</RvSectionTitle>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 9,
                      fontWeight: 600,
                      color: RV_COLORS.primaryLight,
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: RV_COLORS.primarySoft,
                    }}
                  >
                    {detail.relationalIntelligence.styleVoice.dominantMood}
                  </span>
                </div>
                <p style={{ fontSize: 14, color: RV_COLORS.textSub, lineHeight: 1.8, margin: "0 0 6px" }}>
                  {detail.relationalIntelligence.styleVoice.poeticLine}
                </p>
                <p style={{ fontSize: 12, color: RV_COLORS.textMuted, lineHeight: 1.6, margin: 0 }}>
                  {detail.relationalIntelligence.styleVoice.sensoryLine}
                </p>
              </RvCard>
            </FadeInView>
          )}

          {/* Feature 6: 理解しやすい人 */}
          {detail.relationalIntelligence.readabilityBonuses.length > 0 && (
            <FadeInView delay={0.65}>
              <RvCard className="mb-3" accentBorder={`${RV_COLORS.success}12`}>
                <RvSectionTitle accent={RV_COLORS.success} className="mb-3">
                  理解しやすい人
                </RvSectionTitle>
                {detail.relationalIntelligence.readabilityBonuses.map((bonus, i) => (
                  <div
                    key={`rb-${i}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "6px 0",
                      borderTop: i > 0 ? `1px solid ${RV_COLORS.border}` : "none",
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: RV_COLORS.success,
                        flexShrink: 0,
                        marginTop: 5,
                        opacity: 0.6,
                      }}
                    />
                    <span style={{ fontSize: 12, color: RV_COLORS.textSub, lineHeight: 1.6 }}>
                      {bonus.narrative}
                    </span>
                  </div>
                ))}
              </RvCard>
            </FadeInView>
          )}
        </>
      )}

      {/* Genome Card Preview (always available) */}
      {detail.counterpartUserId && (
        <FadeInView delay={0.7}>
          <GenomeCardPreview
            userId={detail.counterpartUserId}
            compact={!showInsight}
          />
        </FadeInView>
      )}

      {/* Avatar Conversation Timeline */}
      {(detail as any).avatarConversation && (detail as any).avatarConversation.length > 0 && (
        <FadeInView delay={0.75}>
          <div style={{ marginBottom: 12 }}>
            <AvatarConversationTimeline
              interactionData={{ entries: (detail as any).avatarConversation as any[] } as any}
              onViewReport={() => {}}
            />
          </div>
        </FadeInView>
      )}

      {/* Orbiter sections */}
      {detail.orbiterIntelligence?.headline && (
        <FadeInView delay={0.8}>
          <div style={{ marginBottom: 12 }}>
            <OrbiterHeadline headline={detail.orbiterIntelligence.headline} />
          </div>
        </FadeInView>
      )}

      {detail.orbiterIntelligence?.selfStateReport && (
        <FadeInView delay={0.85}>
          <SelfStateAlert selfStateReport={detail.orbiterIntelligence.selfStateReport} />
        </FadeInView>
      )}

      {/* Orbiter progressive revelation */}
      {(() => {
        const visitCount = detail.orbiterContext?.visitCount ?? 1;
        const oi = detail.orbiterIntelligence;
        return (
          <>
            {oi?.frictionForecast && (
              <FadeInView delay={0.9}>
                <div style={{ marginBottom: 12 }}>
                  <FrictionForecastSection frictionForecast={oi.frictionForecast} />
                </div>
              </FadeInView>
            )}
            {visitCount >= 2 && oi?.sceneRecommendation && (
              <FadeInView delay={0.95}>
                <div style={{ marginBottom: 12 }}>
                  <SceneRecommendSection sceneRecommendation={oi.sceneRecommendation} />
                </div>
              </FadeInView>
            )}
            {visitCount >= 2 && oi?.trajectoryForecast && (
              <FadeInView delay={1.0}>
                <div style={{ marginBottom: 12 }}>
                  <TrajectorySection trajectoryForecast={oi.trajectoryForecast} />
                </div>
              </FadeInView>
            )}
            {visitCount >= 3 && oi?.dualOutfit && (
              <FadeInView delay={1.05}>
                <div style={{ marginBottom: 12 }}>
                  <DualOutfitSection dualOutfit={oi.dualOutfit} />
                </div>
              </FadeInView>
            )}
            {visitCount <= 1 && !isEarlyState && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  background: RV_COLORS.surfaceMuted,
                  border: `1px dashed ${RV_COLORS.border}`,
                  textAlign: "center",
                  marginBottom: 12,
                }}
              >
                <span style={{ fontSize: 10, color: RV_COLORS.textMuted, letterSpacing: "0.1em" }}>
                  再訪するたびに、Orbiterの分析は深くなる
                </span>
              </div>
            )}
          </>
        );
      })()}

      {/* Relationship Temperature */}
      {isChatState && (
        <FadeInView delay={1.1}>
          <div style={{ marginBottom: 12 }}>
            <RelationshipTemperature
              direction={
                detail.trajectory?.direction ??
                (metamorphosisSignals.some((s) => s.direction === "rising")
                  ? "rising"
                  : metamorphosisSignals.some((s) => s.direction === "cooling")
                    ? "cooling"
                    : "stable")
              }
              magnitude={
                metamorphosisSignals.length > 0 ? metamorphosisSignals[0].magnitude : undefined
              }
            />
          </div>
        </FadeInView>
      )}

      {/* Memory Crystals */}
      {isChatState && (
        <FadeInView delay={1.15}>
          <RvCard className="mb-3">
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
              <RvSectionTitle accent={RV_COLORS.secondary}>記憶の結晶</RvSectionTitle>
              <span
                style={{
                  fontSize: 9,
                  color: RV_COLORS.textMuted,
                  fontFamily: "'JetBrains Mono','SF Mono',monospace",
                  marginLeft: "auto",
                  letterSpacing: 1,
                }}
              >
                MEMORY CRYSTALS
              </span>
            </div>
            <CrystalGallery crystals={crystals} candidateId={detail.candidateId} />
          </RvCard>
        </FadeInView>
      )}

      {/* Premium features active indicator */}
      {isChatState && (
        <FadeInView delay={1.18}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              borderRadius: 10,
              background: `linear-gradient(90deg, ${RV_COLORS.primarySoft}, ${RV_COLORS.secondarySoft})`,
              border: `1px solid ${RV_COLORS.primaryGlow}`,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 10, color: RV_COLORS.primary, fontWeight: 600 }}>◎</span>
            <span style={{ fontSize: 10, color: RV_COLORS.textMuted, lineHeight: 1.5 }}>
              深層分析・化学反応マップ・Orbiter予測が解放されています
            </span>
          </div>
        </FadeInView>
      )}

      {/* Quick Action Links */}
      {isChatState && (
        <FadeInView delay={1.2}>
          <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 16, flexWrap: "wrap" }}>
            <Link
              href={`/rendezvous/${detail.candidateId}/activities`}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "12px 16px",
                borderRadius: 12,
                background: RV_COLORS.secondarySoft,
                border: `1px solid ${RV_COLORS.secondaryGlow}`,
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
                color: RV_COLORS.secondary,
              }}
            >
              アクティビティ
            </Link>
            <Link
              href={`/rendezvous/${detail.candidateId}?chat=1`}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "12px 16px",
                borderRadius: 12,
                background: RV_COLORS.primarySoft,
                border: `1px solid ${RV_COLORS.primaryGlow}`,
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
                color: RV_COLORS.primary,
              }}
            >
              トーク
            </Link>
          </div>
        </FadeInView>
      )}

      {/* Phase 2: Mutual Photo Reveal */}
      {isChatState && revealInitialState !== "revealed" && (
        <FadeInView delay={1.25}>
          <MutualReveal
            candidateId={detail.candidateId}
            myPhotoUrl={(detail as any).myFacePhotoUrl ?? ""}
            partnerPhotoUrl={(detail as any).partnerFacePhotoUrl ?? ""}
            partnerName={detail.counterpart.displayName}
            initialState={revealInitialState}
            onRevealComplete={() => {
              setRevealInitialState("revealed");
            }}
            onClose={() => {
              setShowMutualReveal(false);
            }}
          />
        </FadeInView>
      )}

      {/* Partner Detail Section */}
      {detail.category === "partner" && (
        <FadeInView delay={1.3}>
          <div style={{ marginBottom: 12 }}>
            <PartnerDetailSection candidateId={detail.candidateId} />
          </div>
        </FadeInView>
      )}
    </div>
  );
}
