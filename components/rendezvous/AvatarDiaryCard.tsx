"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { AvatarDiaryEntry, AvatarDiaryTone } from "@/lib/rendezvous/avatarGrowthDiary";

// =============================================================================
// AvatarDiaryCard - 分身成長日記カード
// 分身の視点から今日の観察をGlassCardスタイルで表示
// =============================================================================

type AvatarDiaryCardProps = {
  entry: AvatarDiaryEntry;
  className?: string;
};

const TONE_STYLES: Record<AvatarDiaryTone, { gradient: string; icon: string; label: string }> = {
  curious: {
    gradient: "from-amber-400/20 to-orange-300/10",
    icon: "?",
    label: "好奇心",
  },
  contemplative: {
    gradient: "from-violet-400/20 to-indigo-300/10",
    icon: "...",
    label: "内省",
  },
  warm: {
    gradient: "from-rose-400/20 to-pink-300/10",
    icon: "~",
    label: "温もり",
  },
  surprised: {
    gradient: "from-cyan-400/20 to-blue-300/10",
    icon: "!",
    label: "発見",
  },
  protective: {
    gradient: "from-emerald-400/20 to-teal-300/10",
    icon: "*",
    label: "守護",
  },
};

export function AvatarDiaryCard({ entry, className }: AvatarDiaryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const style = TONE_STYLES[entry.tone];

  return (
    <motion.button
      onClick={() => setIsExpanded(!isExpanded)}
      className={cn(
        "w-full text-left rounded-2xl bg-white/60 backdrop-blur-md border border-white/30 shadow-sm overflow-hidden transition-colors hover:bg-white/70",
        className,
      )}
      layout
    >
      {/* ヘッダー: トーンインジケーター */}
      <div className={cn("px-4 pt-4 pb-2 bg-gradient-to-r", style.gradient)}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-white/40 backdrop-blur-sm flex items-center justify-center">
            <span className="text-xs text-slate-600 font-medium">{style.icon}</span>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">
              分身の日記
            </p>
            <p className="text-[10px] text-slate-500">{style.label}</p>
          </div>
          <span className="ml-auto text-[10px] text-slate-400">
            {formatDate(entry.date)}
          </span>
        </div>
      </div>

      {/* 本文 */}
      <div className="px-4 py-3">
        <p className="text-sm text-slate-700 leading-relaxed" style={{ fontStyle: "italic" }}>
          {entry.text}
        </p>
      </div>

      {/* 展開時: 内省プロンプト */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500 leading-relaxed">
                {getReflectionPrompt(entry.tone)}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

function getReflectionPrompt(tone: AvatarDiaryTone): string {
  switch (tone) {
    case "curious":
      return "この観察について、あなた自身はどう感じますか？";
    case "contemplative":
      return "分身が見つけたパターンに、心当たりはありますか？";
    case "warm":
      return "この温かさの源は、あなたのどんな部分から来ていると思いますか？";
    case "surprised":
      return "この発見は、あなたにとって意外でしたか？";
    case "protective":
      return "あなた自身を守ることについて、最近考えたことはありますか？";
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return dateStr;
  }
}
