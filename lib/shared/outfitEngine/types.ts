/**
 * Shared Outfit Engine — 型定義
 *
 * Calendar と My Style の両方が使う正本型。
 * Calendar の詳細型は Calendar 内に残し、
 * ここには公開 API に必要な型のみ置く。
 */

export type { WardrobeItem } from "@/app/my-style/_lib/types";

// Calendar の正本型を re-export（移動ではなく参照）
export type {
  WeatherDaily,
  DayProposal,
  OutfitProposal,
  ProposalVariant,
  MoodShift,
  MoodAxis,
  SatisfactionProfile,
  SyncScore,
  SyncBreakdown,
  SyncBand,
  RiskWarning,
  WornRecord,
} from "@/app/(culcept)/calendar/_lib/types";

export type { OutfitExtendedOptions } from "@/app/(culcept)/calendar/_lib/outfitEngine";

export type { CalendarPersonaProfile } from "@/app/(culcept)/calendar/_lib/personaBoost";
export type { ExtendedWeatherContext } from "@/app/(culcept)/calendar/_lib/materialWeather";
export type { ComboGraph } from "@/app/(culcept)/calendar/_lib/comboGraph";

/* ── My Style 向け簡易 API の型 ── */

export interface TodayProposalParams {
  wardrobe: import("@/app/my-style/_lib/types").WardrobeItem[];
  date: string;
  weather: import("@/app/(culcept)/calendar/_lib/types").WeatherDaily | null;
  events?: Array<{ event_type: string; event_name: string }>;
  mood?: string;
  persona?: import("@/app/(culcept)/calendar/_lib/personaBoost").CalendarPersonaProfile | null;
  /**
   * Phase 5-C2: shared WornHistory 由来の engine 入力（任意・完全 optional）。
   *   - 渡された場合のみ A 側（satisfaction/combo ← learningRecords / recentlyWorn ← recencyRecords）を差し替える。
   *   - 未指定・空 record は現行 loadWornHistory path に per-field fallback。
   *   - 注入有無は呼出側（outfitEngineAdapter）が flag で決める。 B 側（getScoringCache rotation）は未接続。
   */
  wornHistoryInput?: import("@/lib/shared/wornHistory/engineInput").WornHistoryEngineInput;
}

export interface TodayProposal {
  main: import("@/app/(culcept)/calendar/_lib/types").OutfitProposal;
  alternatives: import("@/app/(culcept)/calendar/_lib/types").OutfitProposal[];
  reason: string;
  weatherSummary: string;
  syncScore: number;
  confidence: number;
  date: string;
}
