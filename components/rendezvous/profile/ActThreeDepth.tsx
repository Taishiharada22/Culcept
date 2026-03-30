"use client";

import { motion } from "framer-motion";
import { GlassCard, FadeInView, GlassBadge } from "@/components/ui/glassmorphism-design";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

type CompatibilityAxis = {
  axis: string;
  label: string;
  myValue: number;
  theirValue: number;
};

type Props = {
  compatibilityAxes?: CompatibilityAxis[];
  category?: RendezvousCategory;
};

const CATEGORY_LABELS: Record<RendezvousCategory, string> = {
  romantic: "恋愛",
  friendship: "友達",
  cocreation: "共創",
  community: "コミュニティ",
  partner: "パートナー",
};

const PLACEHOLDER_SECTIONS = [
  {
    id: "constellation",
    label: "星座の重なり",
    description: "Stargazer で見えた二人の星座パターンの重複",
    icon: "🌌",
    comingSoon: true,
  },
  {
    id: "catalyst",
    label: "触媒カード",
    description: "二人の関係に化学反応を起こすきっかけ",
    icon: "⚡",
    comingSoon: true,
  },
  {
    id: "season",
    label: "シーズンインジケーター",
    description: "今の二人の関係はどの季節にあるか",
    icon: "🍂",
    comingSoon: true,
  },
];

export default function ActThreeDepth({
  compatibilityAxes,
  category,
}: Props) {
  return (
    <div className="px-5 pb-8">
      {/* Header */}
      <FadeInView>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-slate-800">もっと知る</h3>
          {category && (
            <GlassBadge variant="info" size="sm">
              {CATEGORY_LABELS[category]}
            </GlassBadge>
          )}
        </div>
      </FadeInView>

      {/* Compatibility axes */}
      {compatibilityAxes && compatibilityAxes.length > 0 && (
        <FadeInView delay={0.1}>
          <GlassCard className="mb-5" padding="md">
            <p className="text-xs font-semibold text-slate-500 mb-4">
              軸ごとの比較
            </p>
            <div className="space-y-4">
              {compatibilityAxes.map((axis, i) => (
                <motion.div
                  key={axis.axis}
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-600">
                      {axis.label}
                    </span>
                  </div>
                  <div className="relative h-4 rounded-full bg-slate-100 overflow-hidden">
                    {/* My value bar */}
                    <motion.div
                      className="absolute top-0 left-0 h-full rounded-full bg-violet-400/70"
                      initial={{ width: 0 }}
                      animate={{ width: `${axis.myValue * 100}%` }}
                      transition={{
                        delay: 0.3 + i * 0.1,
                        duration: 0.5,
                        ease: "easeOut",
                      }}
                    />
                    {/* Their value indicator */}
                    <motion.div
                      className="absolute top-0 h-full w-0.5 bg-pink-500"
                      initial={{ left: "0%" }}
                      animate={{ left: `${axis.theirValue * 100}%` }}
                      transition={{
                        delay: 0.4 + i * 0.1,
                        duration: 0.5,
                        ease: "easeOut",
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-violet-500 font-medium">
                      あなた {Math.round(axis.myValue * 100)}%
                    </span>
                    <span className="text-[10px] text-pink-500 font-medium">
                      相手 {Math.round(axis.theirValue * 100)}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </GlassCard>
        </FadeInView>
      )}

      {/* Placeholder slots for future features */}
      <div className="space-y-3">
        {PLACEHOLDER_SECTIONS.map((section, i) => (
          <FadeInView key={section.id} delay={0.3 + i * 0.1}>
            <GlassCard padding="md" hoverEffect={false}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-lg">
                  {section.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-700">
                      {section.label}
                    </span>
                    {section.comingSoon && (
                      <GlassBadge variant="secondary" size="sm">
                        Coming Soon
                      </GlassBadge>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {section.description}
                  </p>
                </div>
              </div>
            </GlassCard>
          </FadeInView>
        ))}
      </div>
    </div>
  );
}
