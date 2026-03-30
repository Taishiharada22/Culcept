"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  RvGlowCard,
  RvButton,
  RvBadge,
  RV_COLORS,
  RV_CATEGORY_COLORS,
  type RvCategory,
} from "@/components/ui/rendezvous-design";

// =============================================================================
// DailyTopicCard — ホーム画面のお題カード
// =============================================================================

export type DailyTopicData = {
  id: string;
  prompt: string;
  subtext?: string | null;
  category: string;
  myAnswer: { id: string; text: string } | null;
  answerCount: number;
};

export function DailyTopicCard({ topic }: { topic: DailyTopicData }) {
  const router = useRouter();
  const isAnswered = !!topic.myAnswer;
  const cat = topic.category as RvCategory;
  const catColor = RV_CATEGORY_COLORS[cat] ?? RV_COLORS.primary;

  return (
    <RvGlowCard
      gradient={`linear-gradient(135deg, ${catColor} 0%, ${RV_COLORS.accent} 100%)`}
      onClick={() => {
        if (isAnswered) {
          router.push(`/rendezvous/topic/gallery?topicId=${topic.id}&category=${topic.category}`);
        } else {
          router.push(`/rendezvous/topic?category=${topic.category}`);
        }
      }}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wider" style={{ color: RV_COLORS.textMuted }}>
            TODAY&apos;S TOPIC
          </span>
          {cat !== ("general" as RvCategory) && <RvBadge category={cat} />}
        </div>
        {topic.answerCount > 0 && (
          <span className="text-xs" style={{ color: RV_COLORS.textSub }}>
            {topic.answerCount}人が回答
          </span>
        )}
      </div>

      {/* お題テキスト */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="text-base font-bold leading-relaxed mb-1"
        style={{ color: RV_COLORS.text }}
      >
        {topic.prompt}
      </motion.p>

      {topic.subtext && (
        <p className="text-xs mb-4" style={{ color: RV_COLORS.textMuted }}>
          {topic.subtext}
        </p>
      )}

      {/* CTA */}
      <div className="mt-4">
        {isAnswered ? (
          <div className="flex items-center justify-between">
            <p className="text-xs truncate max-w-[60%]" style={{ color: RV_COLORS.textSub }}>
              あなたの回答: 「{topic.myAnswer!.text.slice(0, 30)}
              {topic.myAnswer!.text.length > 30 ? "…" : ""}」
            </p>
            <RvButton variant="secondary" className="text-xs !px-4 !py-2">
              ギャラリーを見る
            </RvButton>
          </div>
        ) : (
          <RvButton variant="glow" className="w-full">
            今日のお題に答える
          </RvButton>
        )}
      </div>
    </RvGlowCard>
  );
}
