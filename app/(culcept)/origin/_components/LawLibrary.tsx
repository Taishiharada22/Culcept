"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DailyOrbitStore, OrbitLaw } from "@/lib/origin/dailyOrbit/types";
import { loadOrbitStoreWithSync, todayKey } from "@/lib/origin/dailyOrbit/store";
import { discoverOrbitLaws } from "@/lib/origin/dailyOrbit/insightEngine";
import { generateBehavioralLaws, type GeneratedLaw } from "@/lib/origin/dailyOrbit/behavioralLawEngine";
import { ORIGIN_MOTION } from "@/lib/origin/dailyOrbit/animations";
import OriginEmptyState from "./OriginEmptyState";

const LAW_TIER_META = {
  early: { label: "初期法則", emoji: "🌱", color: "from-emerald-50/60 to-green-50/40" },
  mature: { label: "成熟法則", emoji: "🌳", color: "from-amber-50/60 to-orange-50/40" },
  legacy: { label: "行動傾向", emoji: "🔍", color: "from-gray-50/60 to-white/40" },
};

const CATEGORY_LABELS: Record<string, string> = {
  weather_completion: "天気×完了",
  texture_next_day: "感触→翌日",
  emotion_next_day: "感情→翌日",
  carry_outcome: "持越し結果",
  weekday_completion: "曜日×完了",
  weekday_texture: "曜日×感触",
  weekly_rhythm: "週リズム",
  nature_pattern: "本性パターン",
  texture_pattern: "感触パターン",
  body_correlation: "身体×行動",
  time_pattern: "時間帯",
  energy_behavior: "エネルギー",
  shadow_theme: "影の意図",
  temporal_self: "時間的自己",
  not_doing_value: "やらなかった価値",
  contradiction: "矛盾",
};

export default function LawLibrary() {
  const [store, setStore] = useState<DailyOrbitStore | null>(null);
  const [behavioralLaws, setBehavioralLaws] = useState<GeneratedLaw[]>([]);
  const [orbitLaws, setOrbitLaws] = useState<OrbitLaw[]>([]);
  const [expandedLawId, setExpandedLawId] = useState<string | null>(null);

  const today = todayKey();

  useEffect(() => {
    (async () => {
      const loaded = await loadOrbitStoreWithSync();
      if (!loaded) return;
      setStore(loaded);
      try {
        const bLaws = generateBehavioralLaws(loaded);
        setBehavioralLaws(bLaws);
      } catch {}
      try {
        const laws = discoverOrbitLaws(loaded, today);
        setOrbitLaws(laws);
      } catch {}
    })();
  }, [today]);

  const totalLaws = behavioralLaws.length + orbitLaws.length;
  const dayCount = store?.firstUsedAt
    ? Math.floor((Date.now() - new Date(store.firstUsedAt).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;

  if (totalLaws === 0) {
    return (
      <div className="rounded-2xl bg-white/50 p-4">
        <p className="text-xs font-medium text-gray-500">📖 あなたの取扱説明書</p>
        <OriginEmptyState
          variant={dayCount < 14 ? "in-progress" : "no-data"}
          message={
            dayCount < 14
              ? `あと${Math.max(0, 14 - dayCount)}日分のデータで最初の法則が見えてきます`
              : "データを分析中。もう少し記録を続けると法則が見えてきます"
          }
          daysUntil={Math.max(0, 14 - dayCount)}
          totalDays={14}
        />
        {/* Blurred example law */}
        <div className="relative mt-3 overflow-hidden rounded-xl">
          <div className="pointer-events-none select-none blur-[1px]">
            <div className="rounded-xl bg-gradient-to-r from-emerald-50/60 to-green-50/40 px-3 py-2.5 opacity-40">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-sm">🌱</span>
                <div className="flex-1">
                  <p className="text-xs leading-relaxed text-gray-700">
                    あなたは「晴れ」の日に完了率が高い傾向がある
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-white/50">
                      <div className="h-full w-3/4 rounded-full bg-amber-400" />
                    </div>
                    <span className="text-[9px] text-gray-500">確信度 75%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400">
            これは法則の例です
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500">📖 あなたの取扱説明書</p>
        <span className="text-[10px] text-gray-400">{totalLaws}つの法則</span>
      </div>

      {/* Behavioral Laws (type-based, high quality) */}
      {behavioralLaws.length > 0 && (
        <div className="mb-3">
          {behavioralLaws.map((gl) => {
            const isEarly = ["weather_completion", "texture_next_day", "emotion_next_day", "carry_outcome"].includes(gl.type);
            const tier = isEarly ? "early" : "mature";
            const meta = LAW_TIER_META[tier];
            const isExpanded = expandedLawId === gl.law.id;

            return (
              <motion.div
                key={gl.law.id}
                layout
                className={`mb-2 rounded-xl bg-gradient-to-r ${meta.color} px-3 py-2.5`}
              >
                <button
                  onClick={() => setExpandedLawId(isExpanded ? null : gl.law.id)}
                  className="flex w-full items-start gap-2 text-left"
                >
                  <span className="mt-0.5 text-sm">{meta.emoji}</span>
                  <div className="flex-1">
                    <p className="text-xs leading-relaxed text-gray-700">{gl.law.text}</p>
                    {gl.isNew && (
                      <span className="mt-0.5 inline-block rounded-full bg-amber-200/60 px-1.5 py-0.5 text-[9px] text-amber-700">
                        ✨ 新発見
                      </span>
                    )}
                  </div>
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      {...ORIGIN_MOTION.collapse}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 border-t border-gray-100/30 pt-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/50">
                            <div
                              className="h-full rounded-full bg-amber-400"
                              style={{ width: `${Math.round(gl.law.confidence * 100)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-gray-500">
                            確信度 {Math.round(gl.law.confidence * 100)}%
                          </span>
                        </div>
                        <div className="mt-1 flex gap-3 text-[9px] text-gray-400">
                          <span>{gl.law.dataPoints}件のデータ</span>
                          <span>{meta.label}</span>
                          <span>{CATEGORY_LABELS[gl.type] ?? gl.type}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Legacy Orbit Laws */}
      {orbitLaws.length > 0 && (
        <div>
          {behavioralLaws.length > 0 && (
            <p className="mb-1.5 text-[10px] text-gray-400">{LAW_TIER_META.legacy.emoji} {LAW_TIER_META.legacy.label}</p>
          )}
          <div className="space-y-1.5">
            {orbitLaws.slice(0, 5).map((law) => {
              const isExpanded = expandedLawId === law.id;
              return (
                <div key={law.id} className="rounded-xl bg-white/40 px-3 py-2">
                  <button
                    onClick={() => setExpandedLawId(isExpanded ? null : law.id)}
                    className="w-full text-left"
                  >
                    <p className="text-xs text-gray-600">{law.userLabel || law.text}</p>
                  </button>
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-amber-300"
                              style={{ width: `${Math.round(law.confidence * 100)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-gray-400">
                            {Math.round(law.confidence * 100)}%
                          </span>
                        </div>
                        <div className="mt-1 flex gap-3 text-[9px] text-gray-400">
                          <span>{law.dataPoints}日分</span>
                          <span>{CATEGORY_LABELS[law.category] ?? law.category}</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
