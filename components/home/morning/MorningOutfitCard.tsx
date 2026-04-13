"use client";

/**
 * MorningOutfitCard — プランに基づくコーデ提案カード
 *
 * Alter の会話内にインラインで表示される。
 * - 5スロット縦並び（accessory / outer / top / bottom / shoes）
 * - 各スロットでスワイプして候補を切り替え
 * - Intent バッジ表示
 * - ワードローブ未登録時は My-Style への案内
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { MorningPlan } from "@/lib/alter-morning/types";
import {
  generateOutfitFromPlan,
  type OutfitBridgeResult,
} from "@/lib/alter-morning/outfitBridge";
import type { WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";
import type { Slot } from "@/app/(culcept)/calendar/_lib/vcTypes";
import type { ScoredCandidate } from "@/app/(culcept)/calendar/_lib/vcCandidates";
import { loadWardrobeFromLocal } from "@/lib/shared/wardrobe";
import Image, { type ImageLoader } from "next/image";

const passthroughLoader: ImageLoader = ({ src }) => src;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Props
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MorningOutfitCardProps {
  plan: MorningPlan;
  weather?: {
    tempMax: number | null;
    tempMin: number | null;
    condition: "sunny" | "cloudy" | "rain" | "snow";
    pop: number | null;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// スロット表示名
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SLOT_LABELS: Record<Slot, string> = {
  accessory: "小物",
  outer: "アウター",
  top: "トップス",
  bottom: "ボトムス",
  shoes: "シューズ",
};

const SLOT_ORDER: Slot[] = ["accessory", "outer", "top", "bottom", "shoes"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ミニスロットレーン（コンパクト版）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function MiniSlotLane({
  slot,
  candidates,
}: {
  slot: Slot;
  candidates: ScoredCandidate[];
}) {
  const [index, setIndex] = useState(0);

  if (candidates.length === 0) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <span className="text-[11px] text-gray-400 w-[52px] flex-shrink-0">
          {SLOT_LABELS[slot]}
        </span>
        <div className="flex-1 h-[64px] rounded-lg bg-gray-50/50 flex items-center justify-center text-[11px] text-gray-300">
          候補なし
        </div>
      </div>
    );
  }

  const current = candidates[index].item;
  const goLeft = () => setIndex((i) => Math.max(0, i - 1));
  const goRight = () => setIndex((i) => Math.min(candidates.length - 1, i + 1));

  return (
    <div className="flex items-center gap-2 py-1">
      {/* スロットラベル */}
      <span className="text-[11px] text-gray-400 w-[52px] flex-shrink-0 text-right">
        {SLOT_LABELS[slot]}
      </span>

      {/* アイテムカード */}
      <div className="relative flex-1">
        <div className="flex items-center gap-1.5">
          {/* 左矢印 */}
          {candidates.length > 1 && (
            <button
              onClick={goLeft}
              disabled={index === 0}
              className="w-5 h-5 rounded-full bg-white/70 shadow-sm flex items-center justify-center text-[10px] text-gray-400 disabled:opacity-30 flex-shrink-0"
            >
              ‹
            </button>
          )}

          {/* メインカード */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2 flex-1 min-w-0 bg-white/60 rounded-lg px-2 py-1.5 border border-white/50"
            >
              {/* サムネイル */}
              <div className="w-[48px] h-[48px] rounded-md bg-gradient-to-br from-gray-50 to-gray-100/50 flex-shrink-0 overflow-hidden relative">
                {current.imageUrl ? (
                  <Image
                    loader={passthroughLoader}
                    src={current.imageUrl}
                    alt={current.name}
                    fill
                    className="object-contain p-1"
                    sizes="48px"
                    unoptimized
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-300 text-lg">
                    👕
                  </div>
                )}
              </div>

              {/* アイテム名 */}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-gray-700 truncate">{current.name}</p>
                {current.colorName && (
                  <p className="text-[10px] text-gray-400">{current.colorName}</p>
                )}
              </div>

              {/* インデックス */}
              {candidates.length > 1 && (
                <span className="text-[9px] text-gray-300 flex-shrink-0">
                  {index + 1}/{candidates.length}
                </span>
              )}
            </motion.div>
          </AnimatePresence>

          {/* 右矢印 */}
          {candidates.length > 1 && (
            <button
              onClick={goRight}
              disabled={index === candidates.length - 1}
              className="w-5 h-5 rounded-full bg-white/70 shadow-sm flex items-center justify-center text-[10px] text-gray-400 disabled:opacity-30 flex-shrink-0"
            >
              ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// メインコンポーネント
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function MorningOutfitCard({
  plan,
  weather,
}: MorningOutfitCardProps) {
  const [result, setResult] = useState<OutfitBridgeResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const wardrobe = loadWardrobeFromLocal();
    const bridgeResult = generateOutfitFromPlan(plan, wardrobe, weather);
    setResult(bridgeResult);
    setLoading(false);
  }, [plan, weather]);

  if (loading) {
    return (
      <GlassCard className="mx-0 mt-3 mb-2">
        <div className="flex items-center justify-center py-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-5 h-5 border-2 border-purple-300 border-t-transparent rounded-full"
          />
          <span className="ml-2 text-[12px] text-gray-400">コーデを考え中...</span>
        </div>
      </GlassCard>
    );
  }

  if (!result) {
    return null;
  }

  // ワードローブ未登録
  if (result.noWardrobe) {
    return (
      <GlassCard className="mx-0 mt-3 mb-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="text-center py-4">
            <p className="text-[13px] text-gray-600 mb-2">
              服を登録すると、予定に合わせたコーデを提案できるよ
            </p>
            <a
              href="/my-style"
              className="inline-block px-4 py-2 rounded-xl bg-purple-500/90 text-white text-[12px] font-medium hover:bg-purple-600/90 transition-all"
            >
              My Style で登録する
            </a>
          </div>

          {/* バッジだけ表示（今日求められるスタイル） */}
          {result.badges.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center mt-2 pb-1">
              {result.badges.map((badge, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50/80 text-purple-500 border border-purple-200/40"
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="mx-0 mt-3 mb-2">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[14px] font-semibold text-gray-800 flex items-center gap-1.5">
            👗 今日のコーデ
          </h3>
          <a
            href="/calendar"
            className="text-[10px] text-purple-500 hover:text-purple-600"
          >
            詳しく見る →
          </a>
        </div>

        {/* Intent バッジ */}
        {result.badges.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {result.badges.map((badge, i) => (
              <span
                key={i}
                className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50/80 text-purple-500 border border-purple-200/40"
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}

        {/* 5スロット */}
        <div className="space-y-0">
          {SLOT_ORDER.map((slot) => (
            <MiniSlotLane
              key={slot}
              slot={slot}
              candidates={result.candidates[slot]}
            />
          ))}
        </div>

        {/* SYNCスコア + 理由 */}
        {result.syncScore && (
          <div className="mt-2 pt-2 border-t border-white/30">
            <div className="flex items-center gap-2">
              <span className={`text-[16px] font-bold ${
                result.syncScore.band === "excellent" ? "text-emerald-600" :
                result.syncScore.band === "good" ? "text-purple-600" :
                result.syncScore.band === "caution" ? "text-amber-600" :
                "text-red-500"
              }`}>
                SYNC {result.syncScore.total}
              </span>
              <span className="text-[10px] text-gray-400">/ 100</span>
            </div>
            {result.syncScore.reasons.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {result.syncScore.reasons.slice(0, 2).map((reason, i) => (
                  <p key={i} className="text-[10px] text-gray-500">{reason}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* フッター */}
        <div className="mt-2 text-center">
          <span className="text-[10px] text-gray-400">
            スワイプで候補を変更 ・ 詳細は Calendar で
          </span>
        </div>
      </motion.div>
    </GlassCard>
  );
}
