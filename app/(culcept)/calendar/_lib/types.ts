import type { WardrobeItem } from "@/app/my-style/_lib/types";

/* ── SYNC スコア ── */
export interface SyncBreakdown {
  climate: number;       // 0-25
  tpo: number;           // 0-25
  visualHarmony: number; // 0-25
  mobility: number;      // 0-25
  personalFit: number;   // 0-25 (満足度学習ベース)
}

/* ── 満足度学習プロファイル ── */
export interface SatisfactionProfile {
  itemScores: Map<string, { avg: number; count: number; lastWorn: string }>;
  comboScores: Map<string, { avg: number; count: number }>;
  conditionScores: Map<string, { avg: number; count: number }>;
  dataPoints: number;
  oldestDate: string;
}

/* ── インサイト ── */
export type InsightType =
  | "color"
  | "persona"
  | "learning"
  | "risk"
  | "rotation"
  | "contradiction"
  | "seasonal_transition"
  | "temporal"
  | "combo"
  | "material"
  | "aneurasync";

export interface Insight {
  type: InsightType;
  icon: string;
  label: string;
  text: string;
  priority: number; // 0-100
}

/* ── 季節遷移 ── */
export type SeasonId = "spring" | "summer" | "autumn" | "winter";

export interface SeasonBlend {
  primary: SeasonId;
  secondary: SeasonId | null;
  blend: number; // 0=pure primary, 1=pure secondary
  shoulderSeason: boolean;
}

export interface DayTemperatureSplit {
  needsMorningLayer: boolean;
  morningTemp: number | null;
  afternoonTemp: number | null;
  tempRange: number;
}

export interface SeasonalRotationHint {
  type: "upcoming" | "ending";
  season: SeasonId;
  message: string;
  relevantCategories: string[];
}

/* ── 天気ドリフト ── */
export interface WeatherDrift {
  date: string;
  field: "temp" | "condition" | "rain";
  stored: { temp_max: number | null; weather_icon: string };
  current: { temp_max: number | null; weather_icon: string };
  severity: "minor" | "significant";
}

export type SyncBand = "excellent" | "good" | "caution" | "risk";

export interface SyncScore {
  total: number;         // 0-100
  breakdown: SyncBreakdown;
  band: SyncBand;
  reasons: string[];     // up to 3
}

/* ── リスク警告 ── */
export type RiskType = "temperature" | "mobility" | "weather" | "formality" | "repetition";
export type RiskSeverity = "high" | "medium" | "low";

export interface RiskWarning {
  type: RiskType;
  severity: RiskSeverity;
  message: string;
}

/* ── コーデ提案 ── */
export type ProposalVariant = "main" | "casual" | "dressy" | "rain" | "cold";

export interface OutfitProposal {
  id: string;
  items: WardrobeItem[];
  sync: SyncScore;
  risks: RiskWarning[];
  reason: string;
  moodTag: string;
  variant: ProposalVariant;
}

export interface DayProposal {
  date: string;
  main: OutfitProposal;
  alternatives: OutfitProposal[];
  insights: Insight[];
  morningAfternoonSplit?: {
    morningItems: import("@/app/my-style/_lib/types").WardrobeItem[];
    afternoonItems: import("@/app/my-style/_lib/types").WardrobeItem[];
  };
}

/* ── 週間雰囲気 ── */
export interface WeekAtmosphere {
  tempTrend: Array<{ date: string; min: number | null; max: number | null }>;
  dominantWeather: string;
  styleTendency: string;
  avgTemp: number | null;
}

/* ── 着用記録 ── */
export interface WornRecord {
  date: string;
  itemIds: string[];
  satisfaction: 1 | 2 | 3 | 4 | 5;
  note?: string;
}

/* ── ムードシフト ── */
export type MoodAxis = "formality" | "softness" | "color_intensity";

export interface MoodShift {
  axis: MoodAxis;
  direction: -1 | 0 | 1;  // -1=カジュアル/シャープ/落ち着き, +1=フォーマル/柔らかい/鮮やか
}

/* ── 既存カレンダーAPIの型（既存コードから維持） ── */
export interface OutfitItem {
  card_id: string;
  category: string;
  image_url: string;
  title: string;
  reason: string;
}

export interface DayData {
  date: string;
  dayOfWeek: number;
  outfit: {
    id: string;
    outfit_items: OutfitItem[];
    weather_input: { temp: number; condition: string } | null;
    scene: string | null;
    style_notes: string | null;
    is_worn: boolean;
  } | null;
  events: { id: string; event_type: string; event_name: string; office_code?: string | null }[];
  weather_daily: WeatherDaily | null;
}

export interface WeatherDaily {
  weather_icon: "sun" | "cloud" | "rain" | "snow" | "storm" | "fog" | "unknown";
  pop_max: number | null;
  temp_min: number | null;
  temp_max: number | null;
  pop_blocks?: { start: string; end: string | null; pop: number }[] | null;
  outfit_tag?: "rain" | "normal" | null;
}

export interface CalendarData {
  year: number;
  month: number;
  days: DayData[];
  totalOutfits: number;
}
