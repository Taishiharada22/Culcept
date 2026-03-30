"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import type {
  JourneyState,
  JourneyAction,
  JourneyStage,
} from "@/lib/rendezvous/journeyOrchestrator";

// =============================================================================
// Props
// =============================================================================

type JourneyMapProps = {
  state: JourneyState;
  onActionSelect: (action: JourneyAction) => void;
};

// =============================================================================
// Stage config
// =============================================================================

const STAGE_ORDER: JourneyStage[] = [
  "spark",
  "kindling",
  "flame",
  "glow",
  "ember",
  "constellation",
];

const STAGE_GRADIENTS: Record<JourneyStage, { from: string; to: string }> = {
  spark: { from: "#F59E0B", to: "#EF4444" },
  kindling: { from: "#EF4444", to: "#EC4899" },
  flame: { from: "#EC4899", to: "#8B5CF6" },
  glow: { from: "#8B5CF6", to: "#6366F1" },
  ember: { from: "#6366F1", to: "#06B6D4" },
  constellation: { from: "#06B6D4", to: "#10B981" },
};

const STAGE_LABELS: Record<JourneyStage, string> = {
  spark: "\u{2728} \u30B9\u30D1\u30FC\u30AF",
  kindling: "\u{1F525} \u30AD\u30F3\u30C9\u30EA\u30F3\u30B0",
  flame: "\u{1F525} \u30D5\u30EC\u30A4\u30E0",
  glow: "\u{1F31F} \u30B0\u30ED\u30A6",
  ember: "\u{1F30A} \u30A8\u30F3\u30D0\u30FC",
  constellation: "\u{2B50} \u30B3\u30F3\u30B9\u30C6\u30EC\u30FC\u30B7\u30E7\u30F3",
};

// =============================================================================
// Component
// =============================================================================

export default function JourneyMap({ state, onActionSelect }: JourneyMapProps) {
  const currentIdx = STAGE_ORDER.indexOf(state.stage);
  const gradient = STAGE_GRADIENTS[state.stage];

  return (
    <div className="relative w-full max-w-md mx-auto pb-8">
      {/* Stage-specific gradient background */}
      <div
        className="absolute inset-0 opacity-10 rounded-3xl pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
        }}
      />

      {/* Next Milestone */}
      {state.nextMilestone && (
        <FadeInView delay={0.1}>
          <GlassCard padding="none" className="mb-6 p-4 border-l-4" style={{ borderLeftColor: gradient.from }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">
                \u6B21\u306E\u30DE\u30A4\u30EB\u30B9\u30C8\u30FC\u30F3
              </span>
              <span className="text-xs font-bold" style={{ color: gradient.from }}>
                {Math.round(state.nextMilestone.progress * 100)}%
              </span>
            </div>
            <p className="text-sm font-medium text-slate-700 mb-2">
              {state.nextMilestone.label}
            </p>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${gradient.from}, ${gradient.to})`,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${state.nextMilestone.progress * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </GlassCard>
        </FadeInView>
      )}

      {/* Vertical Timeline Path */}
      <FadeInView delay={0.2}>
        <GlassCard padding="none" className="p-5 mb-6">
          <h3 className="text-sm font-semibold text-slate-600 mb-4">
            \u30B8\u30E3\u30FC\u30CB\u30FC\u30DE\u30C3\u30D7
          </h3>
          <div className="relative">
            {STAGE_ORDER.map((stage, idx) => {
              const isPast = idx < currentIdx;
              const isCurrent = idx === currentIdx;
              const isFuture = idx > currentIdx;
              const stageGrad = STAGE_GRADIENTS[stage];

              return (
                <div key={stage} className="flex items-start gap-3 relative">
                  {/* Vertical line */}
                  {idx < STAGE_ORDER.length - 1 && (
                    <div
                      className="absolute left-[13px] top-[26px] w-0.5 h-[calc(100%-2px)]"
                      style={{
                        background: isPast
                          ? `linear-gradient(180deg, ${stageGrad.from}, ${stageGrad.to})`
                          : isCurrent
                            ? `linear-gradient(180deg, ${stageGrad.from}60, ${stageGrad.to}30)`
                            : "rgba(148,163,184,0.2)",
                      }}
                    />
                  )}

                  {/* Node */}
                  <div className="relative flex-shrink-0 z-10">
                    {isCurrent ? (
                      <motion.div
                        className="w-[26px] h-[26px] rounded-full flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${stageGrad.from}, ${stageGrad.to})`,
                          boxShadow: `0 0 12px ${stageGrad.from}60`,
                        }}
                        animate={{
                          boxShadow: [
                            `0 0 8px ${stageGrad.from}40`,
                            `0 0 16px ${stageGrad.from}70`,
                            `0 0 8px ${stageGrad.from}40`,
                          ],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      >
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </motion.div>
                    ) : isPast ? (
                      <div
                        className="w-[26px] h-[26px] rounded-full flex items-center justify-center"
                        style={{
                          background: `linear-gradient(135deg, ${stageGrad.from}, ${stageGrad.to})`,
                        }}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2 6L5 9L10 3"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-[26px] h-[26px] rounded-full border-2 border-slate-200 bg-slate-50 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
                      </div>
                    )}
                  </div>

                  {/* Label */}
                  <div className={`pb-5 pt-0.5 ${isFuture ? "opacity-40" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-semibold ${
                          isCurrent
                            ? "text-slate-800"
                            : isPast
                              ? "text-slate-600"
                              : "text-slate-400"
                        }`}
                      >
                        {STAGE_LABELS[stage]}
                      </span>
                      {isCurrent && (
                        <GlassBadge variant="default" size="sm">
                          \u73FE\u5728
                        </GlassBadge>
                      )}
                    </div>

                    {/* Stage progress bar for current stage */}
                    {isCurrent && (
                      <div className="mt-1.5">
                        <div className="w-32 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            style={{
                              background: `linear-gradient(90deg, ${stageGrad.from}, ${stageGrad.to})`,
                            }}
                            initial={{ width: 0 }}
                            animate={{
                              width: `${state.stageProgress * 100}%`,
                            }}
                            transition={{ duration: 0.8, delay: 0.3 }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {state.stageDescription}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </FadeInView>

      {/* Available Actions */}
      {state.availableActions.length > 0 && (
        <FadeInView delay={0.3}>
          <h3 className="text-sm font-semibold text-slate-600 mb-3 px-1">
            \u5229\u7528\u53EF\u80FD\u306A\u4F53\u9A13
          </h3>
          <div className="space-y-3 mb-6">
            <AnimatePresence mode="popLayout">
              {state.availableActions.map((action, idx) => (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <ActionCard
                    action={action}
                    gradient={gradient}
                    onSelect={() => onActionSelect(action)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </FadeInView>
      )}

      {/* Locked Features */}
      {state.lockedFeatures.length > 0 && (
        <FadeInView delay={0.4}>
          <h3 className="text-sm font-semibold text-slate-400 mb-3 px-1">
            \u30ED\u30C3\u30AF\u4E2D\u306E\u4F53\u9A13
          </h3>
          <div className="space-y-2">
            {state.lockedFeatures.map((feat) => (
              <div
                key={feat.key}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50/60 border border-slate-100"
              >
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    className="text-slate-300"
                  >
                    <rect
                      x="3"
                      y="6"
                      width="8"
                      height="6"
                      rx="1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M5 6V4a2 2 0 114 0v2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400 truncate">
                    {feat.unlockHint}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </FadeInView>
      )}
    </div>
  );
}

// =============================================================================
// Action Card
// =============================================================================

function ActionCard({
  action,
  gradient,
  onSelect,
}: {
  action: JourneyAction;
  gradient: { from: string; to: string };
  onSelect: () => void;
}) {
  return (
    <GlassCard
      padding="none"
      className="p-4 cursor-pointer active:scale-[0.98] transition-transform"
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${gradient.from}15, ${gradient.to}15)`,
          }}
        >
          {action.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-slate-800 truncate">
              {action.label}
            </span>
            {action.isNew && (
              <GlassBadge variant="default" size="sm">
                NEW
              </GlassBadge>
            )}
            {action.requiresBothUsers && (
              <span className="text-[10px] text-slate-400 flex-shrink-0">
                {"\u{1F465}"} 二人用
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
            {action.description}
          </p>
          <p className="text-[10px] mt-1.5" style={{ color: gradient.from }}>
            {action.unlockReason}
          </p>
          {action.estimatedMinutes != null && (
            <span className="text-[10px] text-slate-400 mt-0.5 inline-block">
              \u7D04{action.estimatedMinutes}\u5206
            </span>
          )}
        </div>

        {/* Arrow */}
        <div className="flex-shrink-0 mt-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="text-slate-300"
          >
            <path
              d="M6 4l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </GlassCard>
  );
}
