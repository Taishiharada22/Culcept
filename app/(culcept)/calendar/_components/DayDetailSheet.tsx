"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { DayData, DayProposal, WornRecord } from "../_lib/types";
import type { WardrobeItem } from "@/app/my-style/_lib/types";
import { EVENT_ICONS, DAILY_WEATHER_ICONS } from "../_lib/constants";
import type { EventContext, WeatherContext } from "../_lib/vcTypes";
import SyncScoreDisplay from "./SyncScoreDisplay";
import OutfitProposalCard from "./OutfitProposalCard";
import RiskWarningList from "./RiskWarningList";
import WornRecordForm from "./WornRecordForm";
import VisualCoordinatePanel from "./VisualCoordinatePanel";
import RegretIndicator from "./RegretIndicator";
import MaterialWeatherHint from "./MaterialWeatherHint";
import OutfitDnaCard from "./OutfitDnaCard";
import type { RegretPrediction } from "../_lib/regretPredictor";
import type { ExtendedWeatherContext } from "../_lib/materialWeather";
import type { OutfitDnaVector } from "../_lib/outfitDna";
import type { SubstitutionResult } from "../_lib/itemSubstitution";
import type { ConditionStyleHint, ItemRotationProfile } from "../_lib/deepTemporalIntelligence";
import ABComparisonCard from "./ABComparisonCard";
import DeepTemporalCard from "./DeepTemporalCard";

type DetailTab = "proposal" | "coordinate";

interface DayDetailSheetProps {
  day: DayData;
  proposal: DayProposal | null;
  wornRecord: WornRecord | null;
  wardrobeItems: WardrobeItem[];
  onClose: () => void;
  onSaveWornRecord: (record: WornRecord) => void;
  regretPrediction?: RegretPrediction | null;
  extWeather?: ExtendedWeatherContext | null;
  outfitDna?: OutfitDnaVector | null;
  styleCentroid?: OutfitDnaVector | null;
  adventureScore?: number | null;
  substitutions?: SubstitutionResult | null;
  conditionHint?: ConditionStyleHint | null;
  rotationHighlights?: ItemRotationProfile[];
  seasonalShift?: string | null;
}

export default function DayDetailSheet({
  day,
  proposal,
  wornRecord,
  wardrobeItems,
  onClose,
  onSaveWornRecord,
  regretPrediction,
  extWeather,
  outfitDna,
  styleCentroid,
  adventureScore,
  substitutions,
  conditionHint,
  rotationHighlights,
  seasonalShift,
}: DayDetailSheetProps) {
  const [activeTab, setActiveTab] = React.useState<DetailTab>(proposal ? "proposal" : "coordinate");

  const daily = day.weather_daily;
  const weatherEmoji = daily ? DAILY_WEATHER_ICONS[daily.weather_icon] ?? "🌤️" : null;

  const tabs: Array<{ key: DetailTab; label: string }> = [
    { key: "proposal", label: "提案" },
    { key: "coordinate", label: "コーデ" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/20 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[32px] bg-white/90 backdrop-blur-2xl border-t border-white/60 shadow-[0_-20px_80px_-10px_rgba(80,60,160,0.15)]"
        onClick={e => e.stopPropagation()}
      >
        {/* ドラッグハンドル */}
        <div className="sticky top-0 z-10 pt-3 pb-2 bg-white/90 backdrop-blur-xl rounded-t-[32px]">
          <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto" />
        </div>

        <div className="px-5 pb-8 max-w-lg mx-auto">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-black text-gray-800 tracking-tight">
                {new Date(day.date).toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}
              </h3>
              {day.events.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {day.events.map(e => (
                    <span key={e.id} className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 bg-violet-50/80 border border-violet-200/50 rounded-full px-2 py-0.5 backdrop-blur-sm">
                      {EVENT_ICONS[e.event_type] ?? "📌"} {e.event_name || e.event_type}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {daily && (
              <div className="text-right shrink-0">
                <span className="text-4xl">{weatherEmoji}</span>
                <p className="text-sm font-bold text-gray-700 mt-0.5">
                  {daily.temp_min ?? "-"}°/{daily.temp_max ?? "-"}°
                </p>
              </div>
            )}
          </div>

          {/* タブ */}
          <div className="flex items-center gap-1.5 mb-5 bg-gray-100/60 rounded-2xl p-1 backdrop-blur-sm">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                  activeTab === tab.key ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"
                }`}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* 提案タブ */}
          {activeTab === "proposal" && (
            <div className="space-y-4">
              {proposal ? (
                <>
                  {/* メイン提案 */}
                  <OutfitProposalCard
                    proposal={proposal.main}
                    isMain
                    insights={proposal.insights}
                    morningAfternoonSplit={proposal.morningAfternoonSplit}
                    date={day.date}
                  />

                  {/* 提案カード下 CTA */}
                  <Link href="/my-style?tab=closet"
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-50/60 to-indigo-50/40 border border-violet-200/30 px-3.5 py-2.5 no-underline hover:from-violet-50/80 hover:to-indigo-50/60 transition">
                    <span className="text-sm">✨</span>
                    <span className="text-[11px] font-bold text-violet-600">アイテムを追加して提案の精度を上げる</span>
                    <svg className="w-3.5 h-3.5 text-violet-400 ml-auto shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </Link>

                  {/* 体感温度・湿度・風速ヒント */}
                  {extWeather && <MaterialWeatherHint extWeather={extWeather} />}

                  {/* SYNCスコア詳細 */}
                  <SyncScoreDisplay sync={proposal.main.sync} />

                  {/* 後悔予測 */}
                  {regretPrediction && regretPrediction.level !== "safe" && (
                    <RegretIndicator prediction={regretPrediction} />
                  )}

                  {/* リスク警告 */}
                  {proposal.main.risks.length > 0 && (
                    <RiskWarningList risks={proposal.main.risks} />
                  )}

                  {/* Outfit DNA */}
                  {outfitDna && (
                    <OutfitDnaCard
                      dna={outfitDna}
                      centroid={styleCentroid}
                      adventureScore={adventureScore ?? undefined}
                    />
                  )}

                  {/* 深層時系列インテリジェンス */}
                  <DeepTemporalCard
                    conditionHint={conditionHint ?? null}
                    rotationHighlights={rotationHighlights ?? []}
                    seasonalShift={seasonalShift ?? null}
                    itemNameMap={new Map(wardrobeItems.map(w => [w.id, w.name ?? w.category ?? ""]))}
                  />

                  {/* A/B比較選択 */}
                  {proposal.alternatives.length > 0 && (
                    <ABComparisonCard
                      date={day.date}
                      proposalA={proposal.main}
                      proposalB={proposal.alternatives[0]}
                      onChoice={() => {/* 学習は内部で自動記録 */}}
                    />
                  )}

                  {/* 代替提案 */}
                  {substitutions && substitutions.hasAlternatives && (
                    <div className="rounded-2xl bg-white/30 backdrop-blur-xl border border-white/40 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">🔄</span>
                        <span className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Item Swap</span>
                      </div>
                      <div className="space-y-2">
                        {substitutions.substitutions.map((sub, i) => (
                          <div key={i} className="flex items-center gap-2 rounded-xl bg-white/50 border border-white/40 p-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] text-gray-400 truncate">{sub.original.name ?? sub.original.category}</p>
                              <p className="text-[10px] font-bold text-gray-600">→ {sub.substitute.name ?? sub.substitute.category}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className={`text-[9px] font-bold ${sub.syncImpact > 0 ? "text-emerald-500" : sub.syncImpact < 0 ? "text-red-400" : "text-gray-400"}`}>
                                SYNC {sub.syncImpact > 0 ? "+" : ""}{sub.syncImpact}
                              </span>
                              <p className="text-[8px] text-gray-400">{sub.reason}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 代替提案 */}
                  {proposal.alternatives.length > 0 && (
                    <div>
                      <p className="text-[9px] font-bold tracking-widest text-gray-400 uppercase mb-2">Alternatives</p>
                      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                        {proposal.alternatives.map(alt => (
                          <div key={alt.id} className="shrink-0 w-[260px]">
                            <OutfitProposalCard proposal={alt} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 着用記録 */}
                  <WornRecordForm
                    date={day.date}
                    proposedItems={proposal.main.items}
                    existingRecord={wornRecord}
                    onSave={onSaveWornRecord}
                  />

                  {/* My-Style 導線 */}
                  <div className="flex gap-2 mt-2">
                    <Link href="/my-style?tab=closet"
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white/50 backdrop-blur-sm border border-white/50 px-3 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-white/80 transition no-underline">
                      <span>👗</span> ワードローブを編集
                    </Link>
                    <Link href="/my-style?tab=me"
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white/50 backdrop-blur-sm border border-white/50 px-3 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-white/80 transition no-underline">
                      <span>🧬</span> スタイルDNA
                    </Link>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl bg-gray-50/50 border border-gray-200/30 p-6 text-center">
                  {wardrobeItems.length === 0 ? (
                    <>
                      <p className="text-4xl mb-3">👗</p>
                      <p className="text-sm text-gray-500 mb-3">ワードローブを登録してコーデ提案を受けましょう</p>
                      <Link href="/my-style" className="inline-block rounded-full bg-gray-800 text-white px-5 py-2 text-xs font-bold hover:bg-gray-700 transition no-underline">
                        My Styleへ
                      </Link>
                    </>
                  ) : (
                    <>
                      <p className="text-4xl mb-3">📐</p>
                      <p className="text-sm text-gray-500">この日の提案を生成できません</p>
                      <p className="text-[10px] text-gray-400 mt-1">トップス・ボトムス・靴の登録が必要です</p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* コーデタブ（Visual Coordinate） */}
          {activeTab === "coordinate" && (
            <div className="-mx-5">
              <VisualCoordinatePanel
                date={day.date}
                events={day.events.map((e): EventContext => ({
                  id: e.id,
                  title: e.event_name || e.event_type,
                  type: (e.event_type as EventContext["type"]) || "errand",
                  startAt: `${day.date}T10:00:00`,
                }))}
                weather={daily ? {
                  tempC: daily.temp_max ?? undefined,
                  condition: daily.weather_icon === "rain" ? "rain"
                    : daily.weather_icon === "snow" ? "snow"
                    : daily.weather_icon === "cloud" ? "cloudy"
                    : "sunny",
                } as WeatherContext : undefined}
                inventory={wardrobeItems}
              />
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
