/**
 * Shared Outfit Engine — 統一提案 API
 *
 * Calendar と My Style が共に使う提案エンジンの正本。
 * 実装は Calendar の outfitEngine を正本とし、ここは公開 API を提供する。
 *
 * 二重実装の禁止:
 * - 提案生成ロジックはここを通じてのみ呼び出す
 * - Calendar / My Style 個別に scoreCandidate 等を呼ばない
 * - weatherOutfit.ts / todaysMirror.ts の提案生成は廃止
 */

import { generateDayProposal, clearScoringCache } from "@/app/(culcept)/calendar/_lib/outfitEngine";
import { buildSatisfactionProfile } from "@/app/(culcept)/calendar/_lib/satisfactionLearner";
import { getRecentlyWornItemIds } from "@/app/(culcept)/calendar/_lib/rotationTracker";
import { buildComboGraph } from "@/app/(culcept)/calendar/_lib/comboGraph";
import { buildExtendedWeatherContext } from "@/app/(culcept)/calendar/_lib/materialWeather";
import { loadWornHistory } from "@/app/(culcept)/calendar/_lib/rotationTracker";
import { getRecentlyWornItemIdsFromRecencyRecords } from "@/lib/shared/wornHistory/engineInput";

import type { TodayProposal, TodayProposalParams, MoodShift } from "./types";

// Re-export types for consumers
export type {
  TodayProposal,
  TodayProposalParams,
  WeatherDaily,
  OutfitProposal,
  DayProposal,
  MoodShift,
  WornRecord,
  SyncScore,
  RiskWarning,
  OutfitExtendedOptions,
} from "./types";

// Re-export Calendar engine for Calendar's own use (re-export, not duplication)
export { generateDayProposal, clearScoringCache } from "@/app/(culcept)/calendar/_lib/outfitEngine";
export { buildSatisfactionProfile } from "@/app/(culcept)/calendar/_lib/satisfactionLearner";
export { getRecentlyWornItemIds, loadWornHistory } from "@/app/(culcept)/calendar/_lib/rotationTracker";

/* ── Feature Flag ── */

const FF_USE_SHARED_ENGINE = true; // Phase 1: true で統一エンジン有効

/* ── Mood → MoodShift 変換 ── */

function moodToShift(mood?: string): MoodShift | undefined {
  if (!mood) return undefined;
  switch (mood) {
    case "energetic":
    case "元気":
      return { axis: "formality", direction: 1 };
    case "relaxed":
    case "ゆったり":
      return { axis: "formality", direction: -1 };
    case "normal":
    case "ふつう":
    default:
      return undefined;
  }
}

/* ── 天気サマリー生成 ── */

function buildWeatherSummary(
  weather: import("@/app/(culcept)/calendar/_lib/types").WeatherDaily | null,
): string {
  if (!weather) return "天気情報なし";

  const ICONS: Record<string, string> = {
    sun: "☀️", cloud: "☁️", rain: "🌧️", snow: "❄️",
    storm: "⛈️", fog: "🌫️", unknown: "🌤️",
  };
  const LABELS: Record<string, string> = {
    sun: "晴れ", cloud: "曇り", rain: "雨", snow: "雪",
    storm: "嵐", fog: "霧", unknown: "",
  };

  const icon = ICONS[weather.weather_icon] ?? "🌤️";
  const label = LABELS[weather.weather_icon] ?? "";
  const temp = weather.temp_max != null ? `${weather.temp_max}°C` : "";

  return [icon, temp, label].filter(Boolean).join(" ");
}

/* ── 信頼度計算 ── */

function computeConfidence(
  wardrobeCount: number,
  wornHistoryCount: number,
  hasWeather: boolean,
  syncScore: number,
): number {
  let c = 0;

  // ワードローブ充実度 (max 0.3)
  c += Math.min(0.3, wardrobeCount / 50 * 0.3);

  // 着用履歴 (max 0.25)
  c += Math.min(0.25, wornHistoryCount / 30 * 0.25);

  // 天気データ有無 (0.15)
  if (hasWeather) c += 0.15;

  // SYNC スコア品質 (max 0.3)
  c += Math.min(0.3, syncScore / 100 * 0.3);

  return Math.round(c * 100) / 100;
}

/* ── メイン公開 API ── */

/**
 * My Style / Calendar 共通の今日の提案生成。
 *
 * Calendar の generateDayProposal を内部で呼び出し、
 * My Style 向けに簡易化した TodayProposal を返す。
 */
export function generateTodayProposal(
  params: TodayProposalParams,
): TodayProposal | null {
  if (!FF_USE_SHARED_ENGINE) return null;

  const { wardrobe, date, weather, events = [], mood, persona, wornHistoryInput } = params;

  if (wardrobe.length === 0) return null;

  // 着用履歴から学習プロファイルを構築。
  // Phase 5-C2: wornHistoryInput（shared corpus 由来）が渡された場合のみ A 側に注入する。
  //   - 満足度 / コンボ学習 ← learningRecords（空なら loadWornHistory へ per-field fallback）
  //   - recentlyWorn / rotation(A) ← recencyRecords（空なら getRecentlyWornItemIds へ per-field fallback）
  // wornHistoryInput 無し / 空 record は現行 path と完全一致（注入の有無は呼出側が flag で決める）。
  // B 側（outfitEngine.getScoringCache の rotation）は 5-C3 まで未接続。
  const learningSource =
    wornHistoryInput && wornHistoryInput.learningRecords.length > 0
      ? wornHistoryInput.learningRecords
      : loadWornHistory();
  const recentlyWornIds =
    wornHistoryInput && wornHistoryInput.recencyRecords.length > 0
      ? getRecentlyWornItemIdsFromRecencyRecords(wornHistoryInput.recencyRecords, { days: 7 })
      : getRecentlyWornItemIds(7);
  const satisfactionProfile = learningSource.length >= 3
    ? buildSatisfactionProfile(learningSource)
    : undefined;

  // コンボグラフ（ペア親和性）
  const comboGraph = learningSource.length >= 5
    ? buildComboGraph(learningSource)
    : undefined;

  // 拡張天気コンテキスト
  const extWeather = weather
    ? buildExtendedWeatherContext(weather)
    : undefined;

  // Mood → MoodShift
  const moodShift = moodToShift(mood);

  // Calendar の正本エンジンで提案生成
  const proposal = generateDayProposal(
    wardrobe,
    date,
    weather,
    events,
    recentlyWornIds,
    moodShift,
    persona ?? null,
    satisfactionProfile ?? null,
    {
      extWeather: extWeather ?? null,
      comboGraph: comboGraph ?? null,
      adaptation: null,
    },
  );

  if (!proposal) return null;

  // TodayProposal に変換
  return {
    main: proposal.main,
    alternatives: proposal.alternatives.slice(0, 2),
    reason: proposal.main.reason,
    weatherSummary: buildWeatherSummary(weather),
    syncScore: proposal.main.sync.total,
    confidence: computeConfidence(
      wardrobe.length,
      learningSource.length,
      weather != null,
      proposal.main.sync.total,
    ),
    date,
  };
}
