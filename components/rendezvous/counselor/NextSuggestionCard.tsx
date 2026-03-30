"use client";

import { motion } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  GlassButton,
  Avatar,
  ProgressRing,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import CounselorMessage from "./CounselorMessage";
import type { NextSuggestion } from "@/lib/rendezvous/counselor/types";

interface NextSuggestionCardProps {
  suggestion: NextSuggestion;
  onAccept: () => void;
  onSkip: () => void;
}

export default function NextSuggestionCard({
  suggestion,
  onAccept,
  onSkip,
}: NextSuggestionCardProps) {
  const { card, whyThisPerson, addressesTendency, counselorMessage } =
    suggestion;

  return (
    <div className="space-y-4">
      {/* カウンセラーメッセージ */}
      <CounselorMessage message={counselorMessage} />

      {/* 候補カード */}
      <FadeInView delay={0.3} direction="up">
        <GlassCard padding="none" hoverEffect={false}>
          <div className="p-5 space-y-4">
            {/* 候補のプロフィール */}
            <div className="flex items-center gap-4">
              <Avatar
                src={card.counterpart.avatarUrl ?? undefined}
                fallback={card.counterpart.displayName.charAt(0)}
                size="lg"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">
                  {card.counterpart.displayName}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <GlassBadge variant="info" size="sm">
                    {card.label}
                  </GlassBadge>
                </div>
              </div>
              <ProgressRing progress={card.syncPercent} size={56} strokeWidth={5}>
                <span className="text-xs font-bold text-slate-700">
                  {card.syncPercent}%
                </span>
              </ProgressRing>
            </div>

            {/* この人が合う理由 */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500">
                おすすめの理由
              </p>
              <p className="text-sm leading-relaxed text-slate-700">
                {whyThisPerson}
              </p>
            </div>

            {/* 傾向への対応（ハイライト） */}
            <div className="rounded-xl bg-gradient-to-br from-indigo-50/70 to-purple-50/50 border border-indigo-100/50 px-4 py-3">
              <p className="text-sm leading-relaxed text-indigo-700">
                {addressesTendency}
              </p>
            </div>

            {/* アクション */}
            <div className="flex gap-3 pt-1">
              <GlassButton
                variant="ghost"
                onClick={onSkip}
                className="flex-1"
              >
                今はいい
              </GlassButton>
              <GlassButton
                variant="gradient"
                onClick={onAccept}
                className="flex-1"
              >
                会ってみる
              </GlassButton>
            </div>
          </div>
        </GlassCard>
      </FadeInView>
    </div>
  );
}
