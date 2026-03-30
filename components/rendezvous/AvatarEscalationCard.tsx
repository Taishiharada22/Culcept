"use client";

import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type { EscalationState } from "@/lib/rendezvous/avatarLiveEngine";

// ============================================================
// AvatarEscalationCard — アバターからの「そろそろ会わせたい」提案
//
// 3日ルール:
//   Day 1-2: 表示なし
//   Day 3: 「会いに行く」or「あと1日だけ任せる」（1回限り）
//   Day 4（延長後）: 「会いに行く」or「ここで終わりにする」
//   期限切れ: 自動アーカイブ通知
// ============================================================

type Props = {
  escalation: EscalationState;
  candidateName: string;
  onBatonChange: () => void;
  onPostpone: () => void;
  onArchive: () => void;
  className?: string;
};

export function AvatarEscalationCard({
  escalation,
  candidateName,
  onBatonChange,
  onPostpone,
  onArchive,
  className = "",
}: Props) {
  if (!escalation.avatarSuggestion) return null;

  // 自動アーカイブ済み
  if (escalation.autoArchived) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={className}
      >
        <GlassCard className="p-5 text-center">
          <p className="text-sm text-gray-400 mb-2">🌙</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            {escalation.avatarSuggestion}
          </p>
        </GlassCard>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 20, stiffness: 200 }}
        className={className}
      >
        <GlassCard className="p-6 relative overflow-hidden">
          {/* 背景のグラデーション */}
          <div
            className="absolute inset-0 opacity-10 pointer-events-none"
            style={{
              background: escalation.mustDecideNow
                ? "linear-gradient(135deg, #F59E0B, #EF4444)"
                : "linear-gradient(135deg, #6366F1, #EC4899)",
            }}
          />

          {/* アバターアイコン */}
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🤖</span>
              <span className="text-xs font-medium text-gray-400">
                アバターからの提案
              </span>
              {escalation.mustDecideNow && (
                <motion.span
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="text-xs font-bold text-amber-500"
                >
                  ⚡ 最終判断
                </motion.span>
              )}
            </div>

            {/* 提案メッセージ */}
            <p className="text-sm leading-relaxed mb-5" style={{ color: "#1A1040" }}>
              「{escalation.avatarSuggestion}」
            </p>

            {/* アクションボタン */}
            <div className="flex flex-col gap-2">
              {/* メインアクション: 会いに行く */}
              <GlassButton
                onClick={onBatonChange}
                className="w-full justify-center font-bold"
              >
                ✨ {candidateName}さんと話してみたい
              </GlassButton>

              {/* セカンダリ: あと1日だけ OR 終わりにする */}
              {escalation.mustDecideNow ? (
                <button
                  onClick={onArchive}
                  className="w-full py-2.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ここで終わりにする
                </button>
              ) : !escalation.hasUsedPostpone ? (
                <button
                  onClick={onPostpone}
                  className="w-full py-2.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                >
                  あと1日だけ任せる
                </button>
              ) : null}
            </div>

            {/* 残り時間ヒント */}
            {escalation.mustDecideNow && (
              <p className="text-xs text-center text-amber-500/70 mt-3">
                今日中に選択しない場合、この出会いは自動的にアーカイブされます
              </p>
            )}
          </div>
        </GlassCard>
      </motion.div>
    </AnimatePresence>
  );
}
