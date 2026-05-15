/**
 * CoAlter Gap 4 — Route Observation Mode Parser + Builder (D3 phase)
 *
 * 正本:
 *   - docs/coalter-master-design.md (Gap 4 phase plan)
 *   - lib/coalter/presence/contextDetector.ts (Gap 4 D2、PR #130)
 *
 * 役割:
 *   invoke route が Gap 4 contextDetector (D2) を呼ぶための、
 *   - **mode parser** (env value / explicit param を whitelist で normalize、fail-closed)
 *   - **observation field builder** (detector を呼んで additive response field を生成)
 *   を提供する **pure function**。
 *
 *   本 D3 phase の目的は **route observation only**。
 *   - additive response field のみ
 *   - UI / Pattern activation / ChatClient 変更なし
 *   - default OFF (env 未設定で既存挙動完全維持)
 *   - live activation は本 PR では行わない (D7 で扱う)
 *
 * 構造的安全設計 (Gap 4 D2 + Travel T1-T5 継承):
 *   1. **raw text leakage 構造的防止** (型レベル enforcement):
 *      - input は `Partial<ContextDetectorInput>` のみ (binary / count / score)
 *      - caller が raw user text を渡そうとしても型不一致で受領不可
 *      - output reasonCodes / skippedReason は **enum only**
 *   2. **whitelist + fail-closed parsing**:
 *      - "off" / "observe" / "live" のみ accept
 *      - unknown value (typo / 大文字混在 / 空文字 / null / undefined) → silently "off"
 *      - production stability 重視 (WARNING ではなく silently fallback)
 *   3. **default OFF**:
 *      - env 未設定 → "off"
 *      - "off" mode → observation field 完全不在 (existing client backward compat)
 *   4. **activation guard always false (D3 phase enforce)**:
 *      - "live" mode が parse されても、本 PR では `activation: false` 固定
 *      - variant 発火 / Pattern activation は D7 phase
 *   5. **deterministic**:
 *      - 純関数、Math.random 不使用、stateless、external state 参照なし
 *
 * 後続 phase (本 PR scope 外):
 *   - D4: client (UI) 接続 (別 PR)
 *   - D5: observe mode の telemetry / Sentry 接続 (別 PR)
 *   - D6: calibration (threshold 確定) (別 PR)
 *   - D7: live activation (Pattern variant 発火) (別 PR、CEO 戦略判断)
 *
 * 本 PR の不可触 (CEO 2026-05-16 制約):
 *   - ChatClient / UpperLayerMount / UI 変更
 *   - Pattern activation / variant 発火
 *   - telemetry / Sentry 実装
 *   - production env / Vercel env 変更
 *   - external API / API key
 *   - Supabase migration
 *   - DD4 / Travel T6 / Activity AD5 / Movie Path α env 操作
 *
 * env var (本 PR で新規参照):
 *   - `COALTER_GAP4_OBSERVATION_MODE` (string、optional、default "off")
 *     - "off" / "observe" / "live" のみ accept (大文字小文字混在 OK)
 *     - 未設定 / 未知値 → "off"
 *     - 本 PR では env file / production env 変更なし
 *     - production / Vercel での設定は CEO 戦略判断後
 */

import {
  detectPatternContext,
  DETECTOR_VERSION,
  type ContextDetectorInput,
  type ContextDetectorOutput,
  type ReasonCode,
} from "./contextDetector";
import type { PatternContext } from "./patternSelector";

// ─────────────────────────────────────────────
// version (calibration 用、route observation 独立 version)
// ─────────────────────────────────────────────

/**
 * Gap 4 route observation version 文字列 (semver).
 *
 * 本 D3 phase 初版 = "0.1.0"。
 * D5/D6 phase で telemetry / calibration 追加時 MINOR up。
 */
export const GAP4_ROUTE_OBSERVATION_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// env var name (production env 変更は本 PR では行わない)
// ─────────────────────────────────────────────

/**
 * Env var name for Gap 4 observation mode.
 *
 * **本 PR では env file / production env 変更なし**。
 * production / Vercel での設定は CEO 戦略判断後 (D7 phase)。
 */
export const GAP4_OBSERVATION_MODE_ENV_VAR = "COALTER_GAP4_OBSERVATION_MODE";

// ─────────────────────────────────────────────
// Mode enum (whitelist、CEO 指定 3 値)
// ─────────────────────────────────────────────

/**
 * Gap 4 observation mode.
 *
 *   - "off": observation 完全停止、response field 不在 (default、既存挙動完全維持)
 *   - "observe": detector を呼ぶ、additive response field のみ、UI 不変、variant 不発火
 *   - "live": parse は OK だが **本 D3 PR では activation: false 固定** (D7 で扱う)
 *
 * **fail-closed**: 未知値 / 空文字 / null / undefined → "off"。
 */
export type Gap4ObservationMode = "off" | "observe" | "live";

// ─────────────────────────────────────────────
// Skip reason enum (CEO 指定、5 値)
// ─────────────────────────────────────────────

/**
 * Reason why observation field was skipped or partial (enum only).
 *
 *   - "mode_off": env mode "off"
 *   - "mode_unknown_fallback_off": env value が unknown で "off" に fallback
 *   - "insufficient_structured_signals": detector input に必要な signal が無い
 *     (raw user text のみで detector に渡せない場合)
 *   - "detector_input_invalid": detector が throw した (input shape 異常等)
 *   - "pattern_context_undetermined": detector 走ったが全 field undefined
 *     (signal はあったが confidence threshold 未達 + raw signal も無し)
 */
export type Gap4RouteObservationSkipReason =
  | "mode_off"
  | "mode_unknown_fallback_off"
  | "insufficient_structured_signals"
  | "detector_input_invalid"
  | "pattern_context_undetermined";

// ─────────────────────────────────────────────
// Top-level reason code (observation builder の状態、enum only)
// ─────────────────────────────────────────────

export type Gap4RouteObservationReasonCode =
  | "mode_observe_applied"
  | "mode_live_parsed_no_activation"
  | "detector_invoked"
  | "detector_skipped"
  | "fail_closed_unknown_mode"
  | "signals_hint_provided"
  | "signals_hint_absent"
  | "activation_guarded_false";

// ─────────────────────────────────────────────
// Observation field output type (additive response field)
// ─────────────────────────────────────────────

/**
 * Gap 4 route observation additive response field.
 *
 * 本 type は invoke route が `gap4ContextObservation?:` として **additive**
 * に response に含める optional field の shape。既存 client は無視可能。
 *
 * **構造的安全 (raw text leakage 防止)**:
 *   - patternContext は `Partial<PatternContext>` (boolean enum field のみ)
 *   - confidence は number、reasonCodes は enum、detectorVersion は固定 semver
 *   - raw user text / PII を含めない (型レベル enforcement)
 *
 * **activation flag (本 D3 PR では常に false)**:
 *   - D3 phase では variant 発火 / Pattern activation を行わない
 *   - live mode が parse されても activation: false 固定
 *   - D7 phase で activation true 化を扱う (別 PR)
 */
export interface Gap4RouteObservationField {
  /** Parsed observation mode (whitelist、fail-closed) */
  mode: Gap4ObservationMode;
  /** Detector version (calibration 用、optional) */
  detectorVersion?: string;
  /** Partial pattern context (true 確定 field のみ、optional) */
  patternContext?: Partial<PatternContext>;
  /** Confidence per field (0-1、optional) */
  confidence?: Record<keyof PatternContext, number>;
  /** Reason codes per field (enum only、optional) */
  reasonCodes?: Record<keyof PatternContext, ReasonCode[]>;
  /** Signal counts (debug / observability、optional) */
  signalCounts?: ContextDetectorOutput["signalCounts"];
  /** Skip reason (skipped 時、enum only、optional) */
  skippedReason?: Gap4RouteObservationSkipReason;
  /** Top-level observation reason codes (enum only) */
  reasonCodes_top: Gap4RouteObservationReasonCode[];
  /** Activation flag (**本 D3 PR では常に false**、D7 で扱う) */
  activation: false;
  /** Observation version (semver) */
  observationVersion: string;
}

// ─────────────────────────────────────────────
// Mode parser (whitelist + fail-closed、pure)
// ─────────────────────────────────────────────

/**
 * Parse env value (or explicit param) into Gap4ObservationMode.
 *
 * **Whitelist**: "off" / "observe" / "live" のみ accept (大文字小文字混在 OK)。
 * **Fail-closed**: 未知値 / 空文字 / null / undefined → "off"。
 *
 * Production stability 重視: WARNING / error throw ではなく silently fallback。
 *
 * @param rawValue env value (process.env[...]) or explicit param
 * @returns normalized Gap4ObservationMode (whitelist の 1 つ、デフォルト "off")
 */
export function parseGap4ObservationMode(
  rawValue: string | undefined | null,
): Gap4ObservationMode {
  if (rawValue === undefined || rawValue === null) return "off";
  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized === "off") return "off";
  if (normalized === "observe") return "observe";
  if (normalized === "live") return "live";
  // Fail-closed: 未知値 → silently off (production stability)
  return "off";
}

/**
 * Detect whether parser fell back to "off" due to unknown value
 * (vs intentional "off" or missing).
 *
 * 用途: observation field の skippedReason = "mode_unknown_fallback_off" を
 * 正確に立てるための判定。
 */
export function isModeUnknownFallback(
  rawValue: string | undefined | null,
): boolean {
  if (rawValue === undefined || rawValue === null) return false;
  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized === "") return false; // empty string is treated as "missing", not "unknown"
  if (normalized === "off" || normalized === "observe" || normalized === "live") return false;
  return true;
}

// ─────────────────────────────────────────────
// Structured signal validator (raw text 構造的拒否、pure)
// ─────────────────────────────────────────────

/**
 * caller-provided signal hint が detector input として **必要十分な構造的 signal**
 * を持つか判定 (pure).
 *
 * detector に渡せる signal source:
 *   - infoMissingSignal / recentMessageCount
 *   - stallDetected / ambiguityResponseMode
 *   - contradictionDetected
 *   - fairnessBias
 *   - misreadConfidence
 *   - criticalSignalCount
 *   - presenceMode
 *
 * 1 つでも defined なら structured signal あり → detector 呼べる。
 * 全 undefined → raw text のみで detector に渡せない → skip。
 *
 * **重要**: 本関数は **caller が pre-binarize した signal だけ accept**。raw user
 * text を直接渡そうとしても型不一致で受領不可 (構造的安全)。
 */
export function hasAnyStructuredSignal(
  hint: Partial<ContextDetectorInput> | undefined,
): boolean {
  if (hint === undefined) return false;
  return (
    hint.infoMissingSignal !== undefined ||
    hint.recentMessageCount !== undefined ||
    hint.stallDetected !== undefined ||
    hint.ambiguityResponseMode !== undefined ||
    hint.contradictionDetected !== undefined ||
    hint.fairnessBias !== undefined ||
    hint.misreadConfidence !== undefined ||
    hint.criticalSignalCount !== undefined ||
    hint.presenceMode !== undefined
  );
}

/**
 * detector output から全 patternContext field が undetermined (false / 不在)
 * かを判定 (pure).
 *
 * 用途: detector を走らせたが全 field が undetermined だった場合の skip reason。
 */
function isPatternContextEmpty(out: ContextDetectorOutput): boolean {
  return Object.keys(out.patternContext).length === 0;
}

// ─────────────────────────────────────────────
// Observation builder (pure function、deterministic、stateless)
// ─────────────────────────────────────────────

/**
 * Build options for `buildGap4RouteObservation`.
 */
export interface BuildGap4ObservationOptions {
  /** Parsed mode (whitelist の 1 つ) */
  mode: Gap4ObservationMode;
  /** Whether the original env value was unknown (fail-closed fallback) */
  modeWasUnknown?: boolean;
  /**
   * Caller-provided structured signal hint (Partial<ContextDetectorInput>).
   *
   * **重要**: raw user text を含む field を受領しない (型レベル enforcement)。
   * caller は事前に binary / count / score 化した signal だけを渡せる。
   */
  signalsHint?: Partial<ContextDetectorInput>;
}

/**
 * Build Gap 4 route observation field (pure function).
 *
 * **本関数は純関数**: 同じ input → 同じ output、副作用なし、
 * `Math.random` 不使用、現在時刻参照なし、external state 参照なし。
 *
 * **Behavior matrix**:
 *
 * | mode | modeWasUnknown | signalsHint | result |
 * |------|----------------|-------------|--------|
 * | "off" | false | (any) | undefined (field 不在、既存 response 維持) |
 * | "off" | true | (any) | field with skippedReason="mode_unknown_fallback_off" |
 * | "observe" | (any) | absent / empty | field with skippedReason="insufficient_structured_signals" |
 * | "observe" | (any) | has signals | field with detector output (activation: false) |
 * | "live" | (any) | absent / empty | field with skippedReason="insufficient_structured_signals" (activation: false) |
 * | "live" | (any) | has signals | field with detector output (activation: **false**、D3 phase 強制) |
 *
 * **D3 phase 強制 (CEO 2026-05-16)**:
 *   - activation は常に `false` (D7 で扱う)
 *   - variant 発火 / Pattern activation は本関数では行わない
 *
 * @param opts mode + modeWasUnknown + optional signalsHint
 * @returns observation field, or `undefined` if mode="off" and not unknown fallback
 */
export function buildGap4RouteObservation(
  opts: BuildGap4ObservationOptions,
): Gap4RouteObservationField | undefined {
  const reasonCodes: Gap4RouteObservationReasonCode[] = [];

  // 1. mode "off" without unknown fallback → field 完全不在 (既存 response 維持)
  if (opts.mode === "off" && opts.modeWasUnknown !== true) {
    return undefined;
  }

  // 2. unknown value fell back to "off" → field 出すが skippedReason 明示
  if (opts.mode === "off" && opts.modeWasUnknown === true) {
    reasonCodes.push("fail_closed_unknown_mode");
    reasonCodes.push("detector_skipped");
    reasonCodes.push("activation_guarded_false");
    return {
      mode: "off",
      skippedReason: "mode_unknown_fallback_off",
      reasonCodes_top: reasonCodes,
      activation: false,
      observationVersion: GAP4_ROUTE_OBSERVATION_VERSION,
    };
  }

  // 3. mode "observe" or "live" → 共通 logic
  if (opts.mode === "observe") {
    reasonCodes.push("mode_observe_applied");
  } else {
    reasonCodes.push("mode_live_parsed_no_activation");
  }

  // 4. signalsHint 不在 / 空 → insufficient_structured_signals で skip
  if (!hasAnyStructuredSignal(opts.signalsHint)) {
    reasonCodes.push("signals_hint_absent");
    reasonCodes.push("detector_skipped");
    reasonCodes.push("activation_guarded_false");
    return {
      mode: opts.mode,
      skippedReason: "insufficient_structured_signals",
      reasonCodes_top: reasonCodes,
      activation: false,
      observationVersion: GAP4_ROUTE_OBSERVATION_VERSION,
    };
  }

  // 5. detector を try-catch で走らせる (fail-closed on throw)
  reasonCodes.push("signals_hint_provided");
  let detectorOut: ContextDetectorOutput;
  try {
    // hint is Partial<ContextDetectorInput>、detector は Partial fields を許容
    detectorOut = detectPatternContext(opts.signalsHint as ContextDetectorInput);
  } catch {
    // detector が throw した → fail-closed、skip reason 明示
    reasonCodes.push("detector_skipped");
    reasonCodes.push("activation_guarded_false");
    return {
      mode: opts.mode,
      skippedReason: "detector_input_invalid",
      reasonCodes_top: reasonCodes,
      activation: false,
      observationVersion: GAP4_ROUTE_OBSERVATION_VERSION,
    };
  }

  // 6. detector 走ったが pattern context 全 undetermined → skip reason 明示
  //    (signal はあったが confidence threshold 未達 + 全 field false の状態)
  if (isPatternContextEmpty(detectorOut)) {
    reasonCodes.push("detector_invoked");
    reasonCodes.push("activation_guarded_false");
    return {
      mode: opts.mode,
      detectorVersion: detectorOut.detectorVersion,
      confidence: detectorOut.confidence,
      reasonCodes: detectorOut.reasons,
      signalCounts: detectorOut.signalCounts,
      skippedReason: "pattern_context_undetermined",
      reasonCodes_top: reasonCodes,
      activation: false,
      observationVersion: GAP4_ROUTE_OBSERVATION_VERSION,
    };
  }

  // 7. 通常 path: detector output を additive field に
  reasonCodes.push("detector_invoked");
  reasonCodes.push("activation_guarded_false");
  return {
    mode: opts.mode,
    detectorVersion: detectorOut.detectorVersion,
    patternContext: detectorOut.patternContext,
    confidence: detectorOut.confidence,
    reasonCodes: detectorOut.reasons,
    signalCounts: detectorOut.signalCounts,
    reasonCodes_top: reasonCodes,
    // **D3 phase 強制 (CEO 2026-05-16): activation: false 固定**
    activation: false,
    observationVersion: GAP4_ROUTE_OBSERVATION_VERSION,
  };
}

// ─────────────────────────────────────────────
// Convenience: env → observation field (route から薄く呼ぶ用)
// ─────────────────────────────────────────────

/**
 * Convenience wrapper: env value を直接受けて observation field を返す.
 *
 * route 内で薄く呼ぶための shortcut。env value parsing + observation building
 * を 1 関数で実行。
 *
 * @param envValue process.env[GAP4_OBSERVATION_MODE_ENV_VAR] の値
 * @param signalsHint caller-provided structured signal hint (optional)
 * @returns observation field, or undefined if mode="off" without fallback
 */
export function buildGap4RouteObservationFromEnv(
  envValue: string | undefined | null,
  signalsHint?: Partial<ContextDetectorInput>,
): Gap4RouteObservationField | undefined {
  const mode = parseGap4ObservationMode(envValue);
  const modeWasUnknown = isModeUnknownFallback(envValue);
  return buildGap4RouteObservation({
    mode,
    modeWasUnknown,
    signalsHint,
  });
}

// ─────────────────────────────────────────────
// Re-export detector types (caller convenience)
// ─────────────────────────────────────────────

export type { ContextDetectorInput, ContextDetectorOutput, ReasonCode };
export { DETECTOR_VERSION };
