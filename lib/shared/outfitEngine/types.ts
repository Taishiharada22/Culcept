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
