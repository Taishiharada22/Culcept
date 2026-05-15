/**
 * CoAlter Activity Domain — Intent / Slot Extraction (AD2 phase)
 *
 * 正本:
 *   - docs/coalter-activity-domain-mapping.md (PR #126、design completion)
 *   - docs/coalter-master-design.md v1.2 §13.4 (Activity reflection)
 *   - lib/coalter/activity/types.ts (Batch-C PR #131、AD1 phase)
 *
 * 役割:
 *   Daily mode 内 "今日何しよう" / "軽く出かけたい" / "暇つぶし" 系の user signal を
 *   **Activity intent / slot signals** に変換する **pure function**。
 *   runtime 接続なし、production behavior 0 変化。
 *
 * 構造的安全設計 (Gap 4 D2 contextDetector + Batch-C 継承):
 *   1. **raw text を input / output に含めない** (型レベル enforcement):
 *      - input は **normalized signal / lightweight context** のみ
 *      - output reasonCodes は `ActivityIntentReasonCode` enum のみ、free text なし
 *      - missingSlots は `ActivityIntentMissingSlot` enum のみ
 *      - caller 側で raw user text を解析した結果 (binary / enum) のみを受領
 *   2. **provisional threshold** (CEO 2026-05-15 補正反映):
 *      - τ=0.5 は default candidate、確定値ではない
 *      - 最終値は後続 phase で実 data 観測後決定
 *      - input.threshold で config arg override 可
 *   3. **fail-closed default**:
 *      - 全 input undefined → out_of_scope / needsNarrowing / confidence 0
 *      - 過剰発火しない
 *   4. **deterministic**:
 *      - 純関数、stateless、Math.random 不使用、external state 参照なし
 *   5. **handoff target 優先判定**:
 *      - food / movie / travel signal が立てば Activity logic より優先で handoff
 *      - Activity orchestrator を呼ばずに他 domain 委譲 (PR #126 §4.3 規則)
 *   6. **progressive narrowing path 提示**:
 *      - signal 不足時は `needsNarrowing: true` + `missingSlots` で「何が足りないか」明示
 *      - clarify mode escalate の前提 material
 *
 * 後続 phase (本 PR scope 外):
 *   - AD3: candidate generator + scorer (Stage 2 Curate activity-specific、別 PR)
 *   - AD4: multi-axis ranking (fairness / novelty / cognitive load、別 PR)
 *   - AD5: UI presentation (Product Unit 連携、別 PR)
 *   - AD6: production observation + mode enum rollout (別 PR、CEO 戦略判断)
 *
 * 本 PR の不可触 (CEO 2026-05-15 制約):
 *   - Daily planner 接続 / DomainRouter 接続 / orchestrator 接続
 *   - ChatClient / UpperLayerMount / route / API / env / flags / migration
 *   - lib/coalter/activity/types.ts 既存 type touch (新 type は本 file local 定義)
 *   - Travel T2 実装 / Daily Dispatch DD2 実装
 */

import type {
  ActivityCostBand,
  ActivityDurationBand,
  ActivityFatigueLevel,
  ActivityHandoffTarget,
  ActivityIndoorOutdoor,
  ActivityNoveltyLevel,
  ActivityPairCompatibility,
  ActivityTaxonomy,
  ActivityWeatherDependency,
} from "./types";

// ─────────────────────────────────────────────
// detector / extractor version
// ─────────────────────────────────────────────

/**
 * Intent extractor version 文字列 (semver).
 *
 * 後続 calibration で version 別観測可。
 */
export const INTENT_EXTRACTOR_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// provisional threshold (固定値ではない)
// ─────────────────────────────────────────────

/**
 * Provisional default threshold τ (CEO 2026-05-15 補正済、確定値ではない).
 *
 * 最終値は AD5/AD6 phase で実 data 観測後決定。
 * input.threshold で config arg override 可。
 *
 * 意味:
 *   - τ = 0 → 全 signal で activity_eligible 判定 (over-firing risk)
 *   - τ = 0.5 → 中庸 default candidate (本 PR 暫定値)
 *   - τ = 1.0 → 全抑止 (kill switch)
 */
export const PROVISIONAL_DEFAULT_THRESHOLD = 0.5;

// ─────────────────────────────────────────────
// 補助 enum (本 file local、normalized signal のみ)
// ─────────────────────────────────────────────

/**
 * Mood code (normalized signal、raw text 不可).
 *
 * caller が抽出した user mood を 6 値で表現:
 *   - relaxed: のんびり mood (low fatigue 推奨)
 *   - energetic: 活動的 (high activity 候補)
 *   - curious: 新規志向 (novelty 推奨)
 *   - tired: 疲労 (low fatigue 必須)
 *   - casual: カジュアル (中庸)
 *   - unknown: signal なし
 */
export type ActivityMoodCode = "relaxed" | "energetic" | "curious" | "tired" | "casual" | "unknown";

/**
 * Weather code (normalized signal、raw forecast text 不可).
 *
 * MVP では 4 値、API 接続は AD3 phase 以降:
 *   - sunny: 晴
 *   - rainy: 雨
 *   - cloudy: 曇
 *   - unknown: signal なし (weather-dependent 候補は fail-closed で抑止)
 */
export type ActivityWeatherCode = "sunny" | "rainy" | "cloudy" | "unknown";

// ─────────────────────────────────────────────
// Input (normalized signal only、raw text 受領なし)
// ─────────────────────────────────────────────

/**
 * Activity signal hints (caller 抽出済の normalized signal、本 type で direct ).
 *
 * **重要**: raw user text を含めない。caller 側で text → enum / boolean に変換した
 * 結果のみを受領。本 type は activity-specific signal の集約。
 */
export interface ActivitySignalHints {
  /** indoor / outdoor / hybrid signal (caller 抽出済) */
  indoorOutdoor?: ActivityIndoorOutdoor;
  /** duration band signal (short / medium / half_day) */
  durationHint?: ActivityDurationBand;
  /** novelty preference signal */
  noveltyHint?: ActivityNoveltyLevel;
  /** mood signal (normalized 6 値) */
  moodCode?: ActivityMoodCode;
  /** fatigue level signal (1-5) */
  fatigueHint?: ActivityFatigueLevel;
  /** pair compatibility signal */
  pairCompatibility?: ActivityPairCompatibility;
}

/**
 * Activity intent extraction input.
 *
 * **構造的安全 (raw text leakage 防止)**:
 *   全 field は **normalized signal / lightweight context** のみ。
 *   `string` 値を含む field でも raw user text ではなく、caller 抽出済の
 *   normalized code (例: redLines = ["no_alcohol"]) を期待。
 */
export interface ActivityIntentInput {
  /** Activity-specific signal hints (caller 抽出済) */
  activityHints?: ActivitySignalHints;

  /** food domain handoff signal (e.g., "食べたい" "ランチ" detected) */
  foodHandoffSignal?: boolean;
  /** movie domain handoff signal (e.g., "映画" detected) */
  movieHandoffSignal?: boolean;
  /** travel domain handoff signal (1-2 泊以上、PresenceMode escalate 候補) */
  travelHandoffSignal?: boolean;

  /** Cost band signal (caller 抽出済の band、point estimate ではない) */
  costBand?: ActivityCostBand;

  /** Weather code (normalized 4 値) */
  weather?: ActivityWeatherCode;

  /** Pair availability signal */
  pairAvailability?: "both" | "one_only" | "unknown";

  /**
   * Red-line absolute constraint codes (caller 抽出済 normalized、PII 不含).
   *
   * 例: ["no_alcohol", "no_long_walk"]
   *
   * 注: raw user message text 不可。caller が抽出した fixed code list のみ。
   */
  redLineCodes?: string[];

  /** Provisional threshold τ (default `PROVISIONAL_DEFAULT_THRESHOLD = 0.5`) */
  threshold?: number;
}

// ─────────────────────────────────────────────
// Output (raw text なし、enum reason のみ)
// ─────────────────────────────────────────────

/**
 * Activity intent extraction の結果 status.
 *
 *   - activity_eligible: Activity domain に dispatch 可 (confidence ≥ threshold)
 *   - activity_with_handoff: Activity で扱えるが、handoff candidate も併存 (rare)
 *   - needs_narrowing: signal 不足、progressive narrowing 必要
 *   - out_of_scope: Activity ではなく他 domain (food/movie/travel) handoff
 */
export type ActivityIntentResult =
  | "activity_eligible"
  | "activity_with_handoff"
  | "needs_narrowing"
  | "out_of_scope";

/**
 * Reason code (raw text 不可、enum only).
 *
 * 将来 reason code 追加時は MINOR version up。
 */
export type ActivityIntentReasonCode =
  | "no_signal"
  | "activity_signal_present"
  | "food_handoff_signal"
  | "movie_handoff_signal"
  | "travel_handoff_signal"
  | "multiple_domains_ambiguous"
  | "indoor_preference"
  | "outdoor_preference"
  | "hybrid_preference"
  | "short_duration"
  | "medium_duration"
  | "half_day_duration_future"
  | "novelty_seeking"
  | "routine_preference"
  | "familiar_preference"
  | "fatigue_high"
  | "fatigue_low"
  | "mood_relaxed"
  | "mood_energetic"
  | "mood_curious"
  | "mood_tired"
  | "weather_dependent_warning"
  | "weather_independent_preferred"
  | "weather_unknown_fallback"
  | "budget_cap_set"
  | "pair_both"
  | "pair_one_only"
  | "pair_unknown"
  | "red_line_present"
  | "above_threshold"
  | "below_threshold"
  | "handoff_priority_applied"
  | "fail_closed";

/**
 * Missing slot enum (どの slot が決定的に不足か、progressive narrowing 用).
 *
 * `needsNarrowing: true` のときの「何を user に問い直すか」の hint。
 * raw text 不可、固定 enum のみ。
 */
export type ActivityIntentMissingSlot =
  | "indoor_outdoor"
  | "duration"
  | "cost"
  | "novelty"
  | "weather"
  | "fatigue"
  | "pair"
  | "mood";

/**
 * Activity intent extraction の output.
 *
 * - `inferredActivityIntent`: 4 値 result status
 * - `suggestedTaxonomy`: 推定された taxonomy (部分、Partial)
 * - `handoffTarget`: 他 domain handoff candidate (Activity 外の場合)
 * - `needsNarrowing`: progressive narrowing 必要なら true
 * - `confidence`: 0-1 (provisional)
 * - `reasonCodes`: 確定理由 enum list (raw text 不可)
 * - `missingSlots`: 不足 slot enum list (progressive narrowing 用)
 * - `extractorVersion`: 本 extractor version (calibration 用)
 */
export interface ActivityIntentOutput {
  inferredActivityIntent: ActivityIntentResult;
  suggestedTaxonomy: Partial<ActivityTaxonomy>;
  handoffTarget?: ActivityHandoffTarget;
  needsNarrowing: boolean;
  confidence: number;
  reasonCodes: ActivityIntentReasonCode[];
  missingSlots: ActivityIntentMissingSlot[];
  extractorVersion: string;
}

// ─────────────────────────────────────────────
// Helper: confidence 計算 (pure)
// ─────────────────────────────────────────────

/**
 * Activity signal の数 + 重みから confidence (0-1) を計算 (pure).
 *
 * 各 signal の weight:
 *   - indoorOutdoor: 0.20
 *   - durationHint: 0.20
 *   - noveltyHint: 0.10
 *   - moodCode: 0.10
 *   - fatigueHint: 0.10
 *   - pairCompatibility: 0.10
 *   - costBand: 0.10
 *   - weather (known): 0.05
 *   - pairAvailability (known): 0.05
 *
 * Total max = 1.0、min = 0 (全 signal undefined)。
 */
function computeActivityConfidence(input: ActivityIntentInput): number {
  let score = 0;
  const hints = input.activityHints;
  if (hints?.indoorOutdoor !== undefined) score += 0.2;
  if (hints?.durationHint !== undefined) score += 0.2;
  if (hints?.noveltyHint !== undefined) score += 0.1;
  if (hints?.moodCode !== undefined && hints.moodCode !== "unknown") score += 0.1;
  if (hints?.fatigueHint !== undefined) score += 0.1;
  if (hints?.pairCompatibility !== undefined) score += 0.1;
  if (input.costBand !== undefined) score += 0.1;
  if (input.weather !== undefined && input.weather !== "unknown") score += 0.05;
  if (input.pairAvailability !== undefined && input.pairAvailability !== "unknown") score += 0.05;
  return Math.min(Math.max(score, 0), 1);
}

// ─────────────────────────────────────────────
// Helper: reasonCodes 集約 (pure)
// ─────────────────────────────────────────────

/**
 * Activity **core signal** reasons (activity-specific signal の有無を表す).
 *
 * **重要 (no_signal 判定の基準)**:
 *   activity core signal = indoorOutdoor / duration / novelty / mood (non-unknown)
 *   / fatigue / pairCompatibility / costBand。
 *
 *   weather / pair availability / red-line は **environment context signal** であり、
 *   activity 本体 signal ではない (collectContextReasons で別途集約)。empty input
 *   fail-closed 判定では core signal の有無のみを見る。
 */
function collectActivityCoreReasons(input: ActivityIntentInput): ActivityIntentReasonCode[] {
  const reasons: ActivityIntentReasonCode[] = [];
  const hints = input.activityHints;

  if (hints?.indoorOutdoor === "indoor") reasons.push("indoor_preference");
  if (hints?.indoorOutdoor === "outdoor") reasons.push("outdoor_preference");
  if (hints?.indoorOutdoor === "hybrid") reasons.push("hybrid_preference");

  if (hints?.durationHint === "short") reasons.push("short_duration");
  if (hints?.durationHint === "medium") reasons.push("medium_duration");
  if (hints?.durationHint === "half_day") reasons.push("half_day_duration_future");

  if (hints?.noveltyHint === "novelty") reasons.push("novelty_seeking");
  if (hints?.noveltyHint === "routine") reasons.push("routine_preference");
  if (hints?.noveltyHint === "familiar") reasons.push("familiar_preference");

  if (hints?.moodCode === "relaxed") reasons.push("mood_relaxed");
  if (hints?.moodCode === "energetic") reasons.push("mood_energetic");
  if (hints?.moodCode === "curious") reasons.push("mood_curious");
  if (hints?.moodCode === "tired") reasons.push("mood_tired");

  if (hints?.fatigueHint !== undefined) {
    if (hints.fatigueHint >= 4) reasons.push("fatigue_high");
    else if (hints.fatigueHint <= 2) reasons.push("fatigue_low");
  }

  if (input.costBand !== undefined) reasons.push("budget_cap_set");

  return reasons;
}

/**
 * Environment context reasons (weather / pair / red-line).
 *
 * Activity core signal の有無に関係なく、environment context を表現する reason。
 * `no_signal` fail-closed 判定では使わない。
 */
function collectContextReasons(input: ActivityIntentInput): ActivityIntentReasonCode[] {
  const reasons: ActivityIntentReasonCode[] = [];

  if (input.weather === "rainy") reasons.push("weather_dependent_warning");
  if (input.weather === "sunny" || input.weather === "cloudy") {
    reasons.push("weather_independent_preferred");
  }
  if (input.weather === "unknown" || input.weather === undefined) {
    reasons.push("weather_unknown_fallback");
  }

  if (input.pairAvailability === "both") reasons.push("pair_both");
  if (input.pairAvailability === "one_only") reasons.push("pair_one_only");
  if (input.pairAvailability === "unknown" || input.pairAvailability === undefined) {
    reasons.push("pair_unknown");
  }

  if (input.redLineCodes !== undefined && input.redLineCodes.length > 0) {
    reasons.push("red_line_present");
  }

  return reasons;
}

// ─────────────────────────────────────────────
// Helper: suggested taxonomy 構築 (pure、partial)
// ─────────────────────────────────────────────

function buildSuggestedTaxonomy(input: ActivityIntentInput): Partial<ActivityTaxonomy> {
  const taxonomy: Partial<ActivityTaxonomy> = {};
  const hints = input.activityHints;

  if (hints?.indoorOutdoor !== undefined) taxonomy.indoorOutdoor = hints.indoorOutdoor;
  if (hints?.durationHint !== undefined) taxonomy.durationBand = hints.durationHint;
  if (hints?.noveltyHint !== undefined) taxonomy.noveltyLevel = hints.noveltyHint;
  if (hints?.fatigueHint !== undefined) taxonomy.fatigueLevel = hints.fatigueHint;
  if (hints?.pairCompatibility !== undefined) taxonomy.pairCompatibility = hints.pairCompatibility;
  if (input.costBand !== undefined) taxonomy.costBand = input.costBand;

  // weather dependency: weather signal がある場合のみ補完
  if (input.weather === "sunny" || input.weather === "cloudy") {
    // 晴 / 曇 → outdoor も OK、weather dependency は未確定 (caller infer)
  } else if (input.weather === "rainy") {
    // 雨 → weather_dependent 候補は警告 (output reasonCodes で表現)
    const dependency: ActivityWeatherDependency = "weather_independent";
    taxonomy.weatherDependency = dependency;
  }

  return taxonomy;
}

// ─────────────────────────────────────────────
// Helper: missing slots 検出 (pure)
// ─────────────────────────────────────────────

function detectMissingSlots(input: ActivityIntentInput): ActivityIntentMissingSlot[] {
  const missing: ActivityIntentMissingSlot[] = [];
  const hints = input.activityHints;

  if (hints?.indoorOutdoor === undefined) missing.push("indoor_outdoor");
  if (hints?.durationHint === undefined) missing.push("duration");
  if (input.costBand === undefined) missing.push("cost");
  if (hints?.noveltyHint === undefined) missing.push("novelty");
  if (input.weather === undefined || input.weather === "unknown") missing.push("weather");
  if (hints?.fatigueHint === undefined) missing.push("fatigue");
  if (input.pairAvailability === undefined || input.pairAvailability === "unknown") {
    missing.push("pair");
  }
  if (hints?.moodCode === undefined || hints.moodCode === "unknown") missing.push("mood");

  return missing;
}

// ─────────────────────────────────────────────
// Helper: handoff target 判定 (pure)
// ─────────────────────────────────────────────

/**
 * Handoff target を判定 (PR #126 §4.3 Domain boundary 規則).
 *
 * 規則: food > movie > travel の順で優先 (food が cafe 含むため最先勝ち、§4.3)。
 * 複数 handoff signal が立った場合は ambiguous (multi-handoff)。
 */
function detectHandoffTarget(input: ActivityIntentInput): {
  target?: ActivityHandoffTarget;
  ambiguous: boolean;
} {
  const signals: ActivityHandoffTarget[] = [];
  if (input.foodHandoffSignal === true) signals.push("food");
  if (input.movieHandoffSignal === true) signals.push("movie");
  if (input.travelHandoffSignal === true) signals.push("travel");

  if (signals.length === 0) return { ambiguous: false };
  if (signals.length === 1) return { target: signals[0], ambiguous: false };
  // 複数 handoff signal: ambiguous、food を最優先で返す (caller decide)
  return { target: signals[0], ambiguous: true };
}

// ─────────────────────────────────────────────
// Main extractor (pure function、deterministic、stateless)
// ─────────────────────────────────────────────

/**
 * Daily mode 内の user signal を Activity intent / slot に変換する pure function.
 *
 * **本関数は純関数**: 同じ input → 同じ output、副作用なし、`Math.random` 不使用、
 * 現在時刻参照なし、external state 参照なし。
 *
 * **構造的安全 (raw text leakage 防止)**:
 *   - input は normalized signal のみ、raw user text 受領なし
 *   - output reasonCodes / missingSlots は enum のみ、free text なし
 *   - 型レベルで PII / raw prompt 構造的に保存不能
 *
 * **handoff target 優先判定**:
 *   - food / movie / travel handoff signal が立てば Activity logic より先に handoff
 *   - 複数 handoff signal → ambiguous (food 最優先で返す、caller decide)
 *
 * **progressive narrowing**:
 *   - confidence < threshold → needsNarrowing = true
 *   - missingSlots で「何が不足か」を明示
 *
 * @param input Activity intent input (normalized signal、raw text 受領なし)
 * @returns Activity intent / suggested taxonomy / handoff / narrowing / confidence
 */
export function inferActivityIntent(input: ActivityIntentInput): ActivityIntentOutput {
  const threshold = input.threshold ?? PROVISIONAL_DEFAULT_THRESHOLD;
  const reasonCodes: ActivityIntentReasonCode[] = [];

  // 1. Handoff target 優先判定 (PR #126 §4.3 規則)
  const handoff = detectHandoffTarget(input);
  if (handoff.target !== undefined) {
    if (handoff.target === "food") reasonCodes.push("food_handoff_signal");
    if (handoff.target === "movie") reasonCodes.push("movie_handoff_signal");
    if (handoff.target === "travel") reasonCodes.push("travel_handoff_signal");
    if (handoff.ambiguous) reasonCodes.push("multiple_domains_ambiguous");
    reasonCodes.push("handoff_priority_applied");

    return {
      inferredActivityIntent: "out_of_scope",
      suggestedTaxonomy: {},
      handoffTarget: handoff.target,
      needsNarrowing: false,
      confidence: 0,
      reasonCodes,
      missingSlots: [],
      extractorVersion: INTENT_EXTRACTOR_VERSION,
    };
  }

  // 2. Activity core signal 集約 (no_signal 判定の基準)
  const confidence = computeActivityConfidence(input);
  const coreReasons = collectActivityCoreReasons(input);

  // 3. Activity core signal の有無 (no_signal fail-closed 判定)
  //    weather / pair / red-line は environment context、本判定では使わない
  if (coreReasons.length === 0) {
    reasonCodes.push("no_signal");
    reasonCodes.push("fail_closed");
    return {
      inferredActivityIntent: "needs_narrowing",
      suggestedTaxonomy: {},
      needsNarrowing: true,
      confidence: 0,
      reasonCodes,
      missingSlots: detectMissingSlots(input),
      extractorVersion: INTENT_EXTRACTOR_VERSION,
    };
  }

  // 4. Core signal あり: context reasons も合わせて集約
  reasonCodes.push(...coreReasons);
  reasonCodes.push(...collectContextReasons(input));
  reasonCodes.push("activity_signal_present");

  // 5. Suggested taxonomy 構築
  const suggestedTaxonomy = buildSuggestedTaxonomy(input);

  // 6. Missing slots 検出
  const missingSlots = detectMissingSlots(input);

  // 7. Threshold 判定
  if (confidence >= threshold) {
    reasonCodes.push("above_threshold");
    return {
      inferredActivityIntent: "activity_eligible",
      suggestedTaxonomy,
      needsNarrowing: false,
      confidence,
      reasonCodes,
      missingSlots,
      extractorVersion: INTENT_EXTRACTOR_VERSION,
    };
  }

  // 7. 不足: progressive narrowing
  reasonCodes.push("below_threshold");
  return {
    inferredActivityIntent: "needs_narrowing",
    suggestedTaxonomy,
    needsNarrowing: true,
    confidence,
    reasonCodes,
    missingSlots,
    extractorVersion: INTENT_EXTRACTOR_VERSION,
  };
}
