/**
 * CoAlter Stage 2 — Presence executor 型定義 (L2-a)
 *
 * 正本:
 *   - Core UX v1.1 §8 (S0-S8 状態) / §2 (3 Presence Mode)
 *   - UI spec §7 (Pattern A-F2 / family6 vs variant7)
 *   - runtime contract §1.1 (signal 5 分類) / §1.2 (強度 3 段階)
 *   - 統合契約 §4.2 (family6/variant7 / hyphen 表記の境界)
 *
 * 配置: 新規サブディレクトリ `lib/coalter/presence/`。既存 `lib/coalter/**`
 * の他ファイルは非接触 (plan §0.4 不可侵)。
 *
 * 表記境界 (統合契約 §4.2):
 *   - 内部 type / DB / event bus  : "F1" / "F2" (no hyphen)
 *   - 外部表記 / UI label / docs  : "F-1" / "F-2" (hyphenated)
 *
 * 本ファイルは型のみ。runtime 値・logic は constants.ts / reducer.ts (L2-c) 以降で扱う。
 */

// ─────────────────────────────────────────────
// Presence State (S0-S8) — Core UX v1.1 §8.1
// ─────────────────────────────────────────────

/** Presence 9 状態 (Core UX v1.1 §8.1 / UI spec §5.3-5.11) */
export type PresenceState =
  | "S0" // 見守り (Observing)
  | "S1" // 介入気配 (Approaching)
  | "S2" // 入口発話 (Opening)
  | "S3" // 返答待ち (Awaiting)
  | "S4" // 理解更新中 (Understanding)
  | "S5" // 橋渡し中 (Bridging)
  | "S6" // 提案可能 (ReadyForProposal)
  | "S7" // 提案表示 (ProposalShown)
  | "S8"; // クールダウン (Cooldown)

/** 全状態の列挙 (網羅性 test / iteration 用) */
export const PRESENCE_STATES = [
  "S0",
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
] as const satisfies ReadonlyArray<PresenceState>;

// ─────────────────────────────────────────────
// Presence Mode (Core UX v1.1 §2.1)
// ─────────────────────────────────────────────

/**
 * 3 Presence Mode。通常モードが本体 (v1.1 §2.3)、Daily/Travel は昇格モード。
 */
export type PresenceMode = "normal" | "daily" | "travel";

export const PRESENCE_MODES = [
  "normal",
  "daily",
  "travel",
] as const satisfies ReadonlyArray<PresenceMode>;

// ─────────────────────────────────────────────
// Pattern (variant7 / family6) — UI spec §7 / 統合契約 §4.2
// ─────────────────────────────────────────────

/**
 * Pattern variant (7 種、UI spec §7.3-7.9)
 * - F1 / F2 は内部表記 (DB / event / type)
 * - 外部表記 (UI label / docs) では F-1 / F-2 を使う (統合契約 §4.2)
 */
export type PatternVariant = "A" | "B" | "C" | "D" | "E" | "F1" | "F2";

export const PATTERN_VARIANTS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F1",
  "F2",
] as const satisfies ReadonlyArray<PatternVariant>;

/**
 * Pattern family (6 種)。F1 / F2 は family F に collapse (統合契約 §4.2 family6 概念)
 */
export type PatternFamily = "A" | "B" | "C" | "D" | "E" | "F";

export const PATTERN_FAMILIES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
] as const satisfies ReadonlyArray<PatternFamily>;

/**
 * variant → family 変換 (F1, F2 → F、その他 → identity)
 *
 * 統合契約 §4.2: family は "提案"= F に集約、variant は提案内容 (関係 F1 / 生活 F2)
 * の差分を保持。allowance matrix / dispatch 振り分けは family と variant のどちらを
 * 見るかを文脈で使い分ける。
 */
export function toFamily(variant: PatternVariant): PatternFamily {
  if (variant === "F1" || variant === "F2") return "F";
  return variant;
}

// ─────────────────────────────────────────────
// Executor Availability (5 状態) — runtime §1.3 / 関連: 統合契約 §1.4
// ─────────────────────────────────────────────

/**
 * Executor 可用性。Presence と直交 (S0-S8 とは独立軸)。
 *
 * - disabled         : kill switch / flag OFF (L2-g、`COALTER_PRESENCE_ENABLED=false`)
 * - inactive         : 起動可能だが未起動
 * - pending_consent  : 同意取得待ち (S0 入る前のゲート)
 * - enabled          : 起動可能、まだ active 経路に入っていない
 * - active           : Presence reducer が動作している (S0-S8 のいずれか)
 *
 * Presence の 9 状態は active 内部の state machine。disabled/inactive/pending/enabled の
 * いずれの場合も Presence は何も発火しない。
 */
export type ExecutorAvailability =
  | "disabled"
  | "inactive"
  | "pending_consent"
  | "enabled"
  | "active";

export const EXECUTOR_AVAILABILITIES = [
  "disabled",
  "inactive",
  "pending_consent",
  "enabled",
  "active",
] as const satisfies ReadonlyArray<ExecutorAvailability>;

// ─────────────────────────────────────────────
// Signal (5 分類) — runtime §1.1 (網羅的、新種は本書 rev のみで追記)
// ─────────────────────────────────────────────

/**
 * Signal 分類 (runtime §1.1 不可侵、§1.7-1)。
 *
 * 本 5 分類は網羅的。実装が勝手に分類を増やすことを禁止。
 */
export type SignalKind =
  | "explicit"        // 明示: 自由テキスト / @coalter mention / chip tap / ボタン tap
  | "implicit"        // 暗黙: 2 人の会話から検出 (温度差 / 膠着 / 片側沈黙 / 共同課題)
  | "critical"        // 緊急: 高摩擦 / 攻撃性 / 感情ヒートアップ
  | "mode_promotion"  // モード昇格: Daily / Travel への明示要求
  | "manual_restart"; // 手動再起動: S8 cooldown 中の明示復帰

export const SIGNAL_KINDS = [
  "explicit",
  "implicit",
  "critical",
  "mode_promotion",
  "manual_restart",
] as const satisfies ReadonlyArray<SignalKind>;

/**
 * Signal 強度 (runtime §1.2、master §5 整合)。
 *
 * - strong : 即座に Presence を動かす確度の高い signal (明示 / モード昇格 / 手動再起動 / 緊急)
 * - soft   : 動いても良いが、介入価値閾値で要判定 (暗黙)
 * - none   : signal なし (S0 常駐維持)
 */
export type SignalStrength = "strong" | "soft" | "none";

export const SIGNAL_STRENGTHS = [
  "strong",
  "soft",
  "none",
] as const satisfies ReadonlyArray<SignalStrength>;

/**
 * Signal payload。L2-b signalAdapter / L2-c reducer dispatch で使う共通形。
 *
 * meta フィールドは signal 種別ごとの補助情報を持たせるため緩い型 (実装側で詳細化)。
 * adapter 側で必ず kind + strength を確定させる (runtime §1.7-2 不可侵: adapter 経由のみ)。
 */
export interface PresenceSignal {
  kind: SignalKind;
  strength: SignalStrength;
  /** 検出時刻 (ISO 8601 or epoch ms、reducer は順序判定に使用) */
  detectedAt: number;
  /** 任意 meta (例: 暗黙 score、明示 trigger ボタン id 等) */
  meta?: Readonly<Record<string, unknown>>;
}
