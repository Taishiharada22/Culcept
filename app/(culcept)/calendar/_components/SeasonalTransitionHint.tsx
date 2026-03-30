"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { SeasonBlend, SeasonalRotationHint } from "../_lib/types";

const SEASON_STYLES: Record<string, { gradient: string; emoji: string }> = {
  spring: { gradient: "from-pink-100/60 to-green-100/40", emoji: "🌸" },
  summer: { gradient: "from-cyan-100/60 to-yellow-100/40", emoji: "🌻" },
  autumn: { gradient: "from-orange-100/60 to-amber-100/40", emoji: "🍁" },
  winter: { gradient: "from-blue-100/60 to-slate-100/40", emoji: "❄️" },
};

interface Props {
  blend: SeasonBlend;
  hints: SeasonalRotationHint[];
  morningAfternoonMessage?: string;
}

export default function SeasonalTransitionHint({ blend, hints, morningAfternoonMessage }: Props) {
  if (!blend.shoulderSeason && hints.length === 0 && !morningAfternoonMessage) return null;

  const primary = SEASON_STYLES[blend.primary] ?? SEASON_STYLES.spring;
  const secondary = blend.secondary ? SEASON_STYLES[blend.secondary] : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="space-y-2"
      >
        {/* 季節遷移バナー */}
        {blend.shoulderSeason && secondary && (
          <div className={`rounded-xl bg-gradient-to-r ${primary.gradient} border border-white/40 backdrop-blur-sm px-3 py-2`}>
            <div className="flex items-center gap-2">
              <span className="text-base">{primary.emoji}</span>
              <span className="text-[9px] text-gray-400">→</span>
              <span className="text-base">{secondary.emoji}</span>
              <div className="ml-1 flex-1">
                <p className="text-[10px] font-medium text-gray-700">
                  季節の変わり目
                </p>
                <p className="text-[9px] text-gray-500">
                  {blend.primary === "winter" && blend.secondary === "spring" && "朝は冬物、昼は春物が快適です"}
                  {blend.primary === "spring" && blend.secondary === "summer" && "薄手への切り替え時期です"}
                  {blend.primary === "summer" && blend.secondary === "autumn" && "朝晩は羽織物があると安心"}
                  {blend.primary === "autumn" && blend.secondary === "winter" && "防寒アイテムの準備を"}
                </p>
              </div>
              {/* ブレンドインジケーター */}
              <div className="w-12 h-1.5 rounded-full bg-gray-200/60 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${blend.blend * 100}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 朝/午後分割メッセージ */}
        {morningAfternoonMessage && (
          <div className="rounded-xl bg-gradient-to-r from-amber-50/60 to-orange-50/40 border border-amber-200/30 px-3 py-2">
            <p className="text-[10px] text-amber-700 flex items-center gap-1.5">
              <span>🌅</span>
              {morningAfternoonMessage}
            </p>
          </div>
        )}

        {/* 衣替えヒント */}
        {hints.map((hint, i) => (
          <div
            key={i}
            className={`rounded-xl border border-white/40 backdrop-blur-sm px-3 py-2 ${
              hint.type === "upcoming"
                ? "bg-gradient-to-r from-indigo-50/50 to-purple-50/40"
                : "bg-gradient-to-r from-gray-50/50 to-slate-50/40"
            }`}
          >
            <p className="text-[10px] text-gray-700 flex items-center gap-1.5">
              <span>{hint.type === "upcoming" ? "👗" : "📦"}</span>
              {hint.message}
            </p>
          </div>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
