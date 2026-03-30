"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, FadeInView } from "@/components/ui/glassmorphism-design";
import type { JourneyEvent, AvatarEmotion } from "@/lib/rendezvous/avatarVitality";

// =============================================================================
// AvatarJourneyFeed — 分身の旅路を縦タイムラインで表示
// =============================================================================

const EMOTION_COLORS: Record<AvatarEmotion, string> = {
  curious: "#06B6D4",
  excited: "#F59E0B",
  hesitant: "#F59E0B",
  contemplative: "#8B5CF6",
  delighted: "#EC4899",
  resting: "#94A3B8",
};

interface AvatarJourneyFeedProps {
  events: JourneyEvent[];
  maxItems?: number;
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "昨日";
  if (days < 7) return `${days}日前`;

  return `${Math.floor(days / 7)}週間前`;
}

export default function AvatarJourneyFeed({ events, maxItems = 3 }: AvatarJourneyFeedProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleEvents = expanded ? events : events.slice(0, maxItems);
  const hasMore = events.length > maxItems;

  if (events.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-[#1E1E3C]/35 leading-relaxed">
          まだ旅の記録はありません
          <br />
          分身が探索を始めるのを待ちましょう
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div
        className="absolute left-[11px] top-0 bottom-0 w-[2px]"
        style={{
          background: "linear-gradient(180deg, rgba(30,30,60,0.12) 0%, rgba(30,30,60,0.04) 100%)",
        }}
      />

      <AnimatePresence mode="popLayout">
        {visibleEvents.map((event, index) => {
          const dotColor = EMOTION_COLORS[event.emotion] ?? EMOTION_COLORS.resting;

          return (
            <FadeInView key={event.id} delay={index * 0.06}>
              <div className="relative flex gap-3 mb-3 last:mb-0">
                {/* Timeline dot */}
                <div className="relative z-10 shrink-0 mt-3">
                  <div
                    className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center"
                    style={{
                      background: dotColor,
                      boxShadow: `0 0 8px ${dotColor}40`,
                    }}
                  >
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                </div>

                {/* Event card */}
                <div className="flex-1 min-w-0">
                  <GlassCard className="!p-3" hoverEffect={false}>
                    <p className="text-sm text-[#1E1E3C]/75 leading-relaxed">
                      {event.narrative}
                    </p>
                    <p className="text-[10px] text-[#1E1E3C]/35 mt-1.5">
                      {formatRelativeTime(event.createdAt)}
                    </p>
                  </GlassCard>
                </div>
              </div>
            </FadeInView>
          );
        })}
      </AnimatePresence>

      {/* Expand / collapse button */}
      {hasMore && (
        <motion.button
          onClick={() => setExpanded((v) => !v)}
          className="relative z-10 ml-9 mt-1 text-xs text-indigo-500 font-semibold"
          whileTap={{ scale: 0.97 }}
        >
          {expanded ? "閉じる" : `もっと見る（残り${events.length - maxItems}件）`}
        </motion.button>
      )}
    </div>
  );
}
