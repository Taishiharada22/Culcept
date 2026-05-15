/**
 * CoAlter Gap 4 D2 — Production-side Context Detector (pure library)
 *
 * 正本:
 *   - docs/coalter-gap4-production-context-detection.md §6 (Alt 5 Hybrid 設計)
 *   - docs/coalter-master-design.md v1.2 §13.8 (Gap 4 reflection)
 *
 * 役割:
 *   PR #123 (Gap 4 設計) の D2 phase = pure detector library。`PatternContext`
 *   7 boolean fields (patternSelector.ts:47-69) を **input signal から推定する
 *   純関数 library**。runtime 未接続、production behavior 0 変化。
 *
 * 構造的安全設計 (CEO 補正 2026-05-15 反映):
 *   1. **raw text を input / output に含めない** (型レベル enforcement):
 *      - input: binary signal / count / score のみ受領、`string` (user message
 *        raw text) を一切 accept しない
 *      - output reasons は **`ReasonCode` enum** のみ、free text なし
 *      - PII / raw prompt / raw utterance を構造的に保存・返却不能
 *   2. **provisional threshold** (CEO 補正 2026-05-15):
 *      - τ=0.5 は default candidate、確定値ではない
 *      - 最終値は D5 `observe` + D6 calibration で実 data 観測後決定
 *      - env 経由 override 可能設計を将来追加 (本 PR では config arg のみ)
 *   3. **fail-closed default**:
 *      - 入力不明 / confidence 不足 / signals 不足 → 過剰発火しない
 *      - 全 input が undefined → 全 7 fields false / confidence 0
 *   4. **deterministic output**:
 *      - 純関数、stateless、`Math.random` 不使用
 *      - 同じ input → 同じ output (test で deterministic 検証)
 *   5. **detector version**:
 *      - 出力に `detectorVersion` 含める、後続 calibration で version 別観測可
 *
 * D3 以降での runtime 接続 (本 PR scope 外):
 *   - D3: invoke route で本 detector を呼ぶ + additive response field
 *   - D4: UpperLayerMount で response 受領 + setPatternContext
 *   - D5: env mode `observe` で telemetry のみ
 *   - D6: calibrate (実 data 観測後 threshold 確定)
 *   - D7: env mode `live` で実 variant 発火
 *
 * 本 PR の不可触:
 *   - patternSelector.ts / smokeContextOverride.ts 既存 file
 *   - movieOrchestrator / flags / ProviderSelector
 *   - ChatClient / UpperLayerMount
 *   - env / Production / Supabase migration
 */

import type { PatternContext } from "./patternSelector";

// ─────────────────────────────────────────────
// detector version (output に含める、calibration で version 別観測可)
// ─────────────────────────────────────────────

/**
 * detector version 文字列。
 *
 * format: `MAJOR.MINOR.PATCH`
 * - MAJOR: 入出力 schema 変更時 increment
 * - MINOR: scoring logic 変更時 increment
 * - PATCH: bug fix / 微調整時 increment
 *
 * 本 D2 初版 = `"0.1.0"`。
 */
export const DETECTOR_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// provisional threshold (CEO 2026-05-15 補正: 確定値ではない)
// ─────────────────────────────────────────────

/**
 * Provisional default threshold τ (CEO 2026-05-15 補正済、確定値ではない).
 *
 * 最終値は D5 `observe` phase + D6 calibration phase で実 data 観測後決定。
 * env 経由 override 可能設計は将来 (D5 phase) 追加。本 D2 では config arg
 * (`input.threshold`) で override 可、production env override は別 phase。
 *
 * τ 値の意味: confidence ≥ τ で `PatternContext` field を true 確定。
 * - τ = 0 → 全 signal で発火 (over-firing risk)
 * - τ = 0.5 → 中庸 default candidate (本 PR 暫定値)
 * - τ = 1.0 → 全 detector 抑止 (kill switch、env 経由 fail-closed 想定)
 */
export const PROVISIONAL_DEFAULT_THRESHOLD = 0.5;

// ─────────────────────────────────────────────
// Reason code (raw text leakage 構造的防止)
// ─────────────────────────────────────────────

/**
 * Detector が field 値を確定 (or 抑止) した理由を表す enum。
 *
 * **構造的に raw text を含めない** ことで PII / raw prompt / raw utterance を
 * output に混入させない設計。free text reason は受け付けない。
 *
 * 将来 reason code 追加時は本 union に append (MINOR version up)。
 */
export type ReasonCode =
  // 共通
  | "no_signal" // 全 input が undefined / 0 で signal が立たない
  | "below_threshold" // score < threshold で発火抑止
  | "above_threshold" // score >= threshold で発火
  | "fail_closed" // 入力不明 / 異常で fail-closed default
  // infoMissing 系
  | "info_missing_signal_set"
  | "recent_message_count_zero"
  // uncertaintyHigh 系
  | "stall_detected"
  | "ambiguity_clarify"
  | "ambiguity_branch"
  // needFraming 系
  | "contradiction_detected"
  // oneSidedFatigue 系
  | "fairness_bias_positive_high"
  | "fairness_bias_negative_high"
  // needTranslation 系
  | "misread_confidence_high"
  | "misread_confidence_low"
  // relationshipSignalsClear 系
  | "critical_count_zero"
  // relationshipNoiseHigh 系
  | "critical_count_high"
  | "misread_accumulated";

// ─────────────────────────────────────────────
// Input type (raw text を受けない、binary / count / score のみ)
// ─────────────────────────────────────────────

/**
 * Detector input。
 *
 * **重要 (構造的安全)**: 本 type は **raw user message text (`string`) を受領
 * しない**。全 field は binary signal / count / score のみ。caller 側で raw
 * text を解析した結果のみを binary 化して渡すことを意図する。
 *
 * 全 field optional。undefined → fail-closed default (no_signal)。
 */
export interface ContextDetectorInput {
  // ── infoMissing source ──
  /** info gathering が不足している signal (caller 側で判定済の binary) */
  infoMissingSignal?: boolean;
  /** 直近メッセージ数 (raw text は含まない count のみ) */
  recentMessageCount?: number;

  // ── uncertaintyHigh source ──
  /** stall.detected (modeRouter input 由来、binary) */
  stallDetected?: boolean;
  /** ambiguity.response_mode (Ambiguity Engine 由来、enum) */
  ambiguityResponseMode?: "conclude" | "branch" | "clarify";

  // ── needFraming source ──
  /** contradiction.detected (negotiate mode 同 source、binary) */
  contradictionDetected?: boolean;

  // ── oneSidedFatigue source ──
  /** Fairness Ledger bias_score (-1.0 to +1.0、正: A 寄り、負: B 寄り) */
  fairnessBias?: number;

  // ── needTranslation source ──
  /** misread.confidence (clarify mode 同 source、0-1) */
  misreadConfidence?: number;

  // ── relationshipSignalsClear / relationshipNoiseHigh source ──
  /** critical signal count (直近 N turn の累積、count のみ) */
  criticalSignalCount?: number;

  // ── context (presence mode、field 抑制 / 強化に使用) ──
  /** PresenceMode ("normal" | "daily" | "travel") */
  presenceMode?: "normal" | "daily" | "travel";

  // ── threshold override (test / config arg、production env override 別 phase) ──
  /** Provisional threshold τ (default `PROVISIONAL_DEFAULT_THRESHOLD = 0.5`) */
  threshold?: number;
}

// ─────────────────────────────────────────────
// Output type (raw text なし、enum reason のみ)
// ─────────────────────────────────────────────

/**
 * 各 field の独立 detection 結果。
 *
 * - `value`: confidence ≥ threshold で true、それ未満で false (fail-closed)
 * - `confidence`: 0.0 - 1.0 (signal の累積 score、clamped)
 * - `reasons`: 確定 / 抑止理由を表す ReasonCode の配列 (raw text なし)
 */
export interface FieldDetectionResult {
  value: boolean;
  confidence: number;
  reasons: ReasonCode[];
}

/**
 * Detector output。
 *
 * - `patternContext`: confidence ≥ threshold で true 確定した field のみ含む
 *   (false / 不明は省略、`Partial<PatternContext>` 型)
 * - `confidence`: 全 7 field の confidence score (0-1)
 * - `reasons`: 全 7 field の reason code 配列 (raw text なし)
 * - `signalCounts`: 入力 signal の集計 (debug / observability 用、raw value なし)
 * - `detectorVersion`: 本 detector の version 文字列
 */
export interface ContextDetectorOutput {
  patternContext: Partial<PatternContext>;
  confidence: Record<keyof PatternContext, number>;
  reasons: Record<keyof PatternContext, ReasonCode[]>;
  signalCounts: {
    infoMissing: number;
    uncertainty: number;
    framing: number;
    fatigue: number;
    translation: number;
    relationshipClear: number;
    relationshipNoise: number;
  };
  detectorVersion: string;
}

// ─────────────────────────────────────────────
// 各 field 個別 detector (pure function、stateless、deterministic)
// ─────────────────────────────────────────────

/**
 * infoMissing 検出 (S2 で安全な介入に必要な情報が欠けているか).
 *
 * Signal source:
 *   - infoMissingSignal (caller 判定済 binary)
 *   - recentMessageCount === 0 (会話 history 不足)
 *
 * Scoring:
 *   - infoMissingSignal === true → +0.6
 *   - recentMessageCount === 0 → +0.3
 */
function detectInfoMissing(input: ContextDetectorInput): FieldDetectionResult {
  const threshold = input.threshold ?? PROVISIONAL_DEFAULT_THRESHOLD;
  let score = 0;
  const reasons: ReasonCode[] = [];

  if (input.infoMissingSignal === true) {
    score += 0.6;
    reasons.push("info_missing_signal_set");
  }
  if (input.recentMessageCount === 0) {
    score += 0.3;
    reasons.push("recent_message_count_zero");
  }

  const confidence = Math.min(Math.max(score, 0), 1);
  const value = confidence >= threshold;

  if (reasons.length === 0) reasons.push("no_signal");
  reasons.push(value ? "above_threshold" : "below_threshold");

  return { value, confidence, reasons };
}

/**
 * uncertaintyHigh 検出 (S5 で不確実性が介入有効性阻害).
 *
 * Signal source:
 *   - stallDetected (modeRouter 同 source)
 *   - ambiguityResponseMode === "clarify" or "branch"
 *
 * Scoring:
 *   - stallDetected === true → +0.5
 *   - ambiguity === "clarify" → +0.4
 *   - ambiguity === "branch" → +0.3
 */
function detectUncertaintyHigh(input: ContextDetectorInput): FieldDetectionResult {
  const threshold = input.threshold ?? PROVISIONAL_DEFAULT_THRESHOLD;
  let score = 0;
  const reasons: ReasonCode[] = [];

  if (input.stallDetected === true) {
    score += 0.5;
    reasons.push("stall_detected");
  }
  if (input.ambiguityResponseMode === "clarify") {
    score += 0.4;
    reasons.push("ambiguity_clarify");
  } else if (input.ambiguityResponseMode === "branch") {
    score += 0.3;
    reasons.push("ambiguity_branch");
  }

  const confidence = Math.min(Math.max(score, 0), 1);
  const value = confidence >= threshold;

  if (reasons.length === 0) reasons.push("no_signal");
  reasons.push(value ? "above_threshold" : "below_threshold");

  return { value, confidence, reasons };
}

/**
 * needFraming 検出 (S5 で関係全体の可視化先行必要).
 *
 * Signal source:
 *   - contradictionDetected (negotiate mode 同 source)
 *
 * Scoring:
 *   - contradictionDetected === true → +0.8 (single strong signal)
 */
function detectNeedFraming(input: ContextDetectorInput): FieldDetectionResult {
  const threshold = input.threshold ?? PROVISIONAL_DEFAULT_THRESHOLD;
  let score = 0;
  const reasons: ReasonCode[] = [];

  if (input.contradictionDetected === true) {
    score += 0.8;
    reasons.push("contradiction_detected");
  }

  const confidence = Math.min(Math.max(score, 0), 1);
  const value = confidence >= threshold;

  if (reasons.length === 0) reasons.push("no_signal");
  reasons.push(value ? "above_threshold" : "below_threshold");

  return { value, confidence, reasons };
}

/**
 * oneSidedFatigue 検出 (S5 で片側の揺れ・疲労が主).
 *
 * Signal source:
 *   - fairnessBias (Fairness Ledger、-1.0 to +1.0、絶対値 ≥ 0.6 で fatigue)
 *
 * Scoring:
 *   - |fairnessBias| ≥ 0.6 → +0.7 (片側 fatigue 強)
 *   - 0.3 ≤ |fairnessBias| < 0.6 → +0.3 (中程度)
 */
function detectOneSidedFatigue(input: ContextDetectorInput): FieldDetectionResult {
  const threshold = input.threshold ?? PROVISIONAL_DEFAULT_THRESHOLD;
  let score = 0;
  const reasons: ReasonCode[] = [];

  if (input.fairnessBias !== undefined) {
    const abs = Math.abs(input.fairnessBias);
    if (abs >= 0.6) {
      score += 0.7;
      if (input.fairnessBias > 0) reasons.push("fairness_bias_positive_high");
      else reasons.push("fairness_bias_negative_high");
    } else if (abs >= 0.3) {
      score += 0.3;
      if (input.fairnessBias > 0) reasons.push("fairness_bias_positive_high");
      else reasons.push("fairness_bias_negative_high");
    }
  }

  const confidence = Math.min(Math.max(score, 0), 1);
  const value = confidence >= threshold;

  if (reasons.length === 0) reasons.push("no_signal");
  reasons.push(value ? "above_threshold" : "below_threshold");

  return { value, confidence, reasons };
}

/**
 * needTranslation 検出 (S5 で両者間翻訳必要).
 *
 * Signal source:
 *   - misreadConfidence ≥ 0.7 (clarify mode 同 threshold)
 *
 * Scoring:
 *   - misreadConfidence ≥ 0.7 → +0.8 (single strong signal)
 *   - 0.5 ≤ misreadConfidence < 0.7 → +0.3 (中程度)
 */
function detectNeedTranslation(input: ContextDetectorInput): FieldDetectionResult {
  const threshold = input.threshold ?? PROVISIONAL_DEFAULT_THRESHOLD;
  let score = 0;
  const reasons: ReasonCode[] = [];

  if (input.misreadConfidence !== undefined) {
    if (input.misreadConfidence >= 0.7) {
      score += 0.8;
      reasons.push("misread_confidence_high");
    } else if (input.misreadConfidence >= 0.5) {
      score += 0.3;
      reasons.push("misread_confidence_low");
    }
  }

  const confidence = Math.min(Math.max(score, 0), 1);
  const value = confidence >= threshold;

  if (reasons.length === 0) reasons.push("no_signal");
  reasons.push(value ? "above_threshold" : "below_threshold");

  return { value, confidence, reasons };
}

/**
 * relationshipSignalsClear 検出 (Travel mode で関係シグナル明確).
 *
 * 本 detector は **Travel mode のみで発火**、それ以外は always false。
 *
 * Signal source:
 *   - criticalSignalCount === 0 + misread 低 + presenceMode === "travel"
 *
 * Scoring (Travel mode で発火):
 *   - criticalSignalCount === 0 → +0.5
 *   - misreadConfidence < 0.5 (or undefined) → +0.3
 */
function detectRelationshipSignalsClear(input: ContextDetectorInput): FieldDetectionResult {
  const threshold = input.threshold ?? PROVISIONAL_DEFAULT_THRESHOLD;
  let score = 0;
  const reasons: ReasonCode[] = [];

  // Travel mode 以外では発火しない (fail-closed)
  if (input.presenceMode !== "travel") {
    return { value: false, confidence: 0, reasons: ["no_signal", "below_threshold"] };
  }

  if (input.criticalSignalCount === 0) {
    score += 0.5;
    reasons.push("critical_count_zero");
  }
  if (input.misreadConfidence === undefined || input.misreadConfidence < 0.5) {
    score += 0.3;
    // reason 重複避けるため misread_low は出さない (no_signal で吸収)
  }

  const confidence = Math.min(Math.max(score, 0), 1);
  const value = confidence >= threshold;

  if (reasons.length === 0) reasons.push("no_signal");
  reasons.push(value ? "above_threshold" : "below_threshold");

  return { value, confidence, reasons };
}

/**
 * relationshipNoiseHigh 検出 (S7 Daily で関係ノイズ高).
 *
 * 本 detector は **Daily mode のみで発火**、それ以外は always false。
 *
 * Signal source:
 *   - criticalSignalCount ≥ 3 (recent N turn の累積)
 *   - misreadConfidence ≥ 0.5 (misread 累積)
 *
 * Scoring (Daily mode で発火):
 *   - criticalSignalCount ≥ 3 → +0.5
 *   - misreadConfidence ≥ 0.5 → +0.3
 */
function detectRelationshipNoiseHigh(input: ContextDetectorInput): FieldDetectionResult {
  const threshold = input.threshold ?? PROVISIONAL_DEFAULT_THRESHOLD;
  let score = 0;
  const reasons: ReasonCode[] = [];

  // Daily mode 以外では発火しない (fail-closed)
  if (input.presenceMode !== "daily") {
    return { value: false, confidence: 0, reasons: ["no_signal", "below_threshold"] };
  }

  if (input.criticalSignalCount !== undefined && input.criticalSignalCount >= 3) {
    score += 0.5;
    reasons.push("critical_count_high");
  }
  if (input.misreadConfidence !== undefined && input.misreadConfidence >= 0.5) {
    score += 0.3;
    reasons.push("misread_accumulated");
  }

  const confidence = Math.min(Math.max(score, 0), 1);
  const value = confidence >= threshold;

  if (reasons.length === 0) reasons.push("no_signal");
  reasons.push(value ? "above_threshold" : "below_threshold");

  return { value, confidence, reasons };
}

// ─────────────────────────────────────────────
// Main detector (純関数、deterministic、stateless)
// ─────────────────────────────────────────────

/**
 * `PatternContext` 7 boolean fields を input signal から推定する pure detector。
 *
 * **本関数は純関数**: 同じ input → 同じ output (deterministic)、副作用なし、
 * `Math.random` 不使用、現在時刻参照なし、external state 参照なし。
 *
 * **構造的安全 (raw text leakage 防止)**:
 *   - input は binary / count / score のみ、raw user message text 受領なし
 *   - output reasons は `ReasonCode` enum のみ、free text なし
 *   - 型レベルで PII / raw prompt / raw utterance を構造的に保存不能
 *
 * **fail-closed default**:
 *   - 全 input undefined → 全 7 fields false / confidence 0 / reasons `["no_signal", "below_threshold"]`
 *   - 過剰発火しない
 *
 * **provisional threshold**:
 *   - default τ = `PROVISIONAL_DEFAULT_THRESHOLD = 0.5` (確定値ではない)
 *   - 最終値は D5 `observe` + D6 calibration で実 data 観測後決定
 *   - 本関数では `input.threshold` で config arg override 可
 *
 * @param input Detector input (binary / count / score、raw text 受領なし)
 * @returns 7 fields の patternContext / confidence / reasons / signalCounts / detectorVersion
 */
export function detectPatternContext(input: ContextDetectorInput): ContextDetectorOutput {
  const infoMissing = detectInfoMissing(input);
  const uncertaintyHigh = detectUncertaintyHigh(input);
  const needFraming = detectNeedFraming(input);
  const oneSidedFatigue = detectOneSidedFatigue(input);
  const needTranslation = detectNeedTranslation(input);
  const relationshipSignalsClear = detectRelationshipSignalsClear(input);
  const relationshipNoiseHigh = detectRelationshipNoiseHigh(input);

  // patternContext: true 確定 field のみ含める (false / 不明は省略)
  const patternContext: Partial<PatternContext> = {};
  if (infoMissing.value) patternContext.infoMissing = true;
  if (uncertaintyHigh.value) patternContext.uncertaintyHigh = true;
  if (needFraming.value) patternContext.needFraming = true;
  if (oneSidedFatigue.value) patternContext.oneSidedFatigue = true;
  if (needTranslation.value) patternContext.needTranslation = true;
  if (relationshipSignalsClear.value) patternContext.relationshipSignalsClear = true;
  if (relationshipNoiseHigh.value) patternContext.relationshipNoiseHigh = true;

  return {
    patternContext,
    confidence: {
      infoMissing: infoMissing.confidence,
      uncertaintyHigh: uncertaintyHigh.confidence,
      needFraming: needFraming.confidence,
      oneSidedFatigue: oneSidedFatigue.confidence,
      needTranslation: needTranslation.confidence,
      relationshipSignalsClear: relationshipSignalsClear.confidence,
      relationshipNoiseHigh: relationshipNoiseHigh.confidence,
    },
    reasons: {
      infoMissing: infoMissing.reasons,
      uncertaintyHigh: uncertaintyHigh.reasons,
      needFraming: needFraming.reasons,
      oneSidedFatigue: oneSidedFatigue.reasons,
      needTranslation: needTranslation.reasons,
      relationshipSignalsClear: relationshipSignalsClear.reasons,
      relationshipNoiseHigh: relationshipNoiseHigh.reasons,
    },
    signalCounts: {
      infoMissing: infoMissing.confidence > 0 ? 1 : 0,
      uncertainty: uncertaintyHigh.confidence > 0 ? 1 : 0,
      framing: needFraming.confidence > 0 ? 1 : 0,
      fatigue: oneSidedFatigue.confidence > 0 ? 1 : 0,
      translation: needTranslation.confidence > 0 ? 1 : 0,
      relationshipClear: relationshipSignalsClear.confidence > 0 ? 1 : 0,
      relationshipNoise: relationshipNoiseHigh.confidence > 0 ? 1 : 0,
    },
    detectorVersion: DETECTOR_VERSION,
  };
}
