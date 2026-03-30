"use client";

import * as React from "react";
import { motion } from "framer-motion";
import type {
  ConditionStyleHint,
  ItemRotationProfile,
} from "../_lib/deepTemporalIntelligence";

interface DeepTemporalCardProps {
  conditionHint: ConditionStyleHint | null;
  rotationHighlights: ItemRotationProfile[];
  seasonalShift: string | null;
  itemNameMap: Map<string, string>;
}

export default function DeepTemporalCard({
  conditionHint,
  rotationHighlights,
  seasonalShift,
  itemNameMap,
}: DeepTemporalCardProps) {
  const hasContent = (conditionHint && conditionHint.confidence > 0) ||
    rotationHighlights.length > 0 ||
    seasonalShift;

  if (!hasContent) return null;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-white/40 to-indigo-50/20 backdrop-blur-xl border border-white/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">🧠</span>
        <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Deep Learning</span>
        <span className="text-[8px] text-gray-300 ml-auto">あなたのパターンから</span>
      </div>

      <div className="space-y-2.5">
        {/* 条件付きスタイルヒント */}
        {conditionHint && conditionHint.confidence > 0 && conditionHint.reason && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl bg-violet-50/40 border border-violet-200/30 px-3 py-2"
          >
            <div className="flex items-start gap-2">
              <span className="text-xs mt-0.5">🔮</span>
              <div>
                <p className="text-[9px] font-bold text-violet-600 mb-0.5">条件付き学習</p>
                <p className="text-[10px] text-gray-600 leading-relaxed">{conditionHint.reason}</p>
                {conditionHint.avoidTags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {conditionHint.avoidTags.map(tag => (
                      <span key={tag} className="text-[8px] text-amber-600 bg-amber-50/60 rounded-full px-1.5 py-0.5 border border-amber-200/30">
                        ⚠️ {tag}が多い
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ローテーション最適化 */}
        {rotationHighlights.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-xl bg-emerald-50/40 border border-emerald-200/30 px-3 py-2"
          >
            <div className="flex items-start gap-2">
              <span className="text-xs mt-0.5">🔄</span>
              <div className="flex-1">
                <p className="text-[9px] font-bold text-emerald-600 mb-1">ローテーション最適化</p>
                <div className="space-y-1">
                  {rotationHighlights.map((rp, i) => {
                    const name = itemNameMap.get(rp.itemId) ?? rp.itemId.slice(0, 8);
                    const statusLabel =
                      rp.status === "overdue" ? `${rp.currentDaysSinceWorn}日未着用 → 今日着る好機` :
                      rp.status === "optimal" ? `最適タイミング（${rp.optimalInterval}日周期）` :
                      rp.status === "never_worn" ? "未着用アイテム → 試してみては？" :
                      "最近着用済み";
                    const statusColor =
                      rp.status === "overdue" ? "text-orange-500" :
                      rp.status === "optimal" ? "text-emerald-500" :
                      rp.status === "never_worn" ? "text-violet-500" :
                      "text-gray-400";
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-gray-600 truncate max-w-[100px]">{name}</span>
                        <span className={`text-[8px] ${statusColor}`}>{statusLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* 季節スタイルシフト */}
        {seasonalShift && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-xl bg-amber-50/40 border border-amber-200/30 px-3 py-2"
          >
            <div className="flex items-start gap-2">
              <span className="text-xs mt-0.5">🌸</span>
              <div>
                <p className="text-[9px] font-bold text-amber-600 mb-0.5">季節パターン</p>
                <p className="text-[10px] text-gray-600 leading-relaxed">{seasonalShift}</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
