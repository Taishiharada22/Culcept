"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";
import ScoreRadarChart from "./ScoreRadarChart";
import SubScoreBar from "./SubScoreBar";
import type { AvatarFittingResult } from "@/lib/avatar-fitting/types";
import type { MatchBand } from "@/lib/matchScore/index";

type Props = {
  result: AvatarFittingResult;
  imagePreview: string | null;
  evaluationId?: string;
  onFeedback?: (feedback: { userRating: number; sizeSatisfaction: number; visualSatisfaction: number; purchased: boolean }) => void;
};

const BAND_LABEL: Record<MatchBand, { text: string; color: string }> = {
  green: { text: "相性バッチリ", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  yellow: { text: "まあまあ", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  red: { text: "合わないかも", color: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
};

const CATEGORY_LABEL: Record<string, string> = {
  tops: "トップス", bottoms: "ボトムス", outer: "アウター",
  shoes: "シューズ", accessories: "アクセサリー", unknown: "不明",
};

export default function FittingResultCard({ result, imagePreview, onFeedback }: Props) {
  const [feedbackSent, setFeedbackSent] = useState(false);
  const bandInfo = BAND_LABEL[result.band];

  const handleFeedback = (rating: number) => {
    if (feedbackSent || !onFeedback) return;
    onFeedback({ userRating: rating, sizeSatisfaction: 3, visualSatisfaction: 3, purchased: false });
    setFeedbackSent(true);
  };

  return (
    <GlassCard className="space-y-5">
      <div className="flex items-start gap-4">
        {imagePreview && (
          <img src={imagePreview} alt="分析アイテム" className="h-20 w-20 rounded-xl object-cover" />
        )}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <motion.span
              className="text-3xl font-bold text-white"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
            >
              {result.overallMatch}
            </motion.span>
            <span className="text-sm text-white/40">/ 100</span>
          </div>
          <div className="flex items-center gap-2">
            <GlassBadge className={bandInfo.color}>{bandInfo.text}</GlassBadge>
            <span className="text-xs text-white/40">
              {CATEGORY_LABEL[result.extractedAttributes.category]}
            </span>
          </div>
          <p className="text-xs text-white/30">
            信頼度: {Math.round(result.confidence * 100)}%
          </p>
        </div>
      </div>

      <ScoreRadarChart
        size={result.sizeScore.adjustedScore}
        color={result.colorScore.adjustedScore}
        visual={result.visualScore.adjustedScore}
        preference={result.preferenceScore.adjustedScore}
      />

      <div className="space-y-3">
        <SubScoreBar label="サイズ感" score={result.sizeScore.score} adjustedScore={result.sizeScore.adjustedScore} reasons={result.sizeScore.reasons} delay={0} />
        <SubScoreBar label="カラー" score={result.colorScore.score} adjustedScore={result.colorScore.adjustedScore} reasons={result.colorScore.reasons} delay={0.1} />
        <SubScoreBar label="スタイル" score={result.visualScore.score} adjustedScore={result.visualScore.adjustedScore} reasons={result.visualScore.reasons} delay={0.2} />
        <SubScoreBar label="好み一致" score={result.preferenceScore.score} adjustedScore={result.preferenceScore.adjustedScore} reasons={result.preferenceScore.reasons} delay={0.3} />
      </div>

      {onFeedback && !feedbackSent && (
        <div className="border-t border-white/10 pt-4">
          <p className="mb-2 text-center text-xs text-white/40">この判定はどうでしたか？</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => handleFeedback(n)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-sm text-white/60 transition hover:bg-white/15 hover:text-white"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {feedbackSent && (
        <p className="text-center text-xs text-emerald-300/60">フィードバックを送信しました</p>
      )}
    </GlassCard>
  );
}
