"use client";

import Image, { type ImageLoader } from "next/image";
import { motion } from "framer-motion";
import type { OutfitProposal, Insight } from "../_lib/types";
import type { WardrobeItem } from "@/app/my-style/_lib/types";
import { SyncScoreRing } from "./SyncScoreDisplay";
import { SYNC_BAND_COLORS } from "../_lib/constants";
import InsightCards, { MiniInsight } from "./InsightCards";

const passthroughLoader: ImageLoader = ({ src }) => src;

const VARIANT_LABELS: Record<string, { label: string; icon: string }> = {
  main: { label: "メイン提案", icon: "✨" },
  casual: { label: "カジュアル", icon: "😎" },
  dressy: { label: "きれいめ", icon: "👔" },
  rain: { label: "雨対応", icon: "☔" },
  cold: { label: "防寒強化", icon: "🧥" },
};

/* ── 確信度算出 ── */
function computeConfidence(proposal: OutfitProposal, satisfactionDataPoints?: number): number {
  let conf = 50; // ベース
  // 満足度データ量 (0-20)
  const dp = satisfactionDataPoints ?? 0;
  conf += Math.min(20, Math.round(dp / 5) * 2);
  // SYNCスコア品質 (0-15)
  conf += Math.min(15, Math.round(proposal.sync.total / 8));
  // アイテム充実度 (0-15)
  conf += Math.min(15, proposal.items.length * 4);
  return Math.min(99, conf);
}

export default function OutfitProposalCard({
  proposal,
  isMain = false,
  onSelect,
  insights,
  morningAfternoonSplit,
  satisfactionDataPoints,
  date,
}: {
  proposal: OutfitProposal;
  isMain?: boolean;
  onSelect?: () => void;
  insights?: Insight[];
  morningAfternoonSplit?: { morningItems: WardrobeItem[]; afternoonItems: WardrobeItem[] };
  satisfactionDataPoints?: number;
  date?: string;
}) {
  const { label, icon } = VARIANT_LABELS[proposal.variant] ?? VARIANT_LABELS.main;
  const colors = SYNC_BAND_COLORS[proposal.sync.band];

  return (
    <motion.div
      className={`rounded-2xl border backdrop-blur-sm overflow-hidden ${
        isMain
          ? "bg-white/60 border-white/60 shadow-[0_8px_40px_-12px_rgba(100,80,180,0.12)]"
          : "bg-white/40 border-white/40"
      }`}
      whileHover={!isMain ? { y: -2, scale: 1.02 } : undefined}
      onClick={onSelect}
    >
      <div className="p-3.5">
        {/* ヘッダー: ラベル + SYNCリング */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-[9px] font-bold tracking-widest uppercase ${isMain ? "text-violet-500" : "text-gray-400"}`}>
              {icon} {label}
            </span>
            <span className={`text-[8px] font-bold rounded-full px-1.5 py-0.5 ${colors.bg} ${colors.text} border ${colors.border}`}>
              {proposal.moodTag}
            </span>
          </div>
          <SyncScoreRing sync={proposal.sync} size={isMain ? 48 : 36} />
        </div>

        {/* アイテムサムネイル */}
        <div className="flex gap-2 overflow-x-auto pb-1.5 -mx-0.5 px-0.5">
          {proposal.items.map((item, i) => (
            <div key={item.id || i} className="shrink-0 w-16 text-center">
              <div className={`w-16 h-16 rounded-xl border overflow-hidden shadow-sm mb-1 flex items-center justify-center ${
                isMain ? "bg-white/70 border-white/60" : "bg-white/50 border-white/40"
              }`}>
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl} alt={item.name} width={64} height={64}
                    className="w-full h-full object-contain p-1"
                    loader={passthroughLoader} unoptimized
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-0.5">
                    <div className="w-6 h-1 rounded-full" style={{ backgroundColor: item.colorHex || item.color || "#888", opacity: 0.6 }} />
                    <span className="text-lg text-gray-300">
                      {item.category === "tops" ? "👕" : item.category === "bottoms" ? "👖" : item.category === "shoes" ? "👟" : item.category === "outerwear" ? "🧥" : "👔"}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-[7px] text-gray-500 truncate">{item.name}</p>
            </div>
          ))}
        </div>

        {/* 朝/午後分割 */}
        {isMain && morningAfternoonSplit && (
          <div className="mt-2 space-y-1.5">
            <div className="rounded-xl bg-gradient-to-r from-amber-50/60 to-orange-50/40 border border-amber-200/30 px-3 py-2">
              <p className="text-[9px] font-bold text-amber-600 mb-1">🌅 朝の構成</p>
              <div className="flex gap-1.5">
                {morningAfternoonSplit.morningItems.map((item, i) => (
                  <span key={i} className="text-[9px] text-amber-700 bg-amber-100/60 rounded-full px-2 py-0.5">
                    {item.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-gradient-to-r from-cyan-50/60 to-blue-50/40 border border-cyan-200/30 px-3 py-2">
              <p className="text-[9px] font-bold text-cyan-600 mb-1">☀️ 午後の構成</p>
              <div className="flex gap-1.5">
                {morningAfternoonSplit.afternoonItems.map((item, i) => (
                  <span key={i} className="text-[9px] text-cyan-700 bg-cyan-100/60 rounded-full px-2 py-0.5">
                    {item.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* インサイト or 理由 */}
        {isMain && insights && insights.length > 0 ? (
          <div className="mt-2">
            <InsightCards insights={insights} date={date} />
          </div>
        ) : isMain && proposal.reason ? (
          <div className="mt-2 rounded-xl bg-gray-50/50 px-3 py-2">
            <p className="text-[10px] text-gray-500 leading-relaxed">{proposal.reason}</p>
          </div>
        ) : null}

        {/* 代替提案のミニインサイト */}
        {!isMain && insights && insights.length > 0 && (
          <div className="mt-1.5">
            <MiniInsight insight={insights[0]} />
          </div>
        )}

        {/* 確信度 */}
        {isMain && (
          <div className="mt-2 flex items-center justify-end gap-1">
            <span className="text-[8px] text-gray-400">確信度</span>
            <span className="text-[9px] font-bold text-violet-500">
              {computeConfidence(proposal, satisfactionDataPoints)}%
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
