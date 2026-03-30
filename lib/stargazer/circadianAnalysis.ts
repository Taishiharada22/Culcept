// lib/stargazer/circadianAnalysis.ts
// サーカディアン変動分析 — 時間帯別の心理状態パターンを検出
// 心理学的根拠: 概日リズムと感情変動の相関 (Golder & Macy, 2011)

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import { getEntries } from "./microEMA";

export type TimeSlot = "morning" | "afternoon" | "evening" | "night";

export interface CircadianPattern {
  axis: TraitAxisKey;
  axisLabel: string;
  /** 時間帯別の平均スコア */
  byTimeSlot: Record<TimeSlot, { avg: number; count: number }>;
  /** 最も変動が大きい時間帯の遷移 */
  peakShift: { from: TimeSlot; to: TimeSlot; delta: number } | null;
  /** パターンの解釈 */
  interpretation: string;
}

export interface CircadianResult {
  patterns: CircadianPattern[];
  /** 全体的なサーカディアンプロファイル */
  profile: string;
  /** 最もエネルギーが高い時間帯 */
  peakTime: TimeSlot;
  /** 最も脆弱な時間帯 */
  vulnerableTime: TimeSlot;
  /** データ件数 */
  totalEntries: number;
}

export const TIME_LABELS: Record<TimeSlot, string> = {
  morning: "朝",
  afternoon: "昼",
  evening: "夕方",
  night: "夜",
};

const SLOTS: TimeSlot[] = ["morning", "afternoon", "evening", "night"];

/**
 * Micro-EMAデータからサーカディアンパターンを分析
 */
export function analyzeCircadian(): CircadianResult | null {
  const entries = getEntries();
  if (entries.length < 10) return null; // Minimum data needed

  // Group by axis and time slot
  const grouped: Record<string, Record<TimeSlot, number[]>> = {};
  for (const e of entries) {
    if (!grouped[e.axis]) {
      grouped[e.axis] = { morning: [], afternoon: [], evening: [], night: [] };
    }
    grouped[e.axis][e.context.timeOfDay].push(e.score);
  }

  const patterns: CircadianPattern[] = [];

  for (const [axis, bySlot] of Object.entries(grouped)) {
    const def = TRAIT_AXES.find((a) => a.id === axis);
    if (!def) continue;

    const timeSlotAvgs: Record<TimeSlot, { avg: number; count: number }> = {
      morning: { avg: 0, count: 0 },
      afternoon: { avg: 0, count: 0 },
      evening: { avg: 0, count: 0 },
      night: { avg: 0, count: 0 },
    };

    for (const slot of SLOTS) {
      const values = bySlot[slot];
      if (values.length > 0) {
        timeSlotAvgs[slot] = {
          avg: values.reduce((s, v) => s + v, 0) / values.length,
          count: values.length,
        };
      }
    }

    // Find peak shift (largest delta between adjacent slots)
    let maxDelta = 0;
    let peakShift: CircadianPattern["peakShift"] = null;
    for (let i = 0; i < SLOTS.length - 1; i++) {
      const a = timeSlotAvgs[SLOTS[i]];
      const b = timeSlotAvgs[SLOTS[i + 1]];
      if (a.count > 0 && b.count > 0) {
        const delta = Math.abs(b.avg - a.avg);
        if (delta > maxDelta) {
          maxDelta = delta;
          peakShift = { from: SLOTS[i], to: SLOTS[i + 1], delta: b.avg - a.avg };
        }
      }
    }

    const interpretation =
      peakShift && Math.abs(peakShift.delta) > 0.2
        ? `${TIME_LABELS[peakShift.from]}から${TIME_LABELS[peakShift.to]}にかけて、「${def.labelLeft}↔${def.labelRight}」の軸で${Math.abs(peakShift.delta * 100).toFixed(0)}%の変動がある。`
        : `この軸は時間帯による大きな変動がない。安定した特性。`;

    if (peakShift && Math.abs(peakShift.delta) > 0.15) {
      patterns.push({
        axis: axis as TraitAxisKey,
        axisLabel: `${def.labelLeft} ↔ ${def.labelRight}`,
        byTimeSlot: timeSlotAvgs,
        peakShift,
        interpretation,
      });
    }
  }

  if (patterns.length === 0) return null;

  patterns.sort(
    (a, b) => Math.abs(b.peakShift?.delta ?? 0) - Math.abs(a.peakShift?.delta ?? 0)
  );

  // Determine overall peak/vulnerable time from average absolute activity level
  const timeEnergy: Record<TimeSlot, number[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
  };
  for (const e of entries) {
    timeEnergy[e.context.timeOfDay].push(Math.abs(e.score));
  }

  let peakTime: TimeSlot = "morning";
  let vulnerableTime: TimeSlot = "night";
  let maxEnergy = -1;
  let minEnergy = 999;
  for (const slot of SLOTS) {
    const vals = timeEnergy[slot];
    if (vals.length === 0) continue;
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    if (avg > maxEnergy) {
      maxEnergy = avg;
      peakTime = slot;
    }
    if (avg < minEnergy) {
      minEnergy = avg;
      vulnerableTime = slot;
    }
  }

  const profile = `あなたの心理状態は${TIME_LABELS[peakTime]}に最も活性化し、${TIME_LABELS[vulnerableTime]}に最も穏やか（または脆弱）になる傾向がある。${patterns.length}個の軸で時間帯による変動パターンが検出された。`;

  return {
    patterns,
    profile,
    peakTime,
    vulnerableTime,
    totalEntries: entries.length,
  };
}
