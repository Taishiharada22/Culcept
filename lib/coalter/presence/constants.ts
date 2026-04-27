/**
 * CoAlter Stage 2 — Presence executor 定数 (L2-a)
 *
 * 正本:
 *   - UI spec §7.12 Pattern → State 許可マトリクス (positive allow gate、Two-Stage Gating §7 側)
 *   - UI spec §6.7 再介入条件サマリ (cooldown 種類)
 *   - UI spec §1.6 連投抑制 / Core UX v1.1 §8.6 (5 分再起動)
 *   - runtime §1.2 強度階層
 *
 * 配置: `lib/coalter/presence/`。types.ts の値版 (runtime 定数)。
 *
 * Two-Stage Gating (UI spec §7.12 / §4 二章正本):
 *   - Stage 1 (positive allow): 本ファイルの PATTERN_STATE_ALLOWED が ✓
 *   - Stage 2 (negative override): mode 別マトリクス §4.3 で抑制 / 優先度低下されない
 *   - 最終可否 = Stage 1 AND Stage 2
 *
 * 本ファイルは Stage 1 (existence gate) のみ正本化する。Stage 2 の suppression は
 * mode 別マトリクスとして L2-d patternSelector / L2-h modeReducer で扱う。
 */

import {
  PATTERN_VARIANTS,
  PRESENCE_STATES,
  type PatternVariant,
  type PresenceState,
} from "./types";

// ─────────────────────────────────────────────
// Pattern → State 許可マトリクス (UI spec §7.12)
// ─────────────────────────────────────────────

/**
 * 9 state × 7 variant = 63 セル。✓ = 存在許可、— = 不許可。
 *
 * UI spec §7.12 表の構造的写像:
 *   - A 入口発話        → S2 のみ
 *   - B 状況言語化      → S5 のみ
 *   - C 確認質問        → S2, S5
 *   - D 片側フォーカス  → S5 のみ
 *   - E 橋渡し          → S5 のみ
 *   - F1 関係提案       → S7 のみ
 *   - F2 生活提案       → S7 のみ
 *
 * 補足 (UI spec §7.12):
 *   - S0 / S1 / S3 / S4 / S6 / S8 は発話パターンなし (v1.1 §8.2)
 *   - S1 status chip は「発話パターン」ではなく介入気配 UI、本マトリクス対象外
 *   - S7 に F1 / F2 両方 ✓ だが同一ターンでは 1 つのみ発火 (合成時は F2 主 + F1 副次 = 1 カード)
 *   - D の S5 許可は Travel mode で既定優先度低下 (§4.3.6、Stage 2 = suppression gate 側)
 */
export const PATTERN_STATE_ALLOWED: Readonly<
  Record<PatternVariant, Readonly<Record<PresenceState, boolean>>>
> = {
  A: {
    S0: false,
    S1: false,
    S2: true,
    S3: false,
    S4: false,
    S5: false,
    S6: false,
    S7: false,
    S8: false,
  },
  B: {
    S0: false,
    S1: false,
    S2: false,
    S3: false,
    S4: false,
    S5: true,
    S6: false,
    S7: false,
    S8: false,
  },
  C: {
    S0: false,
    S1: false,
    S2: true,
    S3: false,
    S4: false,
    S5: true,
    S6: false,
    S7: false,
    S8: false,
  },
  D: {
    S0: false,
    S1: false,
    S2: false,
    S3: false,
    S4: false,
    S5: true,
    S6: false,
    S7: false,
    S8: false,
  },
  E: {
    S0: false,
    S1: false,
    S2: false,
    S3: false,
    S4: false,
    S5: true,
    S6: false,
    S7: false,
    S8: false,
  },
  F1: {
    S0: false,
    S1: false,
    S2: false,
    S3: false,
    S4: false,
    S5: false,
    S6: false,
    S7: true,
    S8: false,
  },
  F2: {
    S0: false,
    S1: false,
    S2: false,
    S3: false,
    S4: false,
    S5: false,
    S6: false,
    S7: true,
    S8: false,
  },
};

/**
 * Stage 1 (existence gate) の allow チェック。
 *
 * Stage 2 (mode 別 suppression) は patternSelector (L2-d) で適用する。
 * 本関数は §7.12 positive allow のみを返す。
 */
export function isPatternStateAllowed(
  variant: PatternVariant,
  state: PresenceState,
): boolean {
  return PATTERN_STATE_ALLOWED[variant][state];
}

/**
 * 与えられた state で許可される pattern variant 一覧 (§7.12)。
 *
 * 例: getAllowedPatterns("S2") = ["A", "C"]
 *      getAllowedPatterns("S5") = ["B", "C", "D", "E"]
 *      getAllowedPatterns("S7") = ["F1", "F2"]
 *      getAllowedPatterns("S0") = []
 */
export function getAllowedPatterns(
  state: PresenceState,
): ReadonlyArray<PatternVariant> {
  return PATTERN_VARIANTS.filter((v) => PATTERN_STATE_ALLOWED[v][state]);
}

// ─────────────────────────────────────────────
// Cooldown 種類 (UI spec §6.7 再介入条件サマリ)
// ─────────────────────────────────────────────

/**
 * Cooldown 種類。L2-j 拒否 3 分類 reducer + Core UX v1.1 §8.6 5 分再起動 で消費。
 *
 * - mode_escalation_rejected   : §6.6.1 モード昇格拒否、当該セッション内で自動昇格再試行禁止
 * - individual_proposal_rejected : §6.6.2 個別提案拒否、同内容を短期再提示しない
 * - intervention_retreat       : §6.6.3 介入後退要求、指定期間 S0 → S1 自動遷移完全停止
 * - recent_proposal_5min       : v1.1 §8.6 / UI spec §1.6、5 分再起動禁止 (同セッション)
 */
export const COOLDOWN_KINDS = [
  "mode_escalation_rejected",
  "individual_proposal_rejected",
  "intervention_retreat",
  "recent_proposal_5min",
] as const;

export type CooldownKind = (typeof COOLDOWN_KINDS)[number];

/**
 * 各 cooldown の概略持続時間 (ms)。具体閾値は UI spec §9 保留論点。
 * 本定数は実装側 default。CEO 別審議で上書き可能 (環境変数 / DB 設定)。
 */
export const COOLDOWN_DEFAULT_DURATION_MS: Record<CooldownKind, number> = {
  // §6.6.1: 「当該セッション終了まで」→ session 単位で expiry 扱い、ms は安全大値
  mode_escalation_rejected: 24 * 60 * 60 * 1000, // 24h (session 上限)
  // §6.6.2: 「短期的には再提示しない」→ §9 保留、安全大値
  individual_proposal_rejected: 60 * 60 * 1000, // 1h
  // §6.6.3: 「指定期間」例 24h、§9 保留
  intervention_retreat: 24 * 60 * 60 * 1000, // 24h (例値)
  // v1.1 §8.6 / UI spec §1.6: 5 分
  recent_proposal_5min: 5 * 60 * 1000,
};

// ─────────────────────────────────────────────
// 状態内 pattern 選択優先順 (UI spec §7.12 fallback ロジック)
// ─────────────────────────────────────────────

/**
 * 複数 pattern が許可されている state での選択優先順 (§7.12)。
 *
 * Two-Stage Gating 通過後、複数候補がある時の fallback。本書では順序のみ正本化、
 * 具体的選択ロジック (情報欠落判定 / 不確実性スコア等) は patternSelector (L2-d) 側。
 */
export const STATE_PATTERN_PRIORITY: Readonly<
  Partial<Record<PresenceState, ReadonlyArray<PatternVariant>>>
> = {
  // §7.12: 1. A default / 2. C — 安全な介入に必要な情報が欠けている場合のみ
  S2: ["A", "C"],
  // §7.12: 1. C / 2. B / 3. D / 4. E (不確実性下では確認先行、§11.1 裁判官化リスク回避)
  S5: ["C", "B", "D", "E"],
  // §7.12: 1. F2 (Daily/Travel default) / 2. F1 standalone (通常モード S7 のみ)
  // F1 副次 (Daily/Travel §7.10 合成) は patternSelector 側で扱う
  S7: ["F2", "F1"],
};

// ─────────────────────────────────────────────
// Signal kind → strength の default mapping (runtime §1.2)
// ─────────────────────────────────────────────

import type { SignalKind, SignalStrength } from "./types";

/**
 * runtime §1.2 強度階層の default 写像。
 *
 * implicit のみ soft、それ以外は strong。
 * adapter (L2-b) で signal 投入時に明示的に上書き可能だが、default はこれに従う。
 */
export const SIGNAL_KIND_DEFAULT_STRENGTH: Record<SignalKind, SignalStrength> = {
  explicit: "strong",
  implicit: "soft",
  critical: "strong",
  mode_promotion: "strong",
  manual_restart: "strong",
};

// ─────────────────────────────────────────────
// 全 state, mode, pattern の網羅性 helper (test 用)
// ─────────────────────────────────────────────

/**
 * 9 × 7 = 63 セル全列挙 (test 網羅性 / debug 用)。
 */
export function* iteratePatternStateCells(): Generator<{
  variant: PatternVariant;
  state: PresenceState;
  allowed: boolean;
}> {
  for (const variant of PATTERN_VARIANTS) {
    for (const state of PRESENCE_STATES) {
      yield { variant, state, allowed: PATTERN_STATE_ALLOWED[variant][state] };
    }
  }
}
