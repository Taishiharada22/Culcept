"use client";

import { motion } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import type { PreConnectionBriefing } from "@/lib/rendezvous/counselor/types";

interface PreBriefingCardProps {
  briefing: PreConnectionBriefing;
  onReady: () => void;
}

export default function PreBriefingCard({
  briefing,
  onReady,
}: PreBriefingCardProps) {
  return (
    <FadeInView direction="up" delay={0.1}>
      <div className="space-y-4">
        {/* ヘッダー */}
        <div className="text-center space-y-1">
          <h3 className="text-lg font-semibold text-slate-800">
            接続前ブリーフィング
          </h3>
          <p className="text-sm text-slate-500">
            より良い接続のためのヒント
          </p>
        </div>

        {/* 相手の特徴 */}
        <GlassCard padding="sm" hoverEffect={false}>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-700">
              相手の特徴
            </p>
            {briefing.counterpartTraits.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex gap-3 items-start"
              >
                <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">
                    {item.trait}
                  </p>
                  <div className="mt-1.5 rounded-lg bg-indigo-50/60 border border-indigo-100/40 px-3 py-2">
                    <p className="text-xs text-indigo-600 leading-relaxed">
                      {item.advice}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </GlassCard>

        {/* 話題候補 */}
        {briefing.suggestedTopics.length > 0 && (
          <GlassCard padding="sm" hoverEffect={false}>
            <p className="text-sm font-semibold text-slate-700 mb-2.5">
              おすすめの話題
            </p>
            <div className="flex flex-wrap gap-2">
              {briefing.suggestedTopics.map((topic) => (
                <GlassBadge key={topic} variant="info" size="sm">
                  {topic}
                </GlassBadge>
              ))}
            </div>
          </GlassCard>
        )}

        {/* 最初のアドバイス */}
        <GlassCard
          padding="sm"
          hoverEffect={false}
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(238,242,255,0.5) 100%)",
            border: "1px solid rgba(129,140,248,0.2)",
          }}
        >
          <p className="text-sm font-semibold text-indigo-700 mb-1.5">
            最初の15分のヒント
          </p>
          <p className="text-sm leading-relaxed text-slate-700">
            {briefing.openingAdvice}
          </p>
        </GlassCard>

        {/* 注意点 */}
        {briefing.awarenessPoints.length > 0 && (
          <div className="space-y-1.5 px-1">
            {briefing.awarenessPoints.map((point, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="text-xs text-slate-500 leading-relaxed flex items-start gap-2"
              >
                <span className="text-slate-400 mt-0.5 flex-shrink-0">*</span>
                {point}
              </motion.p>
            ))}
          </div>
        )}

        {/* カテゴリ別アドバイス */}
        {briefing.categorySpecificAdvice && (
          <p className="text-xs text-slate-500 italic px-1">
            {briefing.categorySpecificAdvice}
          </p>
        )}

        {/* 準備OK */}
        <GlassButton variant="gradient" onClick={onReady} fullWidth>
          準備OK
        </GlassButton>
      </div>
    </FadeInView>
  );
}
