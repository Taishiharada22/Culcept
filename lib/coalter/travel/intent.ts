/**
 * CoAlter Travel Domain — Intent / Slot Extraction (T2 phase)
 *
 * 正本:
 *   - docs/coalter-travel-domain-greenfield-design.md (PR #124、design completion)
 *   - docs/coalter-master-design.md v1.2 §13.3 (Travel reflection)
 *   - lib/coalter/travel/types.ts (Batch-C PR #131、T1 phase)
 *
 * 役割:
 *   1-2 泊国内旅行 MVP scope の user signal を **Travel intent / slot signals** に
 *   変換する **pure function**。runtime-capable pure library code、call-site
 *   wiring 0、production behavior 0 変化 (CEO 2026-05-15 表現精度継承)。
 *
 * **MVP scope (CEO 指示)**:
 *   - 1 泊 2 日 / 2 泊 3 日 国内旅行のみ
 *   - 海外旅行 / 任意期間 / 予約 API 連携 / 宿泊 API / 交通 API は **future scope**
 *     (本 intent では「unsupported」signal で fail-closed 返却)
 *
 * 構造的安全設計 (Gap 4 D2 + AD2/AD3 + DD2/DD3 + AD4 継承):
 *   1. **raw text leakage 構造的防止** (型レベル enforcement):
 *      - input は **normalized signal / lightweight context** のみ (全 enum/boolean/number)
 *      - output reasonCodes は `TravelIntentReasonCode` enum のみ
 *      - missingSlots は `TravelIntentMissingSlot` enum のみ
 *      - destinationSignals 等は enum のみ、raw text 不可 (型レベル enforcement)
 *   2. **provisional values** (CEO 補正反映):
 *      - `PROVISIONAL_DEFAULT_THRESHOLD = 0.5` (override 可)
 *      - `PROVISIONAL_OVERNIGHT_FATIGUE_FLOOR = 3` (1 泊以上で疲労低過ぎ→warning)
 *      - 最終値は T3-T7 phase で実 data 観測後決定
 *   3. **fail-closed default**:
 *      - 全 input undefined → unclear_or_narrowing / needsNarrowing / confidence 0
 *      - 海外 signal → unsupported_overseas (fail-closed、future scope)
 *      - 任意長期 signal → unsupported_extended (fail-closed、future scope)
 *      - 過剰発火しない
 *   4. **handoff target 優先判定**:
 *      - activity / daily / food signal が立てば travel logic より優先で handoff
 *      - 1 泊以上明示 + 短時間 signal は ambiguous → narrowing
 *   5. **deterministic**:
 *      - 純関数、stateless、Math.random 不使用、external state 参照なし
 *   6. **3 軸混同回避** (Master Design v1.2 §13.6、PR #122):
 *      - Axis A: Action Mode → 本 intent の責務外 (handoff 提案のみ)
 *      - Axis B: Presence Mode → 本 intent は presence 独立 (caller 側 mode 判定)
 *      - Axis C: Domain → 本 intent の責務 (travel intent extraction)
 *
 * 人間超越設計 9 要素 (Gap 4 D2 + AD2/AD3 + DD2/DD3/AD4 継承 + T2 拡張):
 *   1. **raw text leakage 構造的防止** (上記)
 *   2. **provisional values** (上記)
 *   3. **fail-closed default** (上記)
 *   4. **travelScope 7 階層**: day_trip_excursion / overnight_one_night /
 *      overnight_two_nights / unsupported_overseas / unsupported_extended /
 *      unclear_or_narrowing / out_of_scope_short
 *   5. **intentReadiness 4 階層**: vague_wish / exploratory / actionable_planning /
 *      immediate_planning (時間軸の人間特有曖昧性に対応)
 *   6. **purpose signal 8 値**: relax_recharge / discover_new_place /
 *      seasonal_experience / culture_history / nature_immersion /
 *      celebrate_occasion / pair_connection / unknown
 *   7. **transit vs onSite fatigue 分離**: 移動疲労と滞在疲労を別軸で持つ
 *   8. **pairTogetherness 4 値**: 独立行動 tolerance 表現 (pair travel 特有)
 *   9. **confidence dimension 別 + geometric mean**: 最弱 dimension を強調
 *
 * 後続 phase (本 PR scope 外):
 *   - T3: generator (Itinerary candidate generator、別 PR)
 *   - T4: comparator (Pareto axis 別 trade-off 提示、別 PR)
 *   - T5: resolver (constraint resolver / conflict explanation、別 PR)
 *   - T6: UI presentation (Product Unit 連携、別 PR)
 *   - T7: Step E orchestrator wiring (CEO 戦略判断、別 PR)
 *
 * 本 PR の不可触 (CEO 2026-05-15 制約):
 *   - runtime call-site wiring / orchestrator 接続 / Daily planner 接続 / DomainRouter 接続
 *   - ChatClient / UpperLayerMount / route / API / env / flags / migration
 *   - external API / booking API / Places API (Travel-future scope)
 *   - lib/coalter/travel/types.ts 既存 type touch (新 type は本 file local 定義)
 *   - Activity AD5 / Daily DD4 / Gap 4 D3 実装
 */

import type {
  TravelFatigueLevel,
  TravelBudgetBand,
} from "./types";

// ─────────────────────────────────────────────
// intent extractor version
// ─────────────────────────────────────────────

/**
 * Travel intent extractor version (semver).
 *
 * 後続 calibration で version 別観測可。
 */
export const TRAVEL_INTENT_EXTRACTOR_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// provisional values (確定値ではない)
// ─────────────────────────────────────────────

/**
 * Provisional default threshold τ (CEO 2026-05-15 補正済、確定値ではない).
 *
 * 最終値は T5/T6 phase で実 data 観測後決定。
 * input.threshold で config arg override 可。
 *
 * 意味:
 *   - τ = 0 → 全 signal で travel_eligible 判定 (over-firing risk)
 *   - τ = 0.5 → 中庸 default candidate (本 PR 暫定値)
 *   - τ = 1.0 → 全抑止 (kill switch)
 */
export const PROVISIONAL_DEFAULT_THRESHOLD = 0.5;

/**
 * Provisional overnight fatigue floor (1 泊以上で transit fatigue 低過ぎ→warning).
 *
 * 1 泊以上の旅行で transitFatigue が 3 未満は「移動が軽すぎる」=「実は近場?
 * activity handoff?」suspicion signal。直接 narrowing ではなく warning reason 付与。
 */
export const PROVISIONAL_OVERNIGHT_FATIGUE_FLOOR: TravelFatigueLevel = 3;

/**
 * Provisional minimum estimated budget (円) for 1-night domestic travel.
 *
 * point estimate ではなく floor 値、budget=tight + 1 泊以上 → caution reason 付与。
 * future calibration で実 data 観測後決定。
 */
export const PROVISIONAL_OVERNIGHT_BUDGET_FLOOR_JPY = 10000;

// ─────────────────────────────────────────────
// Auxiliary normalized signal enums (本 file local、raw text 不可)
// ─────────────────────────────────────────────

/**
 * Destination code (normalized signal、raw place name 不可).
 *
 * MVP では 6 値 (国内地域 coarse + 海外 + unknown):
 *   - domestic_kanto: 関東
 *   - domestic_kansai: 関西
 *   - domestic_chubu: 中部
 *   - domestic_tohoku_hokkaido: 東北・北海道
 *   - domestic_chugoku_shikoku_kyushu_okinawa: 中四国・九州・沖縄
 *   - domestic_other: 国内その他
 *   - overseas: 海外 (本 MVP では unsupported)
 *   - unknown: signal なし
 */
export type TravelDestinationCode =
  | "domestic_kanto"
  | "domestic_kansai"
  | "domestic_chubu"
  | "domestic_tohoku_hokkaido"
  | "domestic_chugoku_shikoku_kyushu_okinawa"
  | "domestic_other"
  | "overseas"
  | "unknown";

/**
 * Duration hint (normalized signal、raw text 不可).
 *
 * MVP では 1-2 泊国内、それ以外は future scope:
 *   - day_trip: 日帰り (出かけだが宿泊なし、travel-light か activity か境界)
 *   - one_night: 1 泊 2 日 (MVP 核)
 *   - two_nights: 2 泊 3 日 (MVP 核)
 *   - three_or_more_nights: 3 泊以上 (future scope、unsupported)
 *   - arbitrary_long: 任意長期 (future scope、unsupported)
 *   - unknown: signal なし
 */
export type TravelDurationHint =
  | "day_trip"
  | "one_night"
  | "two_nights"
  | "three_or_more_nights"
  | "arbitrary_long"
  | "unknown";

/**
 * Budget hint (normalized signal、raw amount 不可).
 *
 * point estimate ではなく band:
 *   - tight: 〜2 万円 (1 泊国内 minimum 想定)
 *   - moderate: 2-5 万円 (1-2 泊国内 standard)
 *   - ample: 5-10 万円 (高級旅館 / 体験 etc)
 *   - unbounded: 上限なし
 *   - unknown: signal なし
 */
export type TravelBudgetHint = "tight" | "moderate" | "ample" | "unbounded" | "unknown";

/**
 * Purpose signal (人間超越設計 Idea 6、8 値):
 *
 *   - relax_recharge: 温泉 / リラックス
 *   - discover_new_place: 新規開拓
 *   - seasonal_experience: 紅葉 / 桜 / 花火 等季節限定
 *   - culture_history: 歴史 / 文化体験
 *   - nature_immersion: 山 / 海 / 自然
 *   - celebrate_occasion: 誕生日 / 記念日 / 結婚祝い
 *   - pair_connection: 関係深化目的
 *   - unknown: signal なし
 */
export type TravelPurposeSignal =
  | "relax_recharge"
  | "discover_new_place"
  | "seasonal_experience"
  | "culture_history"
  | "nature_immersion"
  | "celebrate_occasion"
  | "pair_connection"
  | "unknown";

/**
 * Seasonal signal (normalized、raw date 不可).
 *
 *   - spring_peak: 桜 / 花見シーズン
 *   - summer_peak: 夏休み / 海・山 peak
 *   - autumn_peak: 紅葉
 *   - winter_peak: 雪 / イルミネーション
 *   - off_season: peak 外
 *   - unknown
 */
export type TravelSeasonalSignal =
  | "spring_peak"
  | "summer_peak"
  | "autumn_peak"
  | "winter_peak"
  | "off_season"
  | "unknown";

/**
 * Weather forecast signal (normalized、raw forecast text 不可).
 *
 *   - clear: 安定 (晴 / 曇)
 *   - unstable: 不安定 (にわか雨等)
 *   - heavy_rain: 大雨
 *   - snow: 雪
 *   - typhoon_warning: 台風警報 (travel-fatal risk)
 *   - unknown
 */
export type TravelWeatherForecastSignal =
  | "clear"
  | "unstable"
  | "heavy_rain"
  | "snow"
  | "typhoon_warning"
  | "unknown";

/**
 * Pair togetherness (人間超越設計 Idea 8、独立行動 tolerance):
 *
 *   - together_all_time: 常に一緒
 *   - together_main_separate_some: 主は一緒、一部独立
 *   - flexible_split: 独立 OK
 *   - unknown
 */
export type TravelPairTogetherness =
  | "together_all_time"
  | "together_main_separate_some"
  | "flexible_split"
  | "unknown";

/**
 * Intent readiness (人間超越設計 Idea 5、時間軸曖昧性):
 *
 *   - vague_wish: いつか、未定 ("いつか行きたい")
 *   - exploratory: 近々、調査中 ("今月どこか")
 *   - actionable_planning: 具体、今月以内 ("来週末")
 *   - immediate_planning: 緊急、今週 ("明日 / 今週末")
 *   - unknown
 */
export type TravelIntentReadiness =
  | "vague_wish"
  | "exploratory"
  | "actionable_planning"
  | "immediate_planning"
  | "unknown";

/**
 * Day trip boundary (人間超越設計 Idea 7、日帰り境界曖昧性):
 *
 *   - clear_day_trip: 1 日内で完結、activity 寄り
 *   - extended_day_trip: 10 時間以上、travel-light 寄り
 *   - overnight_required: 帰宅困難、確実 travel
 *   - unknown
 */
export type TravelDayTripBoundary =
  | "clear_day_trip"
  | "extended_day_trip"
  | "overnight_required"
  | "unknown";

// ─────────────────────────────────────────────
// Input (normalized signal only、raw text 受領なし)
// ─────────────────────────────────────────────

/**
 * Travel signal hints (caller 抽出済の normalized signal).
 *
 * **重要**: raw user text を含めない。caller 側で text → enum / boolean に変換した
 * 結果のみを受領。本 type は travel-specific signal の集約。
 */
export interface TravelSignalHints {
  /** Destination hint (normalized 8 値) */
  destinationHint?: TravelDestinationCode;
  /** Duration hint (normalized 6 値) */
  durationHint?: TravelDurationHint;
  /** Budget hint (normalized 5 値) */
  budgetHint?: TravelBudgetHint;
  /** Transit fatigue hint (1-5、移動疲労、人間超越 Idea 7) */
  transitFatigueHint?: TravelFatigueLevel;
  /** On-site fatigue hint (1-5、滞在疲労、人間超越 Idea 7) */
  onSiteFatigueHint?: TravelFatigueLevel;
  /** Purpose signal (normalized 8 値) */
  purposeHint?: TravelPurposeSignal;
  /** Seasonal signal (normalized 6 値) */
  seasonalHint?: TravelSeasonalSignal;
  /** Weather forecast signal (normalized 6 値) */
  weatherForecastHint?: TravelWeatherForecastSignal;
  /** Pair togetherness (normalized 4 値、人間超越 Idea 8) */
  pairTogethernessHint?: TravelPairTogetherness;
  /** Intent readiness (normalized 5 値、人間超越 Idea 5) */
  intentReadinessHint?: TravelIntentReadiness;
  /** Day trip boundary (normalized 4 値、人間超越 Idea 7) */
  dayTripBoundaryHint?: TravelDayTripBoundary;
}

/**
 * Travel intent extraction input.
 *
 * **構造的安全 (raw text leakage 防止)**:
 *   全 field は **normalized signal / lightweight context** のみ。
 *   `string` 値を含む field でも raw user text ではなく、caller 抽出済の
 *   normalized code (例: redLineCodes = ["no_long_drive"]) を期待。
 */
export interface TravelIntentInput {
  /** Travel-specific signal hints (caller 抽出済) */
  travelHints?: TravelSignalHints;

  /** Activity domain handoff signal (短時間外出 → activity 寄り) */
  activityHandoffSignal?: boolean;
  /** Daily domain handoff signal (daily mode の中で travel mention) */
  dailyHandoffSignal?: boolean;
  /** Food domain handoff signal (グルメ旅 → food 主体? caller decide) */
  foodHandoffSignal?: boolean;

  /**
   * Red-line absolute constraint codes (caller 抽出済 normalized、PII 不含).
   *
   * 例: ["no_long_drive", "no_overseas", "max_budget_30000"]
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
 * Travel intent extraction の結果 status.
 *
 *   - travel_eligible: Travel domain に dispatch 可 (confidence ≥ threshold + MVP scope)
 *   - travel_with_handoff: Travel で扱えるが、handoff candidate も併存 (rare)
 *   - needs_narrowing: signal 不足、progressive narrowing 必要
 *   - out_of_scope_handoff: Travel ではなく他 domain (activity/daily/food) handoff
 *   - unsupported_future: 海外 / 任意長期 / booking API 等 future scope (fail-closed)
 */
export type TravelIntentResult =
  | "travel_eligible"
  | "travel_with_handoff"
  | "needs_narrowing"
  | "out_of_scope_handoff"
  | "unsupported_future";

/**
 * Travel scope (人間超越設計 Idea 4、7 階層).
 *
 *   - day_trip_excursion: 日帰り長距離 (境界、travel-light 寄り)
 *   - overnight_one_night: 1 泊 2 日 (MVP 核)
 *   - overnight_two_nights: 2 泊 3 日 (MVP 核)
 *   - unsupported_overseas: 海外 (future scope、fail-closed)
 *   - unsupported_extended: 3 泊以上 / 任意長期 (future scope、fail-closed)
 *   - unclear_or_narrowing: signal 不足、narrowing 必要
 *   - out_of_scope_short: 短時間外出、activity handoff 推奨
 */
export type TravelScope =
  | "day_trip_excursion"
  | "overnight_one_night"
  | "overnight_two_nights"
  | "unsupported_overseas"
  | "unsupported_extended"
  | "unclear_or_narrowing"
  | "out_of_scope_short";

/**
 * Handoff target (Travel ではない場合).
 *
 *   - activity: Activity domain (短時間外出)
 *   - daily: Daily domain (daily mode の中で travel mention)
 *   - food: Food domain (グルメ旅、caller decide)
 *   - future_scope: 海外 / 長期 等 future
 */
export type TravelHandoffTarget = "activity" | "daily" | "food" | "future_scope";

/**
 * Suggested constraint signal (caller 側で具体 constraint に変換).
 *
 *   - budget_band_inferred: budget band 推定可
 *   - duration_one_night_inferred: 1 泊推定
 *   - duration_two_nights_inferred: 2 泊推定
 *   - fatigue_floor_warning: overnight + transit fatigue 低過ぎ warning
 *   - weather_risk_high: 台風 / 大雨 / 大雪 warning
 *   - seasonal_peak_warning: peak 時期、混雑 warning
 *   - pair_split_compatible: pair 独立行動 tolerance あり
 *   - red_line_constraint_inferred: red-line codes 検出
 */
export type TravelSuggestedConstraintCode =
  | "budget_band_inferred"
  | "duration_one_night_inferred"
  | "duration_two_nights_inferred"
  | "fatigue_floor_warning"
  | "weather_risk_high"
  | "seasonal_peak_warning"
  | "pair_split_compatible"
  | "red_line_constraint_inferred";

/**
 * Fatigue signal snapshot (人間超越設計 Idea 7、transit vs onSite 分離).
 */
export interface TravelFatigueSignalSnapshot {
  transitFatigue?: TravelFatigueLevel;
  onSiteFatigue?: TravelFatigueLevel;
  /** combined (max of transit / onSite、caller 側で具体 derive) */
  combined?: TravelFatigueLevel;
}

/**
 * Confidence by dimension (人間超越設計 Idea 9、最弱 dimension 強調).
 *
 * 各 dimension 信頼度を個別に持ち、overall は geometric mean (最弱を強調)。
 */
export interface TravelConfidenceByDimension {
  destination: number;
  duration: number;
  budget: number;
  fatigue: number;
  pair: number;
  readiness: number;
  weather: number;
  /** overall は geometric mean (最弱を強調) */
  overallGeometric: number;
}

/**
 * Reason code (raw text 不可、enum only).
 *
 * 将来 reason code 追加時は MINOR version up。
 */
export type TravelIntentReasonCode =
  | "no_signal"
  | "travel_signal_present"
  | "destination_domestic_specified"
  | "destination_overseas_unsupported"
  | "destination_unknown"
  | "duration_day_trip"
  | "duration_one_night"
  | "duration_two_nights"
  | "duration_three_or_more_unsupported"
  | "duration_arbitrary_long_unsupported"
  | "duration_unknown"
  | "budget_tight"
  | "budget_moderate"
  | "budget_ample"
  | "budget_unbounded"
  | "budget_unknown"
  | "budget_floor_warning"
  | "fatigue_transit_specified"
  | "fatigue_onsite_specified"
  | "fatigue_overnight_floor_warning"
  | "fatigue_unknown"
  | "purpose_specified"
  | "purpose_unknown"
  | "seasonal_peak_present"
  | "seasonal_off_present"
  | "seasonal_unknown"
  | "weather_clear"
  | "weather_unstable"
  | "weather_heavy_rain"
  | "weather_snow"
  | "weather_typhoon_warning"
  | "weather_unknown"
  | "pair_together_all_time"
  | "pair_split_compatible"
  | "pair_unknown"
  | "readiness_vague_wish"
  | "readiness_exploratory"
  | "readiness_actionable_planning"
  | "readiness_immediate_planning"
  | "readiness_unknown"
  | "day_trip_boundary_clear"
  | "day_trip_boundary_extended"
  | "day_trip_boundary_overnight_required"
  | "red_line_present"
  | "activity_handoff_signal"
  | "daily_handoff_signal"
  | "food_handoff_signal"
  | "multiple_domains_ambiguous"
  | "handoff_priority_applied"
  | "above_threshold"
  | "below_threshold"
  | "fail_closed"
  | "unsupported_future_scope";

/**
 * Missing slot enum (どの slot が決定的に不足か、progressive narrowing 用).
 *
 * `needsNarrowing: true` のときの「何を user に問い直すか」の hint。
 * raw text 不可、固定 enum のみ。
 */
export type TravelIntentMissingSlot =
  | "destination"
  | "duration"
  | "budget"
  | "transit_fatigue"
  | "onsite_fatigue"
  | "purpose"
  | "seasonal"
  | "weather"
  | "pair"
  | "readiness"
  | "day_trip_boundary";

/**
 * Travel intent extraction の output.
 *
 * - `inferredTravelIntent`: 5 値 result status
 * - `travelScope`: 7 階層 scope
 * - `suggestedConstraints`: 部分 constraint signal list (caller 側で具体 constraint に変換)
 * - `destinationSignals`: destination enum signal list
 * - `durationSignals`: duration enum signal list
 * - `budgetSignals`: budget enum signal list
 * - `fatigueSignals`: transit / onSite / combined fatigue snapshot
 * - `handoffTarget`: 他 domain handoff candidate (Travel 外の場合)
 * - `needsNarrowing`: progressive narrowing 必要なら true
 * - `missingSlots`: 不足 slot enum list (progressive narrowing 用)
 * - `confidence`: 0-1 (overall geometric mean、provisional)
 * - `confidenceByDimension`: dimension 別 confidence (optional、debug 用)
 * - `reasonCodes`: 確定理由 enum list (raw text 不可)
 * - `intentVersion`: 本 extractor version (calibration 用)
 */
export interface TravelIntentOutput {
  inferredTravelIntent: TravelIntentResult;
  travelScope: TravelScope;
  suggestedConstraints: TravelSuggestedConstraintCode[];
  destinationSignals: TravelDestinationCode[];
  durationSignals: TravelDurationHint[];
  budgetSignals: TravelBudgetHint[];
  fatigueSignals: TravelFatigueSignalSnapshot;
  handoffTarget?: TravelHandoffTarget;
  needsNarrowing: boolean;
  missingSlots: TravelIntentMissingSlot[];
  confidence: number;
  confidenceByDimension?: TravelConfidenceByDimension;
  reasonCodes: TravelIntentReasonCode[];
  intentVersion: string;
}

// ─────────────────────────────────────────────
// Helper: dimension 別 confidence (pure)
// ─────────────────────────────────────────────

/**
 * Travel signal の dimension 別 confidence 計算 (pure).
 *
 * 各 dimension は 0-1 (signal あり=1、unknown=0、partial=0.5):
 *   - destination: destinationHint != undefined && != "unknown"
 *   - duration: durationHint != undefined && != "unknown"
 *   - budget: budgetHint != undefined && != "unknown"
 *   - fatigue: transitFatigueHint or onSiteFatigueHint signal present
 *   - pair: pairTogethernessHint != undefined && != "unknown"
 *   - readiness: intentReadinessHint != undefined && != "unknown"
 *   - weather: weatherForecastHint != undefined && != "unknown"
 *
 * **overall は geometric mean** (最弱 dimension を強調).
 *
 * 1 つでも 0 があれば overall = 0 → small epsilon (0.05) 加算で 0 回避。
 */
function computeConfidenceByDimension(
  input: TravelIntentInput,
): TravelConfidenceByDimension {
  const hints = input.travelHints;
  const knownOrPartial = (val: unknown, unknownLiteral: string): number => {
    if (val === undefined) return 0;
    if (val === unknownLiteral) return 0;
    return 1;
  };

  const destination = knownOrPartial(hints?.destinationHint, "unknown");
  const duration = knownOrPartial(hints?.durationHint, "unknown");
  const budget = knownOrPartial(hints?.budgetHint, "unknown");
  const pair = knownOrPartial(hints?.pairTogethernessHint, "unknown");
  const readiness = knownOrPartial(hints?.intentReadinessHint, "unknown");
  const weather = knownOrPartial(hints?.weatherForecastHint, "unknown");

  // fatigue は transit / onSite 何れか signal あれば 1、両方なら 1、片方のみ 0.5
  let fatigue = 0;
  if (hints?.transitFatigueHint !== undefined) fatigue += 0.5;
  if (hints?.onSiteFatigueHint !== undefined) fatigue += 0.5;

  // geometric mean (最弱を強調) — 0 dimension を 0.001 epsilon に置換
  // (epsilon を小さく取ることで「最弱 dimension の影響を強める」設計を厳格化)
  const epsilon = 0.001;
  const dims = [destination, duration, budget, fatigue, pair, readiness, weather].map((d) =>
    d === 0 ? epsilon : d,
  );
  const product = dims.reduce((a, b) => a * b, 1);
  const overallGeometric = Math.pow(product, 1 / dims.length);

  return {
    destination,
    duration,
    budget,
    fatigue,
    pair,
    readiness,
    weather,
    overallGeometric,
  };
}

// ─────────────────────────────────────────────
// Helper: core signal 集約 (pure、travel-specific のみ)
// ─────────────────────────────────────────────

/**
 * Travel **core signal** reasons (travel-specific signal の有無を表す).
 *
 * **重要 (no_signal 判定の基準)**:
 *   travel core signal = destination / duration / budget / purpose / fatigue。
 *
 *   pair / readiness / weather / seasonal / dayTripBoundary は **context signal** であり、
 *   travel 本体 signal ではない (collectContextReasons で別途集約)。empty input
 *   fail-closed 判定では core signal の有無のみを見る。
 */
function collectTravelCoreReasons(input: TravelIntentInput): TravelIntentReasonCode[] {
  const reasons: TravelIntentReasonCode[] = [];
  const hints = input.travelHints;

  // destination
  if (hints?.destinationHint !== undefined) {
    if (hints.destinationHint === "overseas") {
      reasons.push("destination_overseas_unsupported");
    } else if (hints.destinationHint === "unknown") {
      reasons.push("destination_unknown");
    } else {
      reasons.push("destination_domestic_specified");
    }
  }

  // duration
  if (hints?.durationHint !== undefined) {
    if (hints.durationHint === "day_trip") reasons.push("duration_day_trip");
    else if (hints.durationHint === "one_night") reasons.push("duration_one_night");
    else if (hints.durationHint === "two_nights") reasons.push("duration_two_nights");
    else if (hints.durationHint === "three_or_more_nights") {
      reasons.push("duration_three_or_more_unsupported");
    } else if (hints.durationHint === "arbitrary_long") {
      reasons.push("duration_arbitrary_long_unsupported");
    } else {
      reasons.push("duration_unknown");
    }
  }

  // budget
  if (hints?.budgetHint !== undefined) {
    if (hints.budgetHint === "tight") reasons.push("budget_tight");
    else if (hints.budgetHint === "moderate") reasons.push("budget_moderate");
    else if (hints.budgetHint === "ample") reasons.push("budget_ample");
    else if (hints.budgetHint === "unbounded") reasons.push("budget_unbounded");
    else reasons.push("budget_unknown");
  }

  // purpose
  if (hints?.purposeHint !== undefined && hints.purposeHint !== "unknown") {
    reasons.push("purpose_specified");
  }

  // fatigue (transit / onSite 分離)
  if (hints?.transitFatigueHint !== undefined) reasons.push("fatigue_transit_specified");
  if (hints?.onSiteFatigueHint !== undefined) reasons.push("fatigue_onsite_specified");

  return reasons;
}

/**
 * Context signal reasons (weather / seasonal / pair / readiness / dayTripBoundary).
 *
 * Travel core signal の有無に関係なく、context を表現する reason。
 * `no_signal` fail-closed 判定では使わない。
 */
function collectContextReasons(input: TravelIntentInput): TravelIntentReasonCode[] {
  const reasons: TravelIntentReasonCode[] = [];
  const hints = input.travelHints;

  // weather forecast
  if (hints?.weatherForecastHint === "clear") reasons.push("weather_clear");
  else if (hints?.weatherForecastHint === "unstable") reasons.push("weather_unstable");
  else if (hints?.weatherForecastHint === "heavy_rain") reasons.push("weather_heavy_rain");
  else if (hints?.weatherForecastHint === "snow") reasons.push("weather_snow");
  else if (hints?.weatherForecastHint === "typhoon_warning") reasons.push("weather_typhoon_warning");
  else reasons.push("weather_unknown");

  // seasonal
  if (
    hints?.seasonalHint === "spring_peak" ||
    hints?.seasonalHint === "summer_peak" ||
    hints?.seasonalHint === "autumn_peak" ||
    hints?.seasonalHint === "winter_peak"
  ) {
    reasons.push("seasonal_peak_present");
  } else if (hints?.seasonalHint === "off_season") {
    reasons.push("seasonal_off_present");
  } else {
    reasons.push("seasonal_unknown");
  }

  // pair togetherness
  if (hints?.pairTogethernessHint === "together_all_time") {
    reasons.push("pair_together_all_time");
  } else if (
    hints?.pairTogethernessHint === "together_main_separate_some" ||
    hints?.pairTogethernessHint === "flexible_split"
  ) {
    reasons.push("pair_split_compatible");
  } else {
    reasons.push("pair_unknown");
  }

  // intent readiness
  if (hints?.intentReadinessHint === "vague_wish") reasons.push("readiness_vague_wish");
  else if (hints?.intentReadinessHint === "exploratory") reasons.push("readiness_exploratory");
  else if (hints?.intentReadinessHint === "actionable_planning") reasons.push("readiness_actionable_planning");
  else if (hints?.intentReadinessHint === "immediate_planning") reasons.push("readiness_immediate_planning");
  else reasons.push("readiness_unknown");

  // day trip boundary
  if (hints?.dayTripBoundaryHint === "clear_day_trip") {
    reasons.push("day_trip_boundary_clear");
  } else if (hints?.dayTripBoundaryHint === "extended_day_trip") {
    reasons.push("day_trip_boundary_extended");
  } else if (hints?.dayTripBoundaryHint === "overnight_required") {
    reasons.push("day_trip_boundary_overnight_required");
  }

  // red-line codes
  if (input.redLineCodes !== undefined && input.redLineCodes.length > 0) {
    reasons.push("red_line_present");
  }

  // purpose unknown (collect 用)
  if (hints?.purposeHint === undefined || hints?.purposeHint === "unknown") {
    reasons.push("purpose_unknown");
  }

  // fatigue unknown (collect 用)
  if (hints?.transitFatigueHint === undefined && hints?.onSiteFatigueHint === undefined) {
    reasons.push("fatigue_unknown");
  }

  return reasons;
}

// ─────────────────────────────────────────────
// Helper: missing slot 検出 (pure)
// ─────────────────────────────────────────────

function detectMissingSlots(input: TravelIntentInput): TravelIntentMissingSlot[] {
  const missing: TravelIntentMissingSlot[] = [];
  const hints = input.travelHints;

  if (hints?.destinationHint === undefined || hints.destinationHint === "unknown") {
    missing.push("destination");
  }
  if (hints?.durationHint === undefined || hints.durationHint === "unknown") {
    missing.push("duration");
  }
  if (hints?.budgetHint === undefined || hints.budgetHint === "unknown") {
    missing.push("budget");
  }
  if (hints?.transitFatigueHint === undefined) missing.push("transit_fatigue");
  if (hints?.onSiteFatigueHint === undefined) missing.push("onsite_fatigue");
  if (hints?.purposeHint === undefined || hints.purposeHint === "unknown") {
    missing.push("purpose");
  }
  if (hints?.seasonalHint === undefined || hints.seasonalHint === "unknown") {
    missing.push("seasonal");
  }
  if (hints?.weatherForecastHint === undefined || hints.weatherForecastHint === "unknown") {
    missing.push("weather");
  }
  if (hints?.pairTogethernessHint === undefined || hints.pairTogethernessHint === "unknown") {
    missing.push("pair");
  }
  if (hints?.intentReadinessHint === undefined || hints.intentReadinessHint === "unknown") {
    missing.push("readiness");
  }
  if (hints?.dayTripBoundaryHint === undefined || hints.dayTripBoundaryHint === "unknown") {
    missing.push("day_trip_boundary");
  }

  return missing;
}

// ─────────────────────────────────────────────
// Helper: handoff target 判定 (pure)
// ─────────────────────────────────────────────

/**
 * Handoff target を判定 (PR #124 §4.3 Domain boundary 規則).
 *
 * 規則 (travel domain perspective):
 *   - activity handoff (短時間) > daily handoff (daily mode 内) > food handoff (グルメ旅?)
 *   - 複数 handoff signal → ambiguous (activity 最優先で返す、caller decide)
 */
function detectHandoffTarget(input: TravelIntentInput): {
  target?: TravelHandoffTarget;
  ambiguous: boolean;
} {
  const signals: TravelHandoffTarget[] = [];
  if (input.activityHandoffSignal === true) signals.push("activity");
  if (input.dailyHandoffSignal === true) signals.push("daily");
  if (input.foodHandoffSignal === true) signals.push("food");

  if (signals.length === 0) return { ambiguous: false };
  if (signals.length === 1) return { target: signals[0], ambiguous: false };
  return { target: signals[0], ambiguous: true };
}

// ─────────────────────────────────────────────
// Helper: travel scope 判定 (pure、人間超越 Idea 4)
// ─────────────────────────────────────────────

/**
 * Travel scope を 7 階層で判定 (pure):
 *
 * 1. destinationHint=overseas → unsupported_overseas
 * 2. durationHint=three_or_more_nights / arbitrary_long → unsupported_extended
 * 3. durationHint=day_trip + dayTripBoundaryHint=clear_day_trip → out_of_scope_short
 * 4. durationHint=day_trip + dayTripBoundaryHint=extended_day_trip / overnight_required → day_trip_excursion
 * 5. durationHint=one_night → overnight_one_night
 * 6. durationHint=two_nights → overnight_two_nights
 * 7. それ以外 → unclear_or_narrowing
 */
function deriveTravelScope(input: TravelIntentInput): TravelScope {
  const hints = input.travelHints;

  // 1. 海外 (fail-closed future scope)
  if (hints?.destinationHint === "overseas") return "unsupported_overseas";

  // 2. 任意長期 (fail-closed future scope)
  if (
    hints?.durationHint === "three_or_more_nights" ||
    hints?.durationHint === "arbitrary_long"
  ) {
    return "unsupported_extended";
  }

  // 3. day_trip + clear_day_trip → 短時間 (activity 寄り)
  if (
    hints?.durationHint === "day_trip" &&
    hints?.dayTripBoundaryHint === "clear_day_trip"
  ) {
    return "out_of_scope_short";
  }

  // 4. day_trip + extended / overnight_required → travel-light 寄り
  if (hints?.durationHint === "day_trip") {
    return "day_trip_excursion";
  }

  // 5. 1 泊
  if (hints?.durationHint === "one_night") return "overnight_one_night";

  // 6. 2 泊
  if (hints?.durationHint === "two_nights") return "overnight_two_nights";

  // 7. unclear
  return "unclear_or_narrowing";
}

// ─────────────────────────────────────────────
// Helper: suggested constraint 構築 (pure)
// ─────────────────────────────────────────────

function buildSuggestedConstraints(
  input: TravelIntentInput,
  scope: TravelScope,
): TravelSuggestedConstraintCode[] {
  const codes: TravelSuggestedConstraintCode[] = [];
  const hints = input.travelHints;

  // budget band inferred
  if (
    hints?.budgetHint !== undefined &&
    hints.budgetHint !== "unknown"
  ) {
    codes.push("budget_band_inferred");
  }

  // duration inferred
  if (scope === "overnight_one_night") codes.push("duration_one_night_inferred");
  if (scope === "overnight_two_nights") codes.push("duration_two_nights_inferred");

  // fatigue floor warning (overnight + transit fatigue 低過ぎ)
  if (
    (scope === "overnight_one_night" || scope === "overnight_two_nights") &&
    hints?.transitFatigueHint !== undefined &&
    hints.transitFatigueHint < PROVISIONAL_OVERNIGHT_FATIGUE_FLOOR
  ) {
    codes.push("fatigue_floor_warning");
  }

  // weather risk high
  if (
    hints?.weatherForecastHint === "heavy_rain" ||
    hints?.weatherForecastHint === "snow" ||
    hints?.weatherForecastHint === "typhoon_warning"
  ) {
    codes.push("weather_risk_high");
  }

  // seasonal peak warning
  if (
    hints?.seasonalHint === "spring_peak" ||
    hints?.seasonalHint === "summer_peak" ||
    hints?.seasonalHint === "autumn_peak" ||
    hints?.seasonalHint === "winter_peak"
  ) {
    codes.push("seasonal_peak_warning");
  }

  // pair split compatible
  if (
    hints?.pairTogethernessHint === "together_main_separate_some" ||
    hints?.pairTogethernessHint === "flexible_split"
  ) {
    codes.push("pair_split_compatible");
  }

  // red-line constraint
  if (input.redLineCodes !== undefined && input.redLineCodes.length > 0) {
    codes.push("red_line_constraint_inferred");
  }

  return codes;
}

// ─────────────────────────────────────────────
// Helper: budget floor warning (pure)
// ─────────────────────────────────────────────

/**
 * Budget floor warning 判定 (1 泊以上 + budget=tight → caution).
 *
 * PROVISIONAL_OVERNIGHT_BUDGET_FLOOR_JPY 想定では、tight 想定は 1 泊国内最低圏。
 * tight + 1 泊以上で fail にはしないが warning reason 付与。
 */
function shouldWarnBudgetFloor(input: TravelIntentInput, scope: TravelScope): boolean {
  const hints = input.travelHints;
  if (hints?.budgetHint !== "tight") return false;
  return scope === "overnight_one_night" || scope === "overnight_two_nights";
}

// ─────────────────────────────────────────────
// Helper: fatigue signal snapshot (pure、人間超越 Idea 7)
// ─────────────────────────────────────────────

function deriveFatigueSnapshot(input: TravelIntentInput): TravelFatigueSignalSnapshot {
  const hints = input.travelHints;
  const transit = hints?.transitFatigueHint;
  const onSite = hints?.onSiteFatigueHint;

  let combined: TravelFatigueLevel | undefined;
  if (transit !== undefined && onSite !== undefined) {
    // max を combined として返す
    combined = (Math.max(transit, onSite) as TravelFatigueLevel);
  } else if (transit !== undefined) {
    combined = transit;
  } else if (onSite !== undefined) {
    combined = onSite;
  }

  return {
    transitFatigue: transit,
    onSiteFatigue: onSite,
    combined,
  };
}

// ─────────────────────────────────────────────
// Helper: destination signals 集約 (pure)
// ─────────────────────────────────────────────

function collectDestinationSignals(input: TravelIntentInput): TravelDestinationCode[] {
  const hints = input.travelHints;
  if (hints?.destinationHint === undefined) return [];
  return [hints.destinationHint];
}

// ─────────────────────────────────────────────
// Helper: duration signals 集約 (pure)
// ─────────────────────────────────────────────

function collectDurationSignals(input: TravelIntentInput): TravelDurationHint[] {
  const hints = input.travelHints;
  if (hints?.durationHint === undefined) return [];
  return [hints.durationHint];
}

// ─────────────────────────────────────────────
// Helper: budget signals 集約 (pure)
// ─────────────────────────────────────────────

function collectBudgetSignals(input: TravelIntentInput): TravelBudgetHint[] {
  const hints = input.travelHints;
  if (hints?.budgetHint === undefined) return [];
  return [hints.budgetHint];
}

// ─────────────────────────────────────────────
// Main extractor (pure function、deterministic、stateless)
// ─────────────────────────────────────────────

/**
 * Travel domain user signal を Travel intent / slot に変換する pure function.
 *
 * **本関数は純関数**: 同じ input → 同じ output、副作用なし、`Math.random` 不使用、
 * 現在時刻参照なし、external state 参照なし。
 *
 * **構造的安全 (raw text leakage 防止)**:
 *   - input は normalized signal のみ、raw user text 受領なし
 *   - output reasonCodes / missingSlots / signals は enum のみ、free text なし
 *   - 型レベルで PII / raw prompt 構造的に保存不能
 *
 * **handoff target 優先判定**:
 *   - activity / daily / food handoff signal が立てば Travel logic より先に handoff
 *   - 複数 handoff signal → ambiguous (activity 最優先で返す、caller decide)
 *
 * **海外 / 任意長期 unsupported (CEO 指示)**:
 *   - destinationHint=overseas → unsupported_overseas (fail-closed)
 *   - durationHint=three_or_more_nights / arbitrary_long → unsupported_extended (fail-closed)
 *
 * **progressive narrowing**:
 *   - confidence < threshold → needsNarrowing = true
 *   - missingSlots で「何が不足か」を明示
 *
 * @param input Travel intent input (normalized signal、raw text 受領なし)
 * @returns Travel intent / scope / suggested constraints / handoff / narrowing / confidence
 */
export function inferTravelIntent(input: TravelIntentInput): TravelIntentOutput {
  const threshold = input.threshold ?? PROVISIONAL_DEFAULT_THRESHOLD;
  const reasonCodes: TravelIntentReasonCode[] = [];

  // 1. Handoff target 優先判定 (PR #124 §4.3 規則)
  const handoff = detectHandoffTarget(input);
  if (handoff.target !== undefined) {
    if (handoff.target === "activity") reasonCodes.push("activity_handoff_signal");
    if (handoff.target === "daily") reasonCodes.push("daily_handoff_signal");
    if (handoff.target === "food") reasonCodes.push("food_handoff_signal");
    if (handoff.ambiguous) reasonCodes.push("multiple_domains_ambiguous");
    reasonCodes.push("handoff_priority_applied");

    return {
      inferredTravelIntent: "out_of_scope_handoff",
      travelScope: "out_of_scope_short",
      suggestedConstraints: [],
      destinationSignals: collectDestinationSignals(input),
      durationSignals: collectDurationSignals(input),
      budgetSignals: collectBudgetSignals(input),
      fatigueSignals: deriveFatigueSnapshot(input),
      handoffTarget: handoff.target,
      needsNarrowing: false,
      missingSlots: [],
      confidence: 0,
      reasonCodes,
      intentVersion: TRAVEL_INTENT_EXTRACTOR_VERSION,
    };
  }

  // 2. Travel scope 判定 (海外 / 長期 fail-closed 含む)
  const scope = deriveTravelScope(input);

  // 3. Unsupported future scope (海外 / 長期) → fail-closed
  if (scope === "unsupported_overseas" || scope === "unsupported_extended") {
    const coreReasons = collectTravelCoreReasons(input);
    reasonCodes.push(...coreReasons);
    reasonCodes.push("unsupported_future_scope");
    reasonCodes.push("fail_closed");

    return {
      inferredTravelIntent: "unsupported_future",
      travelScope: scope,
      suggestedConstraints: [],
      destinationSignals: collectDestinationSignals(input),
      durationSignals: collectDurationSignals(input),
      budgetSignals: collectBudgetSignals(input),
      fatigueSignals: deriveFatigueSnapshot(input),
      handoffTarget: "future_scope",
      needsNarrowing: false,
      missingSlots: [],
      confidence: 0,
      reasonCodes,
      intentVersion: TRAVEL_INTENT_EXTRACTOR_VERSION,
    };
  }

  // 4. day_trip + clear_day_trip → activity handoff (short scope)
  if (scope === "out_of_scope_short") {
    const coreReasons = collectTravelCoreReasons(input);
    reasonCodes.push(...coreReasons);
    reasonCodes.push("day_trip_boundary_clear");
    reasonCodes.push("activity_handoff_signal");
    reasonCodes.push("handoff_priority_applied");

    return {
      inferredTravelIntent: "out_of_scope_handoff",
      travelScope: scope,
      suggestedConstraints: [],
      destinationSignals: collectDestinationSignals(input),
      durationSignals: collectDurationSignals(input),
      budgetSignals: collectBudgetSignals(input),
      fatigueSignals: deriveFatigueSnapshot(input),
      handoffTarget: "activity",
      needsNarrowing: false,
      missingSlots: [],
      confidence: 0,
      reasonCodes,
      intentVersion: TRAVEL_INTENT_EXTRACTOR_VERSION,
    };
  }

  // 5. Travel core signal 集約 (no_signal 判定の基準)
  const confByDim = computeConfidenceByDimension(input);
  const coreReasons = collectTravelCoreReasons(input);

  // 6. Travel core signal 不在 (no_signal fail-closed)
  if (coreReasons.length === 0) {
    reasonCodes.push("no_signal");
    reasonCodes.push("fail_closed");
    return {
      inferredTravelIntent: "needs_narrowing",
      travelScope: "unclear_or_narrowing",
      suggestedConstraints: [],
      destinationSignals: [],
      durationSignals: [],
      budgetSignals: [],
      fatigueSignals: {},
      needsNarrowing: true,
      missingSlots: detectMissingSlots(input),
      confidence: 0,
      confidenceByDimension: confByDim,
      reasonCodes,
      intentVersion: TRAVEL_INTENT_EXTRACTOR_VERSION,
    };
  }

  // 7. Core signal あり: context reasons も合わせて集約
  reasonCodes.push(...coreReasons);
  reasonCodes.push(...collectContextReasons(input));
  reasonCodes.push("travel_signal_present");

  // 8. suggested constraints 構築
  const suggestedConstraints = buildSuggestedConstraints(input, scope);

  // 9. budget floor warning
  if (shouldWarnBudgetFloor(input, scope)) {
    reasonCodes.push("budget_floor_warning");
  }

  // 10. fatigue overnight floor warning (overnight + transit fatigue 低過ぎ)
  if (suggestedConstraints.includes("fatigue_floor_warning")) {
    reasonCodes.push("fatigue_overnight_floor_warning");
  }

  // 11. missing slots
  const missingSlots = detectMissingSlots(input);

  // 12. confidence (overall geometric mean)
  const confidence = confByDim.overallGeometric;

  // 13. Threshold 判定
  if (confidence >= threshold) {
    reasonCodes.push("above_threshold");
    return {
      inferredTravelIntent: "travel_eligible",
      travelScope: scope,
      suggestedConstraints,
      destinationSignals: collectDestinationSignals(input),
      durationSignals: collectDurationSignals(input),
      budgetSignals: collectBudgetSignals(input),
      fatigueSignals: deriveFatigueSnapshot(input),
      needsNarrowing: false,
      missingSlots,
      confidence,
      confidenceByDimension: confByDim,
      reasonCodes,
      intentVersion: TRAVEL_INTENT_EXTRACTOR_VERSION,
    };
  }

  // 14. 不足: progressive narrowing
  reasonCodes.push("below_threshold");
  return {
    inferredTravelIntent: "needs_narrowing",
    travelScope: scope,
    suggestedConstraints,
    destinationSignals: collectDestinationSignals(input),
    durationSignals: collectDurationSignals(input),
    budgetSignals: collectBudgetSignals(input),
    fatigueSignals: deriveFatigueSnapshot(input),
    needsNarrowing: true,
    missingSlots,
    confidence,
    confidenceByDimension: confByDim,
    reasonCodes,
    intentVersion: TRAVEL_INTENT_EXTRACTOR_VERSION,
  };
}

// ─────────────────────────────────────────────
// Re-export (本 file local type、caller convenience)
// ─────────────────────────────────────────────

export type {
  TravelBudgetBand,
  TravelFatigueLevel,
} from "./types";
