/**
 * M2 PersonalizationPort — 型正本（pure・runtime 依存なし）
 *
 * 設計: docs/m2-personalization-port-design.md（CEO GO 2026-06-12）
 *
 * 役割: Stargazer の観測 state を Plan OS / Travel Mode が読むための
 * **read-only 正本 read model** の出力形。
 *
 * 原則:
 *   - 出力形は決定論（同じ入力 → 同じ形・同じ値）
 *   - 未永続化の state は null（捏造しない。worldstate ports の null 流儀を踏襲）
 *   - すべての導出値に confidence を併記（consumer が「聞くべき軸」を判別できる）
 */

import type { TraitAxisKey } from "../../stargazer/traitAxes";

/** 軸ごとの最新観測値（stargazer_axis_snapshots 由来・global context のみ） */
export interface AxisSnapshot {
  /** -1..1（clamp 済み） */
  score: number;
  /** 0..1（clamp 済み・NULL 列は 0） */
  confidence: number;
  /** 観測時刻 ISO（created_at） */
  observedAt: string;
}

/** HDM phase / trust（stargazer_alter_growth 由来） */
export interface HdmSummary {
  /** 0-5。欠損・不正値は 0 */
  currentPhase: number;
  /**
   * trust_level 列の生値（clamp なしの passthrough、null 可）。
   * 源スケールの正規化は consumer 側責務（M2-A では断定しない）。
   */
  trustLevelRaw: number | null;
}

/**
 * 動的状態（energy / stress / socialBattery）。
 * M2-A では **常に null**（innerWeather は未永続化、§1.1 監査）。
 * 契約として置き場を先に確保し、M2-B 以降の永続化で実値に切替える。
 */
export interface DynamicState {
  energy: number;
  stress: number;
  socialBattery: number;
  asOf: string;
}

export interface PersonalizationSnapshot {
  userId: string;
  /** snapshot 構築時刻 ISO（caller 注入。決定論のため Date.now を内部で取らない） */
  asOf: string;
  /** 軸ごと最新 1 件（global context = context IS NULL の行のみ） */
  axes: Partial<Record<TraitAxisKey, AxisSnapshot>>;
  /** stargazer_alter_growth が無い user は null */
  hdm: HdmSummary | null;
  /** M2-A: 常に null（未永続化） */
  dynamicState: DynamicState | null;
  /** M2-A: 常に null（ActionShape/ForceBalance は未永続化） */
  decisionMeta: null;
}

/** 導出値 + 信頼度（0..1）。confidence が低い値は中立デフォルトに丸められている */
export interface DerivedValue<T> {
  value: T;
  /** 0..1。源泉軸の confidence 加重平均 × カバレッジ。0 = 源泉なし（placeholder） */
  confidence: number;
  /** 値の出自。"derived"=軸から導出 / "default"=源泉欠損・低信頼で中立値 */
  source: "derived" | "default";
}

/** Plan OS 向けパラメータ（平日プラン / Travel 共用） */
export interface PlanParams {
  /** 行程密度の事前値 */
  paceDefault: DerivedValue<"slow" | "normal" | "intense">;
  /** 1 日の活動数上限の事前値（2..5） */
  densityCap: DerivedValue<number>;
  /** 朝行動の適性 0..1。M2-A は源泉軸なし → 常に default 0.5 / confidence 0 */
  morningness: DerivedValue<number>;
  /** -1(定番)..+1(新奇) */
  noveltyBias: DerivedValue<number>;
  /** 0(即興)..1(事前確定) — wander 比率に接続 */
  precommitPreference: DerivedValue<number>;
  /** 0..1 対人負荷の許容 */
  socialLoadTolerance: DerivedValue<number>;
  budgetPosture: DerivedValue<"save" | "balanced" | "quality">;
  /** 0..1 行程余白の事前値 */
  bufferMargin: DerivedValue<number>;
  /** M5 説明スタイル */
  explanationTone: DerivedValue<"reason_first" | "feeling_first">;
}

/** Travel 向け特性 v0（T1A の M1 Trait Space 確定までの暫定 field set） */
export const TRAVEL_TRAIT_KEYS_V0 = [
  "noveltySeeking", //      -1 定番       .. +1 新奇
  "pacePreference", //      -1 ゆっくり   .. +1 詰め込み
  "crowdTolerance", //      -1 人混み回避 .. +1 平気（低 confidence の proxy）
  "planningStyle", //       -1 計画       .. +1 即興
  "comfortVsAdventure", //  -1 安心圏     .. +1 冒険
  "experienceDepth", //     -1 深く少なく .. +1 広く多く
  "aestheticOrientation", //-1 定番派     .. +1 流行派
  "socialOrientation", //   -1 内向       .. +1 外向
] as const;

export type TravelTraitKeyV0 = (typeof TRAVEL_TRAIT_KEYS_V0)[number];

export interface TravelTraitsV0 {
  version: "v0";
  traits: Record<TravelTraitKeyV0, DerivedValue<number>>;
}

/** fairness ledger 1 行（coalter_fairness_ledger 由来） */
export interface FairnessLedgerEntry {
  /** -1(完全に A 寄り)..+1(完全に B 寄り) */
  biasScore: number;
  decidedAt: string;
}

export interface PairPersonalizationContext {
  pairStateId: string;
  /** state === 'enabled' かつ onboarded_at 非 null */
  enabled: boolean;
  fairness: {
    /** decided_at 昇順 */
    rows: FairnessLedgerEntry[];
    /** 直近 10 行の平均（行なし = 0） */
    currentBias: number;
  };
  /**
   * M2-A: **常に null**。ペア相手の snapshot は RLS で読めない
   * （M2-B owning issue: docs/m2-personalization-port-design.md §1.2 / §4）。
   */
  partnerSnapshot: null;
}
