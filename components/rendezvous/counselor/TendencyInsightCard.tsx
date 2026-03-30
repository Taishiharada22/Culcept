"use client";

import { motion } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import type { TendencyInsight } from "@/lib/rendezvous/counselor/types";

interface TendencyInsightCardProps {
  insight: TendencyInsight;
  onContinue: () => void;
}

export default function TendencyInsightCard({
  insight,
  onContinue,
}: TendencyInsightCardProps) {
  return (
    <FadeInView direction="up" delay={0.1}>
      <GlassCard
        padding="none"
        hoverEffect={false}
        className="overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.75) 0%, rgba(255,251,235,0.6) 100%)",
          border: "1px solid rgba(251,191,36,0.25)",
        }}
      >
        {/* ゴールドのトップアクセント */}
        <div className="h-1 bg-gradient-to-r from-amber-300/60 via-yellow-400/50 to-amber-300/60" />

        <div className="p-6 space-y-5">
          {/* ヘッダー */}
          <div className="flex items-center gap-2">
            <motion.span
              className="text-amber-500 text-lg"
              animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              ✦
            </motion.span>
            <h3 className="text-base font-semibold text-slate-800">
              あなたの傾向
            </h3>
          </div>

          {/* 傾向タイトル */}
          <p className="text-xl font-bold text-slate-900 leading-snug">
            {insight.tendency}
          </p>

          {/* 説明 */}
          <p className="text-sm leading-relaxed text-slate-600">
            {insight.explanation}
          </p>

          {/* リフレーミング（ポジティブボックス） */}
          <div className="rounded-xl bg-gradient-to-br from-amber-50/80 to-yellow-50/60 border border-amber-200/40 px-4 py-3.5">
            <p className="text-sm leading-relaxed text-amber-800">
              {insight.reframe}
            </p>
          </div>

          {/* 関連軸 */}
          {insight.relatedAxes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {insight.relatedAxes.map((axis) => (
                <GlassBadge key={axis} variant="warning" size="sm">
                  {axis}
                </GlassBadge>
              ))}
            </div>
          )}

          {/* パターンカウント */}
          {insight.patternCount > 1 && (
            <p className="text-xs text-slate-500">
              この傾向は {insight.patternCount}回目の観測です
            </p>
          )}

          {/* 次へ */}
          <GlassButton
            variant="primary"
            onClick={onContinue}
            fullWidth
            className="!bg-gradient-to-r !from-amber-600 !to-amber-700 !shadow-amber-600/20"
          >
            次へ
          </GlassButton>
        </div>
      </GlassCard>
    </FadeInView>
  );
}
