// app/stargazer/_components/LifeEventTimeline.tsx
// ライフイベントタイムライン — 人生の出来事を縦型タイムラインで表示
"use client";

import { motion } from "framer-motion";
import { GlassCard, FadeInView } from "@/components/ui/glassmorphism-design";
import type { LifeEvent, EventCategory } from "@/lib/stargazer/lifeEvents";
import { EVENT_CATEGORY_LABELS } from "@/lib/stargazer/lifeEvents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LifeEventTimelineProps {
  events: LifeEvent[];
}

// ---------------------------------------------------------------------------
// Category color mapping
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<EventCategory, { bg: string; border: string; text: string }> = {
  relationship: { bg: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.4)", text: "#EC4899" },
  career: { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.4)", text: "#3B82F6" },
  health: { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.4)", text: "#10B981" },
  life: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.4)", text: "#F59E0B" },
  internal: { bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.4)", text: "#8B5CF6" },
};

// ---------------------------------------------------------------------------
// Intensity dots
// ---------------------------------------------------------------------------

function IntensityDots({ level }: { level: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full transition-colors"
          style={{
            backgroundColor: i < level ? "rgba(139,92,246,0.8)" : "rgba(139,92,246,0.2)",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single event node
// ---------------------------------------------------------------------------

function EventNode({ event, index }: { event: LifeEvent; index: number }) {
  const cat = EVENT_CATEGORY_LABELS[event.category];
  const colors = CATEGORY_COLORS[event.category];

  const formattedDate = (() => {
    try {
      const d = new Date(event.date);
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    } catch {
      return event.date;
    }
  })();

  return (
    <FadeInView delay={index * 0.07}>
      <div className="flex gap-4">
        {/* Timeline spine + node */}
        <div className="flex flex-col items-center flex-shrink-0">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: index * 0.07 + 0.1, type: "spring", stiffness: 260, damping: 20 }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-sm flex-shrink-0"
            style={{
              background: colors.bg,
              border: `1.5px solid ${colors.border}`,
            }}
          >
            {cat.icon}
          </motion.div>
          {/* Connector line (hidden for last item via parent) */}
          <div
            className="w-px flex-1 mt-1"
            style={{ background: "rgba(139,92,246,0.15)", minHeight: "1.5rem" }}
          />
        </div>

        {/* Card */}
        <div className="flex-1 pb-4">
          <GlassCard className="p-4">
            {/* Header row */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm leading-snug truncate">
                  {event.title}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{formattedDate}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Positive / negative badge */}
                <span
                  className="inline-flex items-center font-medium rounded-full border px-2.5 py-0.5 text-xs"
                  style={{
                    background: event.isPositive
                      ? "rgba(16,185,129,0.12)"
                      : "rgba(239,68,68,0.12)",
                    color: event.isPositive ? "#059669" : "#DC2626",
                    borderColor: event.isPositive ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)",
                  }}
                >
                  {event.isPositive ? "ポジティブ" : "ネガティブ"}
                </span>

                {/* Category badge */}
                <span
                  className="inline-flex items-center font-medium rounded-full border px-2.5 py-0.5 text-xs"
                  style={{
                    background: colors.bg,
                    color: colors.text,
                    borderColor: colors.border,
                  }}
                >
                  {cat.label}
                </span>
              </div>
            </div>

            {/* Description */}
            {event.description && (
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">{event.description}</p>
            )}

            {/* Intensity */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">強度</span>
              <IntensityDots level={event.intensity} />
              <span className="text-xs text-slate-400">({event.intensity}/5)</span>
            </div>
          </GlassCard>
        </div>
      </div>
    </FadeInView>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export default function LifeEventTimeline({ events }: LifeEventTimelineProps) {
  if (events.length === 0) return null;

  return (
    <div className="relative">
      {events.map((event, i) => (
        <EventNode key={event.id} event={event} index={i} />
      ))}
    </div>
  );
}
