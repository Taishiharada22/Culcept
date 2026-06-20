/**
 * DayStateRecord / MomentState / NightCheck / AlterBatteryViewModel — Stage 0 型契約
 *
 * 正本: docs/day-state-alter-tab-v0-design.md (v0.3) / docs/alter-tab-visual-contract.md §4
 * 規律:
 *  - 型 import のみ（runtime 依存ゼロ）。既存ファイル変更なし。
 *  - 新設 enum は 4 つのみ（ReserveLevel / RecoveryNeedLevel / OutingToleranceLevel / DayFeasibilityLevel）。
 *    それ以外の値 union は既存 export / indexed access type で取得し literal を再宣言しない。
 *  - UI / route / 保存（localStorage / Supabase）への接続は本モジュール群では行わない（Stage 1+）。
 */

import type {
  ConfidentValue,
  EvidenceSource,
  DailyGuidanceFrame,
  DailyGuidanceMode,
} from "@/lib/stargazer/alterHomeAdapter";
import type { ActivityMoodCode } from "@/lib/coalter/activity/intent";
import type { TimeBucket } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { LatencyTolerance } from "@/lib/plan/dayGraph/latencyToleranceMap";
import type { DensityLevel } from "@/lib/plan/context/contextModifier";
import type { WeatherCondition } from "@/app/(immersive)/my-style/_lib/weatherService";
import type { DayConditions } from "@/lib/alter-morning/types";
import type { BodyFeeling, DayState as OrbitDayState } from "@/lib/origin/dailyOrbit/types";

// ── 既存 union の indexed access 取得（再宣言禁止規律） ──
export type EnergyLevelValue = DailyGuidanceFrame["energy_level"]["value"];
export type SocialBandwidthValue = DailyGuidanceFrame["social_bandwidth"]["value"];
export type EstimatedWalkLevel = NonNullable<DayConditions["estimatedWalkLevel"]>;
export type BodyEchoChest = NonNullable<BodyFeeling["chest"]>;
export type OrbitEmotion = NonNullable<OrbitDayState["emotion"]>;
export type SleepQualityInput = "good" | "shallow" | "short";

// ── 新設 enum（設計書 §3.1 の 4 つ） ──
export type ReserveLevel = "high" | "medium" | "low" | "unknown";
export type RecoveryNeedLevel = "low" | "medium" | "high" | "unknown";
export type OutingToleranceLevel = "low" | "medium" | "high" | "unknown";
export type DayFeasibilityLevel = "likely_steady" | "mixed" | "likely_fragile" | "unknown";

// ── evidence は閉じた union（raw text 禁止規律を型で保証） ──
export type EvidenceTag =
  | "shift_night"
  | "shift_work"
  | "day_off"
  | "dense_schedule"
  | "long_travel_chain"
  | "low_evening_slack"
  | "large_free_block"
  | "weather_rain"
  | "weather_heat"
  | "user_tired_tap"
  | "user_mood_input"
  | "user_correction"
  | "carry_over_debt"
  | "axis_prior_used";

export type FrozenKind = "morning_baseline" | "first_open_snapshot" | "late_snapshot";

// ── facts（事実区画。採点不要・数値可） ──
export interface DayStateShift {
  kind: "work" | "off" | "off_request" | "none";
  startTime?: string; // "HH:MM"
  endTime?: string;
  isNightShift: boolean | null; // 勤務が 22:00-05:00 帯に交差するか。時刻欠如時 null
}

export interface DayStateFacts {
  anchorCount: number;
  density: DensityLevel;
  bookedMin: number;
  travelChainMin: number | null; // 未解決移動あり（座標欠如）の日は null。分数の捏造禁止
  eveningSlackMin: number; // timeBucket ∈ {evening, night} の gap 合計
  largestFreeBlockMin: number;
  shift: DayStateShift;
  weather: { condition: WeatherCondition; pop: number } | null;
}

// ── estimates（見立て区画。全て ConfidentValue・補正で日中更新） ──
export interface DayStateEstimates {
  energyLevel: ConfidentValue<EnergyLevelValue>; // 体バッテリー
  focusReserve: ConfidentValue<ReserveLevel>; // 脳バッテリー
  emotionalReserve: ConfidentValue<ReserveLevel>; // 心臓バッテリー
  outingTolerance: ConfidentValue<OutingToleranceLevel>; // 周辺カード（人体水位ではない）
  dayFeasibility: ConfidentValue<DayFeasibilityLevel>; // day-level proxy（本物の成立予測ではない）
  recoveryNeed: ConfidentValue<RecoveryNeedLevel>; // 内部保持 + 周辺カード材料
  dailyMode: ConfidentValue<DailyGuidanceMode>;
}

export type EstimateFieldKey = keyof DayStateEstimates;

export interface UserCorrection {
  at: string; // "HH:MM"
  field: EstimateFieldKey;
  // 常に「格納フィールドの値空間」で記録する。3 系統は全て余力方向のため表示方向 = 格納方向
  direction: "lower" | "match" | "higher";
}

export interface DayStateUserInputs {
  moodCode?: ActivityMoodCode;
  sleepQuality?: SleepQualityInput; // 睡眠カードのチップ入力（生理データ無しの唯一の睡眠源）
  corrections: UserCorrection[];
}

// ── Night Check ──
export type DayFelt = 1 | 2 | 3 | 4 | 5;
export type PlanVerdict = "as_seen" | "partial_drift" | "major_drift";
export type GradeVerdict = "match" | "over" | "under"; // over = 見立てが実際より高かった（過大）

export interface NightCheckDriftSelection {
  anchorId: string;
  driftType: "skipped" | "delayed" | "time_changed";
}

export interface NightCheckResultV0 {
  answeredAt: string; // "HH:MM"
  answeredFor: string; // 対象の主観日（繰り越し回答の区別）
  dayFelt: DayFelt;
  planVerdict?: PlanVerdict;
  driftSelections?: NightCheckDriftSelection[];
  verdicts: Partial<Record<"energyLevel" | "recoveryNeed" | "dayFeasibility", GradeVerdict>>;
}

export interface CarryOverOut {
  recoveryDebt: "none" | "some" | "high";
  unfinishedAnchor: boolean;
  lateNightEnd: boolean;
}

export interface NextDayPriorAdjustment {
  field: "energyLevel" | "recoveryNeed" | "dayFeasibility";
  contextKey: string; // 同条件キー = shift 種別 × density 帯（例 "shift_night|packed"）
  direction: "raise" | "lower";
  confidenceDelta: number; // 内部値・非表示
}

export interface NightCheckGradeV0 {
  verdicts: NightCheckResultV0["verdicts"];
  carryOverOut: CarryOverOut;
  // 消費規律: これを「翌日の見立て」に使うのは Stage 3（B1 gate）。v0 では保存されるのみ。
  // match の confidence +0.1 は verdicts から消費側が導出する（本配列は方向シフトのみ）。
  nextDayPriorAdjustments: NextDayPriorAdjustment[];
}

// ── DayStateRecord 本体 ──
export interface DayStateRecordV0 {
  schemaVersion: 0;
  // 主観日境界 = 05:00。レコードは当日 05:00〜翌 04:59 を覆う。
  // 02:00 の導出・Night Check 回答は前日 date のレコードに属する。
  date: string; // "YYYY-MM-DD"
  facts: DayStateFacts;
  estimates: DayStateEstimates; // 現在値（補正で更新される）
  estimatesFrozen: {
    at: string; // "HH:MM"（その日の初回導出時）
    // 採点集計は frozenKind で層別。ヘッドライン match 率は morning_baseline のみ。
    frozenKind: FrozenKind;
    values: DayStateEstimates;
  };
  userInputs: DayStateUserInputs;
  nightCheck?: NightCheckResultV0;
  carryOverOut?: CarryOverOut; // v0 は「書くだけ」。翌朝の読取は B1 gate 後
  evidence: EvidenceTag[];
}

// ── MomentState（保存しない導出値。設計書 §2.1 で 14 フィールド凍結） ──
export interface MomentStateV0 {
  nowHHMM: string;
  timeBucket: TimeBucket;
  nowSegment: { kind: "event" | "travel" | "gap"; startHHMM: string; endHHMM: string } | null;
  nextFixedEventAt: string | null; // fixed = latencyTolerance ∈ {strict, tight}
  minutesUntilNextFixedEvent: number | null;
  departureDeadlineHHMM: string | null; // resolved 移動 segment が無ければ null（捏造禁止）
  minutesUntilDeparture: number | null;
  eveningSlackRemainingMin: number | null;
  timePressure: "low" | "medium" | "high" | "unknown";
  currentMode: "open" | "pre_event" | "in_event" | "post_event" | "evening_recovery" | "unknown";
  interruptibility: "low" | "medium" | "high" | "unknown";
  // 既存 DeliveryMode（lib/plan/reality/receptivity-gate.ts）と同語彙の「上限」表現。
  // push 系は B2/R6 gate まで値域から除外。v0 の消費者は表示選択のみ。
  receptivity: "silent" | "on_open" | "unknown";
  interventionWindow: "open" | "narrowing" | "closing" | "closed" | "unknown";
  isNightCheckWindow: boolean; // timeBucket ∈ {evening, night, late_night}
}

// ── optional inputs（Stage 0 は受領のみ。import しない既存系の値は呼び出し側が渡す） ──
export interface HeartHint {
  psychologicalCapacity?: number; // 0-1（HDM 由来。対話文脈のため confidence 0.3 上限で扱う）
  emotionalLoad?: number; // 0-1
}

export interface PersonaCoefficientsV0 {
  socialEventDrain?: "low" | "medium" | "high"; // individual_vs_social 由来
  driftSensitivity?: "low" | "medium" | "high"; // plan_vs_spontaneous 由来
  confidenceDamping?: boolean; // emotional_regulation 由来
}

// ── 入力（DayGraph 等の既存構造は呼び出し側で lite 形に写像して渡す。Stage 0 は fixture 供給） ──
export interface DaySegmentLite {
  kind: "event" | "travel" | "gap";
  startHHMM: string;
  endHHMM: string;
  durationMin: number;
  timeBucket: TimeBucket; // startHHMM ベース
  latencyTolerance?: LatencyTolerance; // event のみ。strict|tight = fixed
  label?: string;
}

export interface DayStateBuildInput {
  date: string;
  nowHHMM: string; // 凍結時刻（frozenKind 判定）。Date.now() 直呼び禁止 — 必ず注入
  segments: DaySegmentLite[];
  density?: DensityLevel; // 既存 computeDayGraphAttributes の出力を呼び出し側が渡す。無ければ anchorCount から fallback
  hasUnresolvedTravel?: boolean; // true の日は travelChainMin = null（捏造禁止）
  shift: { kind: DayStateShift["kind"]; startTime?: string; endTime?: string };
  weather: { condition: WeatherCondition; pop: number } | null;
  // 本人申告・既存シグナル（全て optional input）
  moodCode?: ActivityMoodCode;
  sleepQuality?: SleepQualityInput;
  bodyEchoChest?: BodyEchoChest;
  emotionHint?: OrbitEmotion;
  socialBandwidthSignal?: SocialBandwidthValue;
  // 対人予定密度（§3.3 ③）: DayConditions.withWhom / DayState.social の many_people 連続から
  // 呼び出し側が導出して渡す（Stage 1 配線。Stage 0 は fixture 供給）
  interpersonalLoadHint?: "high" | "low";
  estimatedWalkLevel?: EstimatedWalkLevel;
  heartHint?: HeartHint;
  personaCoefficients?: PersonaCoefficientsV0; // Stage 0: 受領のみ・estimates へ未適用（適用は Stage D 契約）
  dailyModeHint?: DailyGuidanceMode; // 呼び出し側が既存 resolveDailyMode を実行して渡す（Stage 1）。無ければ保守的 fallback
}

// ── AlterBatteryViewModel（Session B が読むだけの境界面。visual-contract §4 が正本） ──
export type Band = "very_low" | "low" | "medium" | "high" | "unknown";

export interface BatteryZoneVM {
  label: string;
  band: Band;
  visualFill: number; // 0-1 描画専用。画面に数値として出さない
  confidence: "low" | "medium" | "high";
  source: "見立て" | "本人";
  evidence: string[]; // EvidenceTag → 日本語語彙に変換済み（表示用）
  correctable: true;
}

export interface AlterBatteryViewModel {
  battery: { brain: BatteryZoneVM; heart: BatteryZoneVM; body: BatteryZoneVM };
  contextCards: {
    outingTolerance: { label: "外出耐性"; band: Band; text: string; evidence: string[]; correctable: true };
    eveningSlack: { label: "夜の余白"; text: string; evidence: string[] };
    sleep: { label: "睡眠"; band: Band; text: string; source: "user_reported" | "unknown"; correctable: true };
    yesterdayLoad: { label: "昨日の負荷"; band: Band };
    recoveryQuality: { label: "回復の質"; band: Band; source: "night_check_derived" | "unknown" };
    carryOver: { label: "明日への持ち越し"; band: Band };
    feasibility: { label: "今日の成立見込み"; band: Band; text: string };
  };
  flowTimeline: {
    segments: Array<{
      kind: "event" | "travel" | "gap";
      startHHMM: string;
      endHHMM: string;
      label?: string;
      isEveningSlack?: boolean;
    }>;
  };
  morningReveal: {
    forDate: string;
    items: Array<{ label: string; estimatedBand: Band; actualBand: Band; verdict: GradeVerdict }>;
    adjustmentNote: string; // B1 前 = 「記録した」系固定文。反映済み表現は Stage 3 から
  } | null; // 前日未回答・前日レコード欠如・朝以外は null（undefined 不可）
  alterMessage: string;
  quickReplies: string[];
  nightCheck: {
    state: "hidden" | "main" | "followup" | "answered" | "carried_over";
    question: string;
    chips: string[];
  };
}

// 再 export（テスト・後段の利便。値ではなく型のみ）
export type { ConfidentValue, EvidenceSource, DailyGuidanceMode, TimeBucket, DensityLevel, WeatherCondition, LatencyTolerance };
