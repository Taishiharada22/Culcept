/**
 * CoAlter Always-On Observer — Relationship State Types (Phase A-1)
 *
 * 正本: docs/coalter-always-on-observer-design.md §3 Layer 3, §4 Phase A-1
 *       docs/coalter-aoo-phase-a0-mode-state-audit.md §1.10
 *
 * 役割:
 *   Relationship State Container の型定義。runtime-unwired。
 *
 * CRITICAL 設計原則（CEO/GPT 補正 2026-05-16 反映）:
 *   1. 本モジュールは "pure module" ではなく "self-contained in-memory state
 *      container" の型定義。container 自体は stateful（module-level Map を持つ）
 *      が、本ファイルは型のみ。
 *   2. raw `pairStateId` は internal key only。external snapshot に出さない。
 *   3. external 出力時は `redactedRelationshipKey` (sha256 派生) を使う。
 *   4. raw `userId` / `pairId` / `threadId` / `email` / URL / message text / utterance
 *      を保持・出力しない。
 *   5. LLM call 0 (rule-based only)。
 *   6. Date.now / Math.random に依存しない。timestamp は caller-provided observedAt。
 *   7. deterministic test 可能。
 *   8. modeContext は Phase A では off/on/unknown のみ。Phase B+ で normal/daily/travel
 *      を union 追加で拡張可能（既存 value 削除なし＝non-breaking）。
 *   9. relationship state は production source of truth ではなく、observer 用の
 *      temporary / process-local / ephemeral state。
 *  10. runtime-unwired (本 module は Phase A-1 段階ではどこからも呼ばれない)。
 *
 * 既存型との関係:
 *   - `lib/coalter/types.ts` の `CoAlterMode` (decision/negotiate/clarify/reflect) は
 *     LLM router 内部用。本 module の `ModeContext` (off/on/unknown) は UX activation
 *     mode。完全に別概念（CEO Vision の "通常/Daily/Travel" は ModeContext の Phase B+
 *     拡張に対応）。
 */

// ─────────────────────────────────────────────
// Schema version
// ─────────────────────────────────────────────

/** Container schema version。後方互換管理用。 */
export const RELATIONSHIP_STATE_SCHEMA_VERSION = 1 as const;

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
// Mode context (CEO Vision)
// ─────────────────────────────────────────────

/**
 * CoAlter activation mode context。
 *
 * Phase A: `unknown` / `off` / `on` のみ。
 * Phase B+: 必要に応じて `normal` / `daily` / `travel` を union 追加（既存 value 削除
 *           なし＝non-breaking）。
 *
 * 既存 CoAlterMode (lib/coalter/types.ts:87) は LLM router 内部 mode で本 type とは
 * 完全に別概念。
 *
 * 設計判断:
 *   - `unknown` は mode signal 未受領状態 (mode UI 未確認 / observer hook 未配線時)
 *   - `off` は明示的に CoAlter 観測停止
 *   - `on` は mode ON だが sub-mode 不確定 (Phase A の暫定値)
 *   - 将来 `normal` / `daily` / `travel` を追加: type union 拡張のみで対応
 */
export type ModeContext =
  | "unknown"
  | "off"
  | "on";
// Phase B+ で追加予定 (CEO Vision):
//   | "normal"
//   | "daily"
//   | "travel"

// ─────────────────────────────────────────────
// Observer activation state
// ─────────────────────────────────────────────

/** observer pipeline の起動状態 (mode とは独立)。 */
export type ObserverActivationState =
  | "unknown"
  | "active"
  | "inactive"
  | "suspended";

// ─────────────────────────────────────────────
// Conversation phase
// ─────────────────────────────────────────────

/** 会話 phase 推論結果 (Speak Decision Engine 用、Phase A は推論 only)。 */
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
  | "mode_changed_to_unknown"
  | "mode_changed_to_off"
  | "mode_changed_to_on"
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
  /** observer pipeline の起動状態。 */
  readonly observerActivationState: ObserverActivationState;
  /** CoAlter activation mode (Phase A: off/on/unknown)。 */
  readonly modeContext: ModeContext;
  /** 推論された会話 phase。 */
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
 */
export interface RedactedRelationshipStateSnapshot {
  readonly schemaVersion: RelationshipStateSchemaVersion;
  /** sha256 派生 key。raw pairStateId は含まない。 */
  readonly redactedRelationshipKey: RedactedRelationshipKey;
  readonly stateVersion: number;
  readonly observationCount: number;
  readonly lastObservationAt: ObservedAtIso | null;
  readonly observerActivationState: ObserverActivationState;
  readonly modeContext: ModeContext;
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
 */
export interface RelationshipStatePatch {
  /** observer 起動状態の変更。 */
  observerActivationState?: ObserverActivationState;
  /** mode context の変更。 */
  modeContext?: ModeContext;
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
