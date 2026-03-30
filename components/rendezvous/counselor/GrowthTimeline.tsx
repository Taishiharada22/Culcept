"use client";

import { motion } from "framer-motion";
import {
  GlassCard,
  ProgressRing,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import CounselorMessage from "./CounselorMessage";
import type { GrowthInsight } from "@/lib/rendezvous/counselor/types";

interface GrowthTimelineProps {
  insight: GrowthInsight;
}

export default function GrowthTimeline({ insight }: GrowthTimelineProps) {
  const hasEnoughData = insight.totalDisconnects >= 3;

  return (
    <FadeInView direction="up">
      <div className="space-y-5">
        {/* ヘッダー + スコアリング */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            あなたの成長
          </h3>
          <ProgressRing progress={insight.growthScore} size={64} strokeWidth={5}>
            <span className="text-sm font-bold text-slate-700">
              {insight.growthScore}
            </span>
          </ProgressRing>
        </div>

        {/* データ不足メッセージ */}
        {!hasEnoughData && (
          <GlassCard padding="sm" hoverEffect={false}>
            <p className="text-sm text-slate-500 text-center leading-relaxed">
              もう少しデータが集まると、傾向が見えてきます
            </p>
          </GlassCard>
        )}

        {/* パターンタイムライン */}
        {hasEnoughData && insight.patterns.length > 0 && (
          <GlassCard padding="sm" hoverEffect={false}>
            <p className="text-sm font-semibold text-slate-700 mb-3">
              検出されたパターン
            </p>
            <div className="space-y-3">
              {insight.patterns.map((pattern, i) => (
                <motion.div
                  key={pattern.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-start gap-3"
                >
                  {/* タイムラインドット + ライン */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        pattern.improving
                          ? "bg-emerald-400"
                          : "bg-amber-400"
                      }`}
                    />
                    {i < insight.patterns.length - 1 && (
                      <div className="w-px h-full bg-slate-200 mt-1" />
                    )}
                  </div>

                  {/* パターン内容 */}
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        {pattern.name}
                      </p>
                      <span
                        className={`text-xs font-medium ${
                          pattern.improving
                            ? "text-emerald-600"
                            : "text-amber-600"
                        }`}
                      >
                        {pattern.improving ? "改善中" : "安定"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {pattern.description}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      発生 {pattern.frequency}回
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* 成長ポイント（Before → After） */}
        {hasEnoughData && insight.improvements.length > 0 && (
          <div className="space-y-2.5">
            <p className="text-sm font-semibold text-slate-700 px-1">
              成長の記録
            </p>
            {insight.improvements.map((imp, i) => (
              <motion.div
                key={imp.area}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
              >
                <GlassCard padding="sm" hoverEffect={false}>
                  <p className="text-xs font-medium text-slate-500 mb-2">
                    {imp.area}
                  </p>
                  <div className="flex items-center gap-3">
                    {/* Before */}
                    <div className="flex-1 rounded-lg bg-slate-50/80 border border-slate-200/50 px-3 py-2">
                      <p className="text-xs text-slate-400 mb-0.5">以前</p>
                      <p className="text-sm text-slate-600">{imp.before}</p>
                    </div>

                    {/* 矢印 */}
                    <div className="flex-shrink-0 text-emerald-400">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </svg>
                    </div>

                    {/* After */}
                    <div className="flex-1 rounded-lg bg-emerald-50/60 border border-emerald-200/40 px-3 py-2">
                      <p className="text-xs text-emerald-500 mb-0.5">現在</p>
                      <p className="text-sm text-emerald-700">{imp.after}</p>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        )}

        {/* 次のアドバイス */}
        {insight.nextAdvice && (
          <CounselorMessage message={insight.nextAdvice} delay={0.4} />
        )}
      </div>
    </FadeInView>
  );
}
