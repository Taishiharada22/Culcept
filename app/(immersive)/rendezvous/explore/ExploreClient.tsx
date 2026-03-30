"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import MatchCardStack from "@/components/rendezvous/MatchCardStack";
import SwipeFeedback, {
  type SwipeFeedbackData,
} from "@/components/rendezvous/SwipeFeedback";
import { type MatchCardCandidate } from "@/components/rendezvous/MatchCard";
import {
  generateSwipeFeedback,
  loadSwipePatterns,
  recordSwipe,
  type CandidateSignals,
  type SwipeDirection,
} from "@/lib/rendezvous/swipeFeedback";
import { RV_COLORS, RV_CATEGORY_COLORS, RV_CATEGORY_LABELS, RvButton } from "@/components/ui/rendezvous-design";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

// ---------- Types ----------

type ExploreCandidate = MatchCardCandidate & {
  avatarConversationScore?: number;
};

type APICandidate = {
  candidateId: string;
  displayName: string;
  photoUrl: string | null;
  age: number | null;
  area: string | null;
  corePhrase: string;
  resonanceLevel: number;
  avatarHighlight: string | null;
  avatarConversationScore: number;
  bridgePrediction: string | null;
  category: RendezvousCategory;
};

// ---------- Category Filter ----------

const CATEGORY_OPTIONS: { value: RendezvousCategory | "all"; label: string; color?: string }[] = [
  { value: "all", label: "すべて" },
  { value: "romantic", label: RV_CATEGORY_LABELS.romantic, color: RV_CATEGORY_COLORS.romantic },
  { value: "friendship", label: RV_CATEGORY_LABELS.friendship, color: RV_CATEGORY_COLORS.friendship },
  { value: "cocreation", label: RV_CATEGORY_LABELS.cocreation, color: RV_CATEGORY_COLORS.cocreation },
  { value: "community", label: RV_CATEGORY_LABELS.community, color: RV_CATEGORY_COLORS.community },
  { value: "partner", label: RV_CATEGORY_LABELS.partner, color: RV_CATEGORY_COLORS.partner },
];

// ---------- Component ----------

interface ExploreClientProps {
  userId: string;
}

export default function ExploreClient({ userId }: ExploreClientProps) {
  const [candidates, setCandidates] = useState<ExploreCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SwipeFeedbackData | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<
    RendezvousCategory | "all"
  >("all");
  const [dailyCount, setDailyCount] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(10);

  const candidateSignalMap = useRef<Map<string, CandidateSignals>>(new Map());

  // 適応ペーシング: ユーザーの利用パターンに基づく動的日次リミット
  useEffect(() => {
    import("@/lib/rendezvous/adaptivePacing").then(({ computeDeliverySchedule }) => {
      const schedule = computeDeliverySchedule({
        opensLast24h: 3,
        opensLast7d: 7,
        swipesLast24h: 8,
        avgSessionDurationMs: 60000,
        daysSinceLastOpen: 0,
        candidatesDeliveredToday: 0,
      });
      setDailyLimit(schedule.batchSize);
    }).catch(() => {});
  }, []);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "10" });
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      const res = await fetch(`/api/rendezvous/explore?${params}`);
      if (!res.ok) throw new Error("候補の取得に失敗しました");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "エラーが発生しました");

      const mapped: ExploreCandidate[] = (json.candidates ?? []).map(
        (c: APICandidate) => {
          candidateSignalMap.current.set(c.candidateId, {
            resonanceLevel: c.resonanceLevel,
            avatarConversationScore: c.avatarConversationScore,
            category: c.category,
          });
          return {
            candidateId: c.candidateId,
            photoUrl: c.photoUrl,
            displayName: c.displayName,
            age: c.age,
            area: c.area,
            corePhrase: c.corePhrase,
            resonanceLevel: Math.min(3, Math.max(0, c.resonanceLevel)) as
              | 0
              | 1
              | 2
              | 3,
            avatarHighlight: c.avatarHighlight,
            bridgePrediction: c.bridgePrediction,
            category: c.category,
            avatarConversationScore: c.avatarConversationScore,
          };
        },
      );

      setCandidates(mapped);
      setDailyCount(json.dailySwipeCount ?? 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const handleSwipe = useCallback(
    async (candidateId: string, direction: SwipeDirection) => {
      const signals = candidateSignalMap.current.get(candidateId);
      if (signals) {
        const patterns = loadSwipePatterns();
        const fb = generateSwipeFeedback(direction, signals, patterns);
        setFeedback(fb);
        recordSwipe(direction, signals);
      }

      setDailyCount((c) => c + 1);

      try {
        // メイン処理: explore API に記録
        await fetch("/api/rendezvous/explore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId, direction }),
        });

        // swipe-outcome API: 適応ウェイト学習用データ記録（fire-and-forget）
        fetch(`/api/rendezvous/${candidateId}/swipe-outcome`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            direction: direction === "right" ? "like" : direction === "up" ? "super_like" : "pass",
            category: signals?.category ?? "romantic",
          }),
        }).catch(() => {});
      } catch {
        // fire-and-forget
      }
    },
    [],
  );

  const handleSwipeRight = useCallback(
    (id: string) => handleSwipe(id, "right"),
    [handleSwipe],
  );
  const handleSwipeLeft = useCallback(
    (id: string) => handleSwipe(id, "left"),
    [handleSwipe],
  );
  const handleSwipeUp = useCallback(
    (id: string) => handleSwipe(id, "up"),
    [handleSwipe],
  );

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <h1
          className="text-lg font-bold"
          style={{ color: RV_COLORS.text }}
        >
          探索
        </h1>
        <span
          className="text-xs px-3 py-1.5 rounded-full font-medium"
          style={{
            backgroundColor: RV_COLORS.surfaceMuted,
            border: `1px solid ${RV_COLORS.border}`,
            color: RV_COLORS.textSub,
          }}
        >
          今日の出会い: <span style={{ color: RV_COLORS.accent }}>{dailyCount}</span>/{dailyLimit}
        </span>
      </div>

      {/* Category tabs — 常時表示 */}
      <div className="px-5 pb-3">
        <div className="flex gap-2 relative">
          {CATEGORY_OPTIONS.map((opt) => {
            const isSelected = categoryFilter === opt.value;
            const catColor = opt.color ?? RV_COLORS.text;
            return (
              <button
                key={opt.value}
                onClick={() => setCategoryFilter(opt.value)}
                className="relative flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border-none cursor-pointer"
                style={{
                  backgroundColor: isSelected ? `${catColor}12` : RV_COLORS.surfaceMuted,
                  color: isSelected ? catColor : RV_COLORS.textSub,
                  boxShadow: isSelected ? `0 2px 8px ${catColor}15` : "none",
                }}
              >
                {opt.label}
                {isSelected && (
                  <motion.div
                    layoutId="category-indicator"
                    className="absolute bottom-0 left-1/4 right-1/4 h-[2px] rounded-full"
                    style={{ background: catColor }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Card Stack */}
      <div className="flex items-center justify-center px-4 mt-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[540px] gap-5">
            <motion.div
              className="w-14 h-14 rounded-full"
              style={{
                border: `2px solid ${RV_COLORS.border}`,
                borderTopColor: RV_COLORS.primary,
              }}
              animate={{ rotate: 360 }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear",
              }}
            />
            <p className="text-sm" style={{ color: RV_COLORS.textSub }}>
              候補を読み込み中...
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-[540px] gap-4">
            <p className="text-sm" style={{ color: RV_COLORS.primary }}>
              {error}
            </p>
            <RvButton variant="secondary" onClick={fetchCandidates}>
              再試行
            </RvButton>
          </div>
        ) : (
          <MatchCardStack
            candidates={candidates}
            onSwipeRight={handleSwipeRight}
            onSwipeLeft={handleSwipeLeft}
            onSwipeUp={handleSwipeUp}
          />
        )}
      </div>

      {/* Swipe hint */}
      <div
        className="flex items-center justify-center gap-8 mt-6 text-xs font-medium"
        style={{ color: RV_COLORS.textMuted }}
      >
        <span>← スキップ</span>
        <span style={{ color: RV_COLORS.accent }}>↑ 超共鳴</span>
        <span>興味あり →</span>
      </div>

      {/* Feedback overlay */}
      <SwipeFeedback
        feedback={feedback}
        onDismiss={() => setFeedback(null)}
      />
    </div>
  );
}
