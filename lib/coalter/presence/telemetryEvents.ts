/**
 * CoAlter Stage 4 L4-j — Telemetry Event 型定義
 *
 * 正本: layout plan v0.3 §7.10 / §0.1 telemetry 観測項目
 *
 * 8 計測項目 (plan §7.10):
 *   ① Presence state 遷移率
 *   ② Pattern 使用分布
 *   ③ 同意・再有効化率
 *   ④ legacy fallback 率
 *   ⑤ mode 昇格・降格率
 *   ⑥ 拒否分類別件数
 *   ⑦ 緊急介入発火率
 *   ⑧ 連投抑制発火率
 *
 * 不可侵: payload schema 固定 (後方互換維持)。新フィールド追加時は本書 rev 必須。
 */

import type {
  ExecutorAvailability,
  PatternVariant,
  PresenceMode,
  PresenceState,
  SignalKind,
  SignalStrength,
} from "./types";
import type { CooldownKind } from "./constants";

// ─────────────────────────────────────────────
// 8 event 種類
// ─────────────────────────────────────────────

/** ① Presence state 遷移 */
export interface PresenceStateTransitionEvent {
  type: "coalter.presence.state_transition";
  pairId: string;
  from: PresenceState;
  to: PresenceState;
  trigger: SignalKind | "explicit_event"; // explicit_event = USER_RESPONSE / S6_PROPOSE 等
  ts: number;
}

/** ② Pattern 使用 */
export interface PatternUsedEvent {
  type: "coalter.pattern.used";
  pairId: string;
  variant: PatternVariant;
  state: PresenceState;
  mode: PresenceMode;
  /** §7.10 副次同伴 (S7 F-2 主 + F-1 副次) の有無 */
  hasSecondary: boolean;
  ts: number;
  /**
   * L4-i Phase 1 拡張 (CEO 確定 2026-04-30、設計 v2):
   *
   * 通常 speech の合成 source。`legacy.fallback` には流用しない (CEO 厳守、
   * legacy CoAlterCard semantics と分離維持)。Phase 1 default は "static"。
   *
   * - "static": flag OFF / fetch gate OFF / 既定経路 (LLM 未関与)
   * - "llm": LLM 合成成功 (Phase 2 以降で発火)
   * - "fallback": LLM 試行 → 失敗で static に降りた場合 (Phase 2 以降)
   *
   * optional: 既存 emit 経路 (Phase 1 default) との後方互換維持。
   */
  speechSource?: "static" | "llm" | "fallback";
  /**
   * LLM call の retry 回数 (0 = 1 発で通過、>=1 = retry、-1 = 全 retry 失敗で
   * fallback)。speechSource="static" で常に 0。
   */
  retries?: number;
  /** LLM call 経過時間 (ms)。speechSource="static" で 0。 */
  latencyMs?: number;
  /**
   * speechValidator が違反検出したか (true でも fallback で safe 表示維持)。
   * speechSource="static" で常に false。
   */
  validationFailed?: boolean;
  /**
   * fallback 採用理由 (speechSource="fallback" のときのみ非 null)。
   *
   * - "flag_off": server LLM flag OFF (Phase 1 default)
   * - "rate_limited": API route rate limit 到達
   * - "llm_error": Anthropic API 5xx / 通信エラー
   * - "validation_failed": speechValidator 全 retry 後も違反
   * - "timeout": client 2s timeout
   */
  fallbackReason?:
    | "flag_off"
    | "rate_limited"
    | "llm_error"
    | "validation_failed"
    | "timeout"
    | null;
}

/** ③ 同意 / 再有効化 */
export interface ConsentEvent {
  type: "coalter.consent.event";
  pairId: string;
  fromAvailability: ExecutorAvailability;
  toAvailability: ExecutorAvailability;
  /** REQUEST_CONSENT / CONSENT_GRANTED / CONSENT_REJECTED / REENABLE_REQUEST 等 */
  eventKind:
    | "request_consent"
    | "consent_granted"
    | "consent_rejected"
    | "reenable_request"
    | "opt_out"
    | "session_end"
    | "activate";
  ts: number;
}

/** ④ legacy fallback */
export interface LegacyFallbackEvent {
  type: "coalter.legacy.fallback";
  pairId: string;
  /** legacy CoAlterCard 自動挿入が走った (legacyCardAutoInsertEnabled=true 時) */
  legacyAutoInsertFired: boolean;
  /** Phase 6.C+ Dispatcher 経路を通った場合 (常時動作経路) */
  dispatcherUsed: boolean;
  ts: number;
}

/** ⑤ mode 昇格 / 降格 */
export interface ModeTransitionEvent {
  type: "coalter.mode.transition";
  pairId: string;
  from: PresenceMode;
  to: PresenceMode;
  trigger: "manual_switch" | "auto_escalate" | "plan_complete" | "manual_return";
  ts: number;
}

/** ⑥ 拒否分類別件数 */
export interface RejectionEvent {
  type: "coalter.rejection.recorded";
  pairId: string;
  category: "mode_escalation" | "individual_proposal" | "coalter_retreat";
  /** proposal 拒否時のテーマ */
  theme?: string;
  /** mode 拒否時の対象 mode */
  rejectedMode?: PresenceMode;
  ts: number;
}

/** ⑦ 緊急介入発火 */
export interface UrgentTriggerEvent {
  type: "coalter.urgent.triggered";
  pairId: string;
  category:
    | "rupture_detected"
    | "dignity_violation"
    | "safety_concern"
    | "heat_escalation"
    | "asymmetric_overload";
  form: "overlay_banner" | "dominant_card" | "inline_cue";
  memoryFallback: "demote" | "compact";
  ts: number;
}

/** ⑧ 連投抑制発火 */
export interface RateLimitBlockedEvent {
  type: "coalter.ratelimit.blocked";
  pairId: string;
  state: PresenceState;
  variant: PatternVariant;
  violation:
    | "concurrent_active_utterance"
    | "normal_s8_cooldown_active"
    | "recent_same_state_within_5min"
    | "multiple_pattern_in_one_turn"
    | "line_length_violation";
  ts: number;
}

/**
 * 関連 (signal 強度・cooldown kind)。8 項目以外の補助 type。
 */
export interface SignalEmitContext {
  pairId: string;
  signalKind: SignalKind;
  signalStrength: SignalStrength;
  cooldownActive?: ReadonlyArray<CooldownKind>;
  ts: number;
}

/**
 * 全 telemetry event の union (emitter に渡される)。
 */
export type TelemetryEvent =
  | PresenceStateTransitionEvent
  | PatternUsedEvent
  | ConsentEvent
  | LegacyFallbackEvent
  | ModeTransitionEvent
  | RejectionEvent
  | UrgentTriggerEvent
  | RateLimitBlockedEvent;

/**
 * 8 event type 列挙 (網羅性 test 用)。
 */
export const TELEMETRY_EVENT_TYPES = [
  "coalter.presence.state_transition",
  "coalter.pattern.used",
  "coalter.consent.event",
  "coalter.legacy.fallback",
  "coalter.mode.transition",
  "coalter.rejection.recorded",
  "coalter.urgent.triggered",
  "coalter.ratelimit.blocked",
] as const satisfies ReadonlyArray<TelemetryEvent["type"]>;
