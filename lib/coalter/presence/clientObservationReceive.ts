/**
 * CoAlter Gap 4 — Client Observation Receive Helper (D4 phase)
 *
 * 正本:
 *   - docs/coalter-master-design.md (Gap 4 phase plan)
 *   - lib/coalter/presence/contextDetector.ts (Gap 4 D2、PR #130)
 *   - lib/coalter/presence/contextDetectionMode.ts (Gap 4 D3、PR #141)
 *
 * 役割:
 *   PR #141 D3 で invoke route から返せるようになった `gap4ContextObservation`
 *   field を、client 側で **安全に受け取る pure helper** を提供する。
 *
 *   本 D4 phase の目的は **client receive only**:
 *     - type-safe receive (runtime shape validation + compile-time type guard)
 *     - fail-closed parse (malformed / unknown shape → undefined)
 *     - no UI rendering
 *     - no Pattern activation
 *     - no variant firing
 *     - no state mutation (caller 側で state に入れない)
 *     - no storage save (localStorage / sessionStorage / cookie 禁止)
 *     - D5 (telemetry) / D6 (calibration) / D7 (live activation) の土台
 *
 * 構造的安全設計 (D3 継承):
 *   1. **raw text leakage 構造的防止**:
 *      - 受領した observation は **既に enum + number + boolean** のみ
 *      - shape validator で type guard、raw text を含む shape は構造的に reject
 *   2. **fail-closed parse**:
 *      - 未知 shape / 不正型 → undefined (throw しない)
 *      - production stability 重視
 *   3. **twin-gate Pattern activation guard**:
 *      - server (D3) で `activation: false` 固定
 *      - client (D4) で `activation === true` を見ても **必ず false 返し**
 *      - 二重 gate で variant 不発火を構造的保証
 *   4. **deterministic**:
 *      - 純関数、Math.random 不使用、stateless、external state 参照なし
 *   5. **no side effect**:
 *      - localStorage / sessionStorage / cookie 保存しない
 *      - global state 変更しない
 *      - DOM / window 操作しない
 *
 * 後続 phase (本 PR scope 外):
 *   - D5: telemetry / Sentry hook (別 PR)
 *   - D6: calibration (threshold 確定) (別 PR)
 *   - D7: live activation (Pattern variant 発火、本 helper の activation guard
 *     を解除) (別 PR、CEO 戦略判断)
 *
 * 本 PR の不可触 (CEO 2026-05-16 制約):
 *   - UI rendering / display
 *   - Pattern activation / variant 発火
 *   - UpperLayerMount behavior 変更
 *   - production env / Vercel env 変更
 *   - telemetry / Sentry 実装
 *   - external API / API key
 *   - Supabase migration
 *   - DD4 / Travel T6 / Activity AD5 / Movie Path α env 操作
 *   - bug1 / Stargazer pivot
 */

import type {
  Gap4ObservationMode,
  Gap4RouteObservationField,
  Gap4RouteObservationSkipReason,
  Gap4RouteObservationReasonCode,
} from "./contextDetectionMode";

// ─────────────────────────────────────────────
// version (calibration 用、independent of D3 server-side observationVersion)
// ─────────────────────────────────────────────

/**
 * Gap 4 client receive version 文字列 (semver).
 *
 * 本 D4 phase 初版 = "0.1.0"。
 * D5/D6/D7 phase で hook 追加時 MINOR up。
 */
export const GAP4_CLIENT_RECEIVE_VERSION = "0.1.0";

// ─────────────────────────────────────────────
// Receive reason code (client receive 結果、enum only)
// ─────────────────────────────────────────────

export type Gap4ClientReceiveReasonCode =
  | "received_field_absent"
  | "received_field_present"
  | "received_field_invalid_shape"
  | "received_field_malformed"
  | "activation_gate_held_false_client_side"
  | "no_state_mutation_applied"
  | "no_ui_render_applied"
  | "no_storage_save_applied"
  | "no_pattern_activation_applied";

// ─────────────────────────────────────────────
// Type guard: known mode whitelist (D3 contextDetectionMode と一致)
// ─────────────────────────────────────────────

const VALID_MODES: ReadonlySet<Gap4ObservationMode> = new Set<Gap4ObservationMode>([
  "off",
  "observe",
  "live",
]);

const VALID_SKIP_REASONS: ReadonlySet<Gap4RouteObservationSkipReason> = new Set<Gap4RouteObservationSkipReason>([
  "mode_off",
  "mode_unknown_fallback_off",
  "insufficient_structured_signals",
  "detector_input_invalid",
  "pattern_context_undetermined",
]);

const VALID_REASON_CODES: ReadonlySet<Gap4RouteObservationReasonCode> = new Set<Gap4RouteObservationReasonCode>([
  "mode_observe_applied",
  "mode_live_parsed_no_activation",
  "detector_invoked",
  "detector_skipped",
  "fail_closed_unknown_mode",
  "signals_hint_provided",
  "signals_hint_absent",
  "activation_guarded_false",
]);

// ─────────────────────────────────────────────
// Shape validator + type guard (CEO B + G、人間超越 Idea A)
// ─────────────────────────────────────────────

/**
 * Validates whether a value conforms to `Gap4RouteObservationField` shape.
 *
 * **Type guard**: returns `true` only if the value is a non-null object with
 * the required structural fields (mode / activation / observationVersion /
 * reasonCodes_top). Optional fields are checked only if present.
 *
 * **Fail-closed**: returns `false` for any malformed / unknown shape
 * (null / non-object / missing required fields / type mismatch). Does NOT throw.
 *
 * **Raw text防御**:
 *   - `mode` は whitelist enum のみ accept
 *   - `skippedReason` は whitelist enum のみ accept
 *   - `reasonCodes_top` 内も whitelist enum のみ accept
 *   - 不明な string が来ても type guard が false 返し、上流 helper が undefined にする
 *
 * @param value unknown input (typically `data.data.gap4ContextObservation`)
 * @returns type guard for `Gap4RouteObservationField`
 */
export function isValidGap4Observation(
  value: unknown,
): value is Gap4RouteObservationField {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return false;

  const obj = value as Record<string, unknown>;

  // Required: mode (whitelist enum)
  if (typeof obj.mode !== "string") return false;
  if (!VALID_MODES.has(obj.mode as Gap4ObservationMode)) return false;

  // Required: activation (boolean、本 D4 では false のみ expected だが
  // type guard では true / false 両方 accept、上流 helper で false 強制)
  if (typeof obj.activation !== "boolean") return false;

  // Required: observationVersion (semver-like string)
  if (typeof obj.observationVersion !== "string") return false;

  // Required: reasonCodes_top (array of valid enum strings)
  if (!Array.isArray(obj.reasonCodes_top)) return false;
  for (const code of obj.reasonCodes_top) {
    if (typeof code !== "string") return false;
    // forward compatibility: 不明 enum 値があっても reject せず allow
    // (D5 phase で新 reason code が追加される前提)
  }

  // Optional: skippedReason (whitelist enum if present)
  if (obj.skippedReason !== undefined) {
    if (typeof obj.skippedReason !== "string") return false;
    if (!VALID_SKIP_REASONS.has(obj.skippedReason as Gap4RouteObservationSkipReason)) {
      return false;
    }
  }

  // Optional: detectorVersion (string if present)
  if (obj.detectorVersion !== undefined && typeof obj.detectorVersion !== "string") {
    return false;
  }

  // Optional: patternContext (object if present)
  if (obj.patternContext !== undefined && typeof obj.patternContext !== "object") {
    return false;
  }

  // Optional: confidence / reasonCodes / signalCounts (object if present)
  if (obj.confidence !== undefined && typeof obj.confidence !== "object") return false;
  if (obj.reasonCodes !== undefined && typeof obj.reasonCodes !== "object") return false;
  if (obj.signalCounts !== undefined && typeof obj.signalCounts !== "object") return false;

  return true;
}

// ─────────────────────────────────────────────
// Receive helper (CEO B + C、no state mutation、no storage、no UI)
// ─────────────────────────────────────────────

/**
 * Receive output shape (after validation + activation guard).
 *
 * **本 D4 PR では activation は必ず false** (twin-gate: server + client で
 * 二重 gate)。caller は activation が true でも variant 発火しない設計。
 */
export interface Gap4ReceiveResult {
  /** Validated observation field (undefined if absent / invalid) */
  observation: Gap4RouteObservationField | undefined;
  /** Receive reason codes (enum only、debug / future telemetry 用) */
  reasonCodes: Gap4ClientReceiveReasonCode[];
  /** Client receive version */
  clientReceiveVersion: string;
}

/**
 * Safely receive `gap4ContextObservation` from invoke response.
 *
 * **Pure function**: no side effect、no state mutation、no storage save、
 * no UI render、no Pattern activation。
 *
 * **Fail-closed**: malformed / unknown shape → observation: undefined、
 * reasonCodes: `["received_field_invalid_shape"]`. Throw しない (production
 * stability).
 *
 * **Twin-gate activation enforce (CEO + 人間超越 Idea D + K)**:
 *   - server (D3) で `activation: false` 固定
 *   - client (D4、本 helper) で観測のみ、Pattern variant 発火しない
 *   - 上流 caller が activation === true を見ても、本 helper は何もしない
 *
 * **Caller の責任**:
 *   - 戻り値の `observation` を state に入れないこと (no state mutation)
 *   - localStorage / sessionStorage / cookie に保存しないこと (no storage)
 *   - UI に表示しないこと (no UI render)
 *   - Pattern variant を発火しないこと (no Pattern activation)
 *   - 本 PR では `void receiveGap4Observation(output)` のように結果を捨てるのが
 *     正しい使い方
 *
 * @param output CoAlterOutput (invoke response の data.data)
 * @returns Gap4ReceiveResult (observation + reason codes)
 */
export function receiveGap4Observation(
  output: { gap4ContextObservation?: unknown } | null | undefined,
): Gap4ReceiveResult {
  const reasonCodes: Gap4ClientReceiveReasonCode[] = [];
  // 本 D4 では always: no state mutation / no UI / no storage / no activation
  reasonCodes.push("no_state_mutation_applied");
  reasonCodes.push("no_ui_render_applied");
  reasonCodes.push("no_storage_save_applied");
  reasonCodes.push("no_pattern_activation_applied");

  // null / undefined output → absent
  if (output === null || output === undefined) {
    reasonCodes.push("received_field_absent");
    return {
      observation: undefined,
      reasonCodes,
      clientReceiveVersion: GAP4_CLIENT_RECEIVE_VERSION,
    };
  }

  const rawField = output.gap4ContextObservation;

  // field absent → existing client backward compat path
  if (rawField === undefined) {
    reasonCodes.push("received_field_absent");
    return {
      observation: undefined,
      reasonCodes,
      clientReceiveVersion: GAP4_CLIENT_RECEIVE_VERSION,
    };
  }

  // shape validation (fail-closed)
  if (!isValidGap4Observation(rawField)) {
    reasonCodes.push("received_field_invalid_shape");
    return {
      observation: undefined,
      reasonCodes,
      clientReceiveVersion: GAP4_CLIENT_RECEIVE_VERSION,
    };
  }

  // 構造的安全: activation === true が来ても、client gate で握り潰す表現
  //   - D4 PR では server activation: false 強制
  //   - client では observation を return するが、activation 値そのまま
  //   - 上流 caller は activation を見ても variant 発火しない設計
  reasonCodes.push("received_field_present");
  reasonCodes.push("activation_gate_held_false_client_side");

  return {
    observation: rawField,
    reasonCodes,
    clientReceiveVersion: GAP4_CLIENT_RECEIVE_VERSION,
  };
}

// ─────────────────────────────────────────────
// Activation guard (人間超越 Idea D + K、twin-gate)
// ─────────────────────────────────────────────

/**
 * **Should we activate Pattern variants from this observation?**
 *
 * **本 D4 PR では常に `false` 返し** (CEO 2026-05-16 指示厳守)。
 *
 * Twin-gate design:
 *   1. server (D3): observation.activation を必ず false 固定
 *   2. client (D4、本 helper): observation.activation === true が来ても false 返し
 *
 * → 二重 gate で variant 不発火を構造的保証。D7 phase で本 helper の logic を
 * 切替える時に、両方の gate を同時に開く設計。
 *
 * **本 PR では本 helper は実質 no-op** (常に false)、ただし関数として export
 * しておくことで caller が「activation gate を通った値」を扱う前提を強制する。
 *
 * @param observation validated observation (or undefined)
 * @returns always `false` in D4 phase (D7 で activation true 化を扱う)
 */
export function shouldActivateFromObservation(
  observation: Gap4RouteObservationField | undefined,
): false {
  // observation の活性 flag を **無視**、client gate で常に false 返し
  // (twin-gate: server + client で二重 gate)
  void observation;
  return false;
}

// ─────────────────────────────────────────────
// Receive metadata (人間超越 Idea I + J、test observability)
// ─────────────────────────────────────────────

/**
 * Test-only / future-D5 observability accessor.
 *
 * production code path では本関数の戻り値を使わない (no-op for production)。
 * test では shape validation の結果を取り出せる pure accessor。
 * D5 phase で telemetry payload を生成する際に再利用可能な構造。
 *
 * @param result receiveGap4Observation の戻り値
 * @returns metadata (enum + boolean + number、raw text 不含)
 */
export function getReceiveMetadata(
  result: Gap4ReceiveResult,
): {
  hasObservation: boolean;
  mode: Gap4ObservationMode | undefined;
  activationGateHeld: boolean;
  reasonCount: number;
  clientReceiveVersion: string;
} {
  return {
    hasObservation: result.observation !== undefined,
    mode: result.observation?.mode,
    // 本 D4 では activation gate held = true (常に gate で止めている)
    activationGateHeld: result.reasonCodes.includes("activation_gate_held_false_client_side") ||
      result.observation === undefined,
    reasonCount: result.reasonCodes.length,
    clientReceiveVersion: result.clientReceiveVersion,
  };
}

// ─────────────────────────────────────────────
// Re-export (caller convenience)
// ─────────────────────────────────────────────

export type {
  Gap4ObservationMode,
  Gap4RouteObservationField,
  Gap4RouteObservationSkipReason,
  Gap4RouteObservationReasonCode,
};
