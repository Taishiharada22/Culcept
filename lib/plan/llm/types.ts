/**
 * Phase 3-N Plan P2 Step 1 — LLM 連携 共通型定義
 *
 * 設計書: docs/alter-plan-p2-llm-readiness.md v2 (= CEO + GPT 合議 2026-05-25)
 *
 * 不変原則 (= Step 1 範囲):
 *   - **pure 型定義のみ** (= LLM 呼び出さない、 副作用 0)
 *   - **Step 2 で Personal Model short tag を追加可能な拡張余地** (= GPT 補正 2)
 *   - 入力 anchor の sensitive / privacy 配慮は呼出側責務
 *
 * 設計:
 *   - AlterNoteContext: LLM に渡す前の事前 normalize 済 context (= category / time / location / title)
 *   - PersonalModelSummary: **Step 2 で実装**、 Step 1 では型のみ optional 用意
 *   - AlterNoteResult: discriminated union (= deterministic / llm / unavailable)
 *
 * 命名規則:
 *   - 「Note」 = alterNote (= EventCard の解釈テキスト)
 *   - Step 2 で 「Footer」 (= SummaryFooter) / 「Map」 (= MapBottomSheet.meaningText) の型も追加予定
 */

import type { EventCategory } from "@/lib/plan/list/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AlterNoteContext (= LLM 入力 context)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * LLM に渡す前の anchor context (= 既に normalize 済)
 *
 * - category, startTime: 必須
 * - endTime, title, location: optional (= 未指定 OK、 LLM が判断材料として扱う)
 * - personalModel: **Step 2 で実装**、 Step 1 では undefined 固定
 *
 * Privacy 配慮: 呼出側 (= adapter) が sensitiveCategory anchor を事前 filter する責務。
 *              本型には個人情報 (= 名前 / 住所等) を直接含めない。 anchor.title / location は user
 *              入力済の文字列のみが入る。
 */
export type AlterNoteContext = {
  /** 解決済 EventCategory (= 4 段階優先順位後の決定値) */
  readonly category: EventCategory;
  /** "HH:MM" 形式の開始時刻 (= normalize 済) */
  readonly startTime: string;
  /** "HH:MM" 形式の終了時刻 (= 推論済の場合あり) */
  readonly endTime?: string;
  /** anchor.title (= user 入力済) */
  readonly title?: string;
  /** 表示用 location 文字列 (= sensitive 除外済) */
  readonly location?: string;
  /**
   * v3.4.2 (= CEO 2026-05-25): 日付コンテキスト (= 「5/31(月)」 等)
   *
   * 役割:
   *   1. LLM に日付の文脈を渡す (= 月曜の朝 vs 土曜の夜 で alterNote が自然に変わる)
   *   2. **cache key 多様化** (= 同 anchor を 6 日間に置いた場合、 各日で cache miss → fresh LLM 出力)
   *      これにより 「同 anchor 全日で同じ文」 問題を解消。
   *
   * フォーマット: "M/D(曜)" (= 例 「5/31(月)」)。 undefined なら出力スキップ (= safe degrade)。
   */
  readonly dayContext?: string;
  /**
   * Step 2 拡張余地: Personal Model short tag (= v1 型、 v3.1 で deprecated 移行中).
   * Step 1 では **常に undefined**。 Step 2 では personalModelV2 を使う。
   *
   * @deprecated Step 2 v3.1 移行で personalModelV2 (= 3 層) に置換。 互換性のため slot 保持。
   */
  readonly personalModel?: PersonalModelSummary;
  /**
   * Step 2 v3.1: 3 層 Personal Model (= Stable / Recent / Contextual + meta)
   *
   * - Step 1 では常に undefined (= promptBuilderV1 は無視)
   * - Step 2 では personalModelExtractorV2 が hdmPhase に応じて適切な layer を充填
   * - promptBuilderV2 で **層を分けたまま** prompt 注入 (= GPT 「雑に混ぜない」 補正)
   */
  readonly personalModelV2?: PersonalModelV2;
};

/**
 * Personal Model short tag (= Step 2 v1 拡張用、 後継型は PersonalModelV2)
 *
 * Stargazer 45 軸 → 10 次元 MatchingVector → 4 種 short tag に圧縮:
 *   - judgmentMode: 「集中型」 / 「分散型」 / 「人と会うエネルギー型」 等
 *   - timePreference: 「朝強い」 / 「夜強い」 / 「中庸」
 *   - energyRecovery: 「ひとり静か」 / 「人と話す」
 *   - recentRhythm: 「集中続き」 / 「移動多め」 / 「休息余裕」 等 (= 過去 7-14 day lifeContext)
 *
 * 各 tag は 4-12 字程度の自然な日本語。
 *
 * 注: Step 2 では本型ではなく PersonalModelV2 (= 3 層構造) を使う。
 *     本型は readiness v1 文書記述用に保持、 ctx.personalModel の slot は v3.1 で V2 に置換。
 */
export type PersonalModelSummary = {
  readonly judgmentMode?: string;
  readonly timePreference?: string;
  readonly energyRecovery?: string;
  readonly recentRhythm?: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Step 2 v3.1: 3 層 Personal Model (= Stable / Recent / Contextual + meta)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Stable layer — 数ヶ月-数年で変わりにくい長期傾向 (= 「あなたという人」)
 *
 * 既存 Stargazer 12 module 流用 source:
 *   - axisRegistry / axisInferenceEngine (= judgmentMode source)
 *   - psycheSignature (= psycheTone source)
 *   - chronotypeFitness (= timePreference source)
 *   - baselineContext (= lifeStageHint source)
 *   - traitAxes / traitEvolution (= traitTone source)
 *   - archetypeFigure / archetypeResolver (= archetype source)
 *   - decisionOracle (= decisionMode source)
 *   - uniqueStrengthDetector (= strengthAxis source)
 *   - workStyleFitness (= workStyle source)
 *
 * 各 field optional (= 軸データ未完成 user で safe degrade)
 *
 * 注: Step 2 v3.1 では **synthetic adapter** (= EVAL_USER_PROFILES から直接生成可能)。
 *     実 Stargazer module wire は別 Step (= readiness v3 §13 並行運用、 stop しない)。
 */
export type PersonalModelStableLayer = {
  readonly judgmentMode?: string;
  readonly psycheTone?: string;
  readonly timePreference?: string;
  readonly lifeStageHint?: string;
  readonly traitTone?: string;
  readonly archetype?: string;
  readonly decisionMode?: string;
  readonly strengthAxis?: string;
  readonly workStyle?: string;
};

/**
 * Recent layer — 直近 7-14 日の状態 (= 「今のあなた」)
 *
 * 既存 Stargazer 13 module 流用 source:
 *   - innerWeather (= 内的天気)
 *   - microEMA (= 直近感情)
 *   - lifeEvents (= 直近イベント)
 *   - reactionPatternEngine (= W5 Reaction Learning)
 *   - fluctuationEngine (= 揺らぎ)
 *   - stressResponseCascade (= ストレス負荷)
 *   - ruptureDetection (= 直近 rupture)
 *   - lifeContext (= W1 直近リズム)
 *
 * 各 field optional。
 */
export type PersonalModelRecentLayer = {
  readonly innerWeather?: string;
  readonly recentMood?: string;
  readonly recentEvents?: string;
  readonly reactionPattern?: string;
  readonly fluctuation?: string;
  readonly stressLoad?: string;
  readonly recentRupture?: boolean;
  readonly recentRhythm?: string;
};

/**
 * Contextual layer — 当日 + 似た日履歴 (= 「この予定の文脈」)
 *
 * 既存 Stargazer 9 module 流用 source:
 *   - episodicRecall (= similarDayRecall)
 *   - temporalSelfMirror (= pastSelfDelta)
 *   - contextShiftAnalyzer (= shiftSignal)
 *   - narrativeThreading (= narrativeContinuity)
 *
 * 各 field optional。 当日の前後 anchor は別 (= ctx.title / location で扱う)。
 */
export type PersonalModelContextualLayer = {
  readonly similarDayRecall?: string;
  readonly pastSelfDelta?: string;
  readonly shiftSignal?: string;
  readonly narrativeContinuity?: string;
  readonly sameSlotHistory?: string;
};

/**
 * Meta layer — Phase / Trust / observation completeness 等の統治信号
 */
export type PersonalModelMeta = {
  readonly hdmPhase: number;       // 0-5
  readonly trustLevel: number;     // 0-5
  readonly observationCompleteness: number; // 0-1
  readonly negativeCapabilityFlag?: boolean;
};

/**
 * 3 層 Personal Model V2 (= Step 2 v3.1 で確定)
 *
 * 各 layer optional (= safe degrade、 軸データ未完成 user で全 undefined でも動く)
 * meta は必須 (= Phase gating の判断材料)
 *
 * 「層を分けたまま」 (= GPT v3.1 補正): promptBuilderV2 で stable / recent / contextual を
 * **混ぜず別 section** で LLM に渡す。 雑に短文化すると generic に落ちる。
 */
export type PersonalModelV2 = {
  readonly stable?: PersonalModelStableLayer;
  readonly recent?: PersonalModelRecentLayer;
  readonly contextual?: PersonalModelContextualLayer;
  readonly meta: PersonalModelMeta;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AlterNoteResult (= 出力、 discriminated union)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AlterNote 生成結果 (= 由来 + 文字列 / unavailable)
 *
 * - "deterministic": flag OFF / category 'other' / sensitive 等で LLM skip、 既存 getNarrative
 * - "llm": LLM 経路成功、 post-check 通過
 * - "unavailable": LLM 試行したが失敗 (= timeout / safety 違反 / cost cap 超過 等)、
 *                  呼出側で deterministic に fallback すべき
 *
 * 設計判断:
 *   - "llm" と "deterministic" は明示的に区別 (= analytics / 観測用)
 *   - "unavailable" は内部的な signal、 呼出側で deterministic を取り直す
 *   - Step 5 で Negative Capability 「(意味は読めない)」 を追加する場合、
 *     新 variant "negativeCapability" を追加可能 (= discriminated union 拡張余地)
 */
export type AlterNoteResult =
  | { readonly source: "deterministic"; readonly text: string }
  | { readonly source: "llm"; readonly text: string; readonly model: string; readonly latencyMs: number }
  | { readonly source: "unavailable"; readonly reason: AlterNoteUnavailableReason };

/**
 * "unavailable" 時の理由 (= analytics + 切り分け用)
 *
 * 各 reason の対応:
 *   - flag_off: PLAN_FLAGS.alterNoteLive === false → deterministic 経路で十分、 呼出されない想定
 *   - category_other: category === 'other' → deterministic も undefined return (= 既存契約)
 *   - sensitive: sensitive anchor → LLM 送らない (= privacy)
 *   - cost_cap: 1 view 20 calls 超過 → silent degrade
 *   - timeout: runAI 4000ms timeout
 *   - llm_failure: runAI success=false / empty text
 *   - validation_failed: validator (= 規約 24 / 禁止語 / 長さ) で reject
 */
export type AlterNoteUnavailableReason =
  | "flag_off"
  | "category_other"
  | "sensitive"
  | "cost_cap"
  | "timeout"
  | "llm_failure"
  | "validation_failed";
