/**
 * CoAlter Always-On Observer — Relationship State Types (Phase A-1b)
 *
 * 正本:
 *   - docs/coalter-aoo-presence-reconciliation.md §4.2 (PR #154, 2026-05-16 訂正)
 *   - docs/coalter-always-on-observer-design.md §3 Layer 3, §4 Phase A-1 (PR #151, correction notice 適用)
 *   - docs/coalter-aoo-phase-a0-mode-state-audit.md §1.10 (PR #152, correction notice 適用)
 *
 * 役割:
 *   Relationship State Container の型定義。runtime-unwired。
 *
 * Phase A-1b (PresenceMode alignment) の変更:
 *   - 独自 `ModeContext` 型を削除、`PresenceMode | null` を使う
 *     (既存 `lib/coalter/presence/types.ts` の canonical 型と整合、責務分離維持)
 *   - 独自 `ObserverActivationState` 型を削除、`ExecutorAvailability` を使う
 *   - schemaVersion 1 → 2 にbump (breaking type change のため、A-1 deliverable に外部
 *     caller ゼロのため安全)
 *   - ReasonCode の mode 関連を PresenceMode 値に整合
 *   - PresenceMode は PII ではない（observer 文脈の重要 dimension）→ redacted snapshot
 *     にそのまま含めて良い (CEO/GPT 判断 2026-05-16: B3 NO)
 *
 * 並走原則 (CEO/GPT 判断 2026-05-16: 並走、型整合必須):
 *   - presence layer = runtime state machine / mode UI / escalation / cooldown (server 正本)
 *   - observer layer = observation 時系列蓄積 / PII firewall snapshot / A4 retrieval 用 cache
 *   - 両者は責務が異なる並走 layer。observer は presence の値を read-only で参照、
 *     書き込みは presence layer のみ (一方向 dependency)
 *
 * CRITICAL 設計原則 (継続):
 *   1. 本モジュールは "pure module" ではなく "self-contained in-memory state
 *      container" の型定義。container 自体は stateful（module-level Map を持つ）
 *      が、本ファイルは型のみ。
 *   2. raw `pairStateId` は internal key only。external snapshot に出さない。
 *   3. external 出力時は `redactedRelationshipKey` (sha256 派生) を使う。
 *   4. raw `userId` / `pairId` / `threadId` / `email` / URL / message text / utterance
 *      を保持・出力しない (PresenceMode はこれに該当しない、PII ではない)。
 *   5. LLM call 0 (rule-based only)。
 *   6. Date.now / Math.random に依存しない。timestamp は caller-provided observedAt。
 *   7. deterministic test 可能。
 *   8. relationship state は production source of truth ではなく、observer 用の
 *      temporary / process-local / ephemeral state (production 正本は既存 sharedState)。
 *   9. runtime-unwired (本 module は Phase A-1b 段階でも依然どこからも呼ばれない)。
 *  10. 既存 presence layer (lib/coalter/presence/ 30+ files, app/components/chat/
 *      17 files) を一切 touch しない。
 *
 * 既存型との関係:
 *   - `lib/coalter/types.ts` の `CoAlterMode` (decision/negotiate/clarify/reflect) は
 *     LLM router 内部用、本 module とは無関係 (CEO Vision の mode UX とは別概念)。
 *   - `lib/coalter/presence/types.ts` の `PresenceMode` (normal/daily/travel) と
 *     `ExecutorAvailability` (disabled/inactive/pending_consent/enabled/active) を
 *     本 module で **import して使う** (Phase A-1b で型整合済)。
 */

import type {
  ExecutorAvailability,
  PresenceMode,
} from "../presence/types";

// ─────────────────────────────────────────────
// Schema version
// ─────────────────────────────────────────────

/**
 * Container schema version。後方互換管理用。
 *
 * - v1: A-1 初版 (独自 ModeContext / ObserverActivationState)
 * - v2: A-1b PresenceMode alignment (PresenceMode | null / ExecutorAvailability)
 */
export const RELATIONSHIP_STATE_SCHEMA_VERSION = 2 as const;

export type RelationshipStateSchemaVersion =
  typeof RELATIONSHIP_STATE_SCHEMA_VERSION;

// ─────────────────────────────────────────────
// Key types
// ─────────────────────────────────────────────

/**
 * Internal pair state key。`pairStateId` をそのまま使うが、external payload には
 * 絶対に出さない。external 向けは `RedactedRelationshipKey` を使う。
 */
export type InternalPairStateKey = string;

/**
 * External-safe key。`computeRedactedRelationshipKey(internalKey, salt)` で生成される
 * sha256 派生値。reverse 不可。external snapshot / diagnostics / UI で使ってよい。
 */
export type RedactedRelationshipKey = string;

// ─────────────────────────────────────────────
// Caller-provided timestamp
// ─────────────────────────────────────────────

/**
 * Caller-provided ISO 8601 timestamp。container 内で Date.now を呼ばない (deterministic
 * test 可能性のため)。
 */
export type ObservedAtIso = string;

// ─────────────────────────────────────────────
// Conversation phase (observer 独自 abstraction、presence S0-S8 とは別 layer)
// ─────────────────────────────────────────────

/**
 * 会話 phase 推論結果 (Speak Decision Engine 用、Phase A は推論 only)。
 *
 * 既存 `PresenceState` (S0-S8) は state machine の runtime status。
 * 本 `ConversationPhase` は observer layer の独自 abstraction (時系列を超えた phase 推論)。
 * 両者は別 layer の概念として並走可。
 */
export type ConversationPhase =
  | "unknown"
  | "opening"
  | "exploring"
  | "converging"
  | "closing";

// ─────────────────────────────────────────────
// Bucket types (PII firewall)
// ─────────────────────────────────────────────

/**
 * 両者の方向一致度 bucket (-1〜+1 を bucket 化)。
 * 連続値ではなく bucket 化することで、observation の細かい数値が external に漏れない
 * (A2 buffer 規約と一致)。
 */
export type AlignmentBucket =
  | "unknown"
  | "strongly_negative"
  | "negative"
  | "neutral"
  | "positive"
  | "strongly_positive";

/** uncertainty bucket (0〜1 を 3 段階)。 */
export type UncertaintyBucket =
  | "unknown"
  | "low_0_to_30"
  | "mid_30_to_70"
  | "high_70_to_100";

/** silence budget bucket (0〜1 を 3 段階)。 */
export type SilenceBudgetBucket =
  | "unknown"
  | "low_0_to_30"
  | "mid_30_to_70"
  | "high_70_to_100";

// ─────────────────────────────────────────────
// Reason codes
// ─────────────────────────────────────────────

/**
 * State 変更の理由を表す固定 enum。free text を許可しない (PII 流入防止)。
 *
 * Phase A-1b 変更:
 *   - 削除: mode_changed_to_unknown / mode_changed_to_off / mode_changed_to_on
 *     (旧 ModeContext 専用)
 *   - 追加: mode_changed_to_normal / mode_changed_to_daily / mode_changed_to_travel
 *     (PresenceMode 値整合)
 *   - 追加: mode_signal_received / mode_signal_cleared (null ↔ PresenceMode 切替)
 *
 * 新規 reason 追加は本 union への追記で対応 (Phase B+)。
 */
export type ReasonCode =
  | "state_initialized"
  | "observation_recorded"
  | "alignment_shift_detected"
  | "rupture_detected"
  | "rupture_cleared"
  | "phase_inferred"
  | "silence_budget_replenished"
  | "silence_budget_consumed"
  | "mode_changed_to_normal"
  | "mode_changed_to_daily"
  | "mode_changed_to_travel"
  | "mode_signal_received"
  | "mode_signal_cleared"
  | "observer_availability_changed"
  | "uncertainty_shift_detected"
  | "container_reset";

// ─────────────────────────────────────────────
// Internal state (process-local only)
// ─────────────────────────────────────────────

/**
 * Internal relationship state。process-local。
 *
 * **絶対 external に返さない**。external 向けは `RedactedRelationshipStateSnapshot`
 * を使う。
 *
 * 全 field `readonly` (immutable snapshot)。更新は新規 object 作成で対応。
 *
 * Phase A-1b 変更:
 *   - modeContext: `ModeContext` → `PresenceMode | null`
 *     null = mode signal 未受領 (旧 "unknown" 相当)
 *   - observerActivationState: `ObserverActivationState` → `ExecutorAvailability`
 */
export interface InternalRelationshipState {
  /** Schema version (immutable)。 */
  readonly schemaVersion: RelationshipStateSchemaVersion;
  /** Internal pairStateId。**external payload に絶対出さない**。 */
  readonly internalKey: InternalPairStateKey;
  /** Monotonic state revision (update 毎に +1)。 */
  readonly stateVersion: number;
  /** observation 記録回数。 */
  readonly observationCount: number;
  /** Caller-provided ISO timestamp of last observation. null if未観測。 */
  readonly lastObservationAt: ObservedAtIso | null;
  /**
   * Observer pipeline の起動状態 (既存 ExecutorAvailability 整合)。
   * disabled / inactive / pending_consent / enabled / active の 5 段階。
   */
  readonly observerActivationState: ExecutorAvailability;
  /**
   * CoAlter activation mode (既存 PresenceMode 整合)。
   * normal / daily / travel の 3 値、または null (signal 未受領)。
   */
  readonly modeContext: PresenceMode | null;
  /** 推論された会話 phase (observer 独自、PresenceState S0-S8 とは別)。 */
  readonly conversationPhase: ConversationPhase;
  /** 両者の方向一致度 bucket。 */
  readonly alignmentBucket: AlignmentBucket;
  /** rupture フラグ (HDM-style)。 */
  readonly ruptureFlag: boolean;
  /** uncertainty bucket。 */
  readonly uncertaintyBucket: UncertaintyBucket;
  /** silence budget bucket。 */
  readonly silenceBudgetBucket: SilenceBudgetBucket;
  /** append-only reason codes (latest N kept, FIFO drop oldest)。 */
  readonly reasonCodes: ReadonlyArray<ReasonCode>;
}

// ─────────────────────────────────────────────
// External-safe snapshot (PII firewall 通過後)
// ─────────────────────────────────────────────

/**
 * External-safe relationship state snapshot。
 *
 * `internalKey` (pairStateId) を含まず、代わりに `redactedRelationshipKey` を含む。
 *
 * A4 retrieval / diagnostics / UI で出してよい (PII 不在保証)。
 *
 * 全 field `readonly` (defensive copy 推奨)。
 *
 * Phase A-1b 変更:
 *   - modeContext / observerActivationState を InternalRelationshipState と同じ型に整合
 *   - PresenceMode は PII ではない (CEO/GPT 判断 2026-05-16 B3 NO)、snapshot にそのまま含めてよい
 */
export interface RedactedRelationshipStateSnapshot {
  readonly schemaVersion: RelationshipStateSchemaVersion;
  /** sha256 派生 key。raw pairStateId は含まない。 */
  readonly redactedRelationshipKey: RedactedRelationshipKey;
  readonly stateVersion: number;
  readonly observationCount: number;
  readonly lastObservationAt: ObservedAtIso | null;
  readonly observerActivationState: ExecutorAvailability;
  readonly modeContext: PresenceMode | null;
  readonly conversationPhase: ConversationPhase;
  readonly alignmentBucket: AlignmentBucket;
  readonly ruptureFlag: boolean;
  readonly uncertaintyBucket: UncertaintyBucket;
  readonly silenceBudgetBucket: SilenceBudgetBucket;
  readonly reasonCodes: ReadonlyArray<ReasonCode>;
}

// ─────────────────────────────────────────────
// Update patch
// ─────────────────────────────────────────────

/**
 * State update patch。
 *
 * 制約:
 *   - raw text / utterance / userId / pairId / threadId / email / URL を含まない
 *     (型レベル firewall)
 *   - observedAt は caller-provided (container 内で Date.now しない)
 *   - recordingObservation が true の時のみ observationCount / lastObservationAt 更新
 *
 * Phase A-1b 変更:
 *   - modeContext / observerActivationState の型を整合
 */
export interface RelationshipStatePatch {
  /** observer 起動状態の変更 (ExecutorAvailability 整合)。 */
  observerActivationState?: ExecutorAvailability;
  /** mode context の変更 (PresenceMode 整合、null で clear)。 */
  modeContext?: PresenceMode | null;
  /** 推論 phase の更新。 */
  conversationPhase?: ConversationPhase;
  /** 一致度 bucket の更新。 */
  alignmentBucket?: AlignmentBucket;
  /** rupture フラグの更新。 */
  ruptureFlag?: boolean;
  /** uncertainty bucket の更新。 */
  uncertaintyBucket?: UncertaintyBucket;
  /** silence budget bucket の更新。 */
  silenceBudgetBucket?: SilenceBudgetBucket;
  /** observation 時刻 (caller-provided)。recordingObservation=true 時のみ反映。 */
  observedAt?: ObservedAtIso;
  /** true なら observationCount を +1 し lastObservationAt を更新。 */
  recordingObservation?: boolean;
  /** append する reason codes (FIFO drop)。 */
  newReasonCodes?: ReadonlyArray<ReasonCode>;
}
