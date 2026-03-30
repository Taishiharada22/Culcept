"use client";

import { motion } from "framer-motion";
import type { MatchBand } from "@/lib/matchScore/index";

type Props = {
  comment: string;
  band: MatchBand;
  userName?: string;
};

const BAND_COLORS: Record<MatchBand, string> = {
  green: "border-emerald-400/30 bg-emerald-500/10",
  yellow: "border-amber-400/30 bg-amber-500/10",
  red: "border-rose-400/30 bg-rose-500/10",
};

const BAND_EMOJI: Record<MatchBand, string> = {
  green: "😊",
  yellow: "🤔",
  red: "😅",
};

export default function AvatarCommentBubble({ comment, band, userName }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4 }}
      className={`relative rounded-2xl border p-4 ${BAND_COLORS[band]}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl">
          {BAND_EMOJI[band]}
        </div>
        <div>
          {userName && (
            <p className="text-xs font-medium text-white/40">{userName}さんの分身より</p>
          )}
          <p className="mt-0.5 text-sm leading-relaxed text-white/90">{comment || "判定中..."}</p>
        </div>
      </div>
      <div className="absolute -bottom-2 left-8 h-4 w-4 rotate-45 border-b border-r border-inherit bg-inherit" />
    </motion.div>
  );
}
