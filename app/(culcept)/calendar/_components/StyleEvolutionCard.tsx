"use client";

import { motion } from "framer-motion";
import type { WornRecord } from "../_lib/types";

interface Props {
  currentMonthRecords: WornRecord[];
  previousMonthRecords: WornRecord[];
}

export default function StyleEvolutionCard({ currentMonthRecords, previousMonthRecords }: Props) {
  if (currentMonthRecords.length < 3) return null;

  // 平均満足度の比較
  const currentAvg = currentMonthRecords.reduce((a, r) => a + r.satisfaction, 0) / currentMonthRecords.length;
  const prevAvg = previousMonthRecords.length > 0
    ? previousMonthRecords.reduce((a, r) => a + r.satisfaction, 0) / previousMonthRecords.length
    : null;
  const satDiff = prevAvg ? currentAvg - prevAvg : null;

  // ユニークアイテム数
  const currentUniqueItems = new Set(currentMonthRecords.flatMap(r => r.itemIds)).size;
  const prevUniqueItems = previousMonthRecords.length > 0
    ? new Set(previousMonthRecords.flatMap(r => r.itemIds)).size
    : null;

  // タグ分析
  const tagCounts: Record<string, number> = {};
  for (const record of currentMonthRecords) {
    if (!record.note) continue;
    const tags = record.note.match(/\[(.+?)\]/g);
    if (tags) {
      for (const tag of tags) {
        const clean = tag.replace(/[[\]]/g, "");
        tagCounts[clean] = (tagCounts[clean] ?? 0) + 1;
      }
    }
  }
  const topTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];

  // インサイトメッセージ生成
  const insights: string[] = [];

  if (satDiff !== null && Math.abs(satDiff) >= 0.3) {
    if (satDiff > 0) {
      insights.push(`満足度が先月比 +${satDiff.toFixed(1)} 改善しています`);
    } else {
      insights.push(`満足度が先月比 ${satDiff.toFixed(1)}。天気や予定の影響かも`);
    }
  }

  if (prevUniqueItems && currentUniqueItems > prevUniqueItems) {
    insights.push(`今月は${currentUniqueItems}種のアイテムを活用。バリエーションが広がっています`);
  }

  if (topTag && topTag[1] >= 3) {
    insights.push(`「${topTag[0]}」の記録が${topTag[1]}回。次月の参考にします`);
  }

  if (insights.length === 0) {
    insights.push(`今月は${currentMonthRecords.length}日分の着用記録。データが溜まるほど提案が賢くなります`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-br from-indigo-50/50 to-violet-50/50 border border-indigo-200/30 backdrop-blur-sm p-3"
    >
      <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-2">
        📈 スタイル進化
      </p>

      <div className="grid grid-cols-3 gap-2 mb-2">
        {/* 着用日数 */}
        <div className="text-center">
          <p className="text-lg font-black text-indigo-600">{currentMonthRecords.length}</p>
          <p className="text-[8px] text-gray-400">着用記録</p>
        </div>
        {/* 平均満足度 */}
        <div className="text-center">
          <p className="text-lg font-black text-violet-600">{currentAvg.toFixed(1)}</p>
          <p className="text-[8px] text-gray-400">
            平均満足度
            {satDiff !== null && satDiff > 0 && <span className="text-emerald-500 ml-0.5">↑</span>}
            {satDiff !== null && satDiff < 0 && <span className="text-rose-400 ml-0.5">↓</span>}
          </p>
        </div>
        {/* アイテム多様性 */}
        <div className="text-center">
          <p className="text-lg font-black text-blue-600">{currentUniqueItems}</p>
          <p className="text-[8px] text-gray-400">活用アイテム</p>
        </div>
      </div>

      {/* インサイト */}
      <div className="space-y-1">
        {insights.map((text, i) => (
          <p key={i} className="text-[9px] text-gray-600 flex items-start gap-1">
            <span className="text-violet-400 shrink-0">·</span>
            {text}
          </p>
        ))}
      </div>
    </motion.div>
  );
}
