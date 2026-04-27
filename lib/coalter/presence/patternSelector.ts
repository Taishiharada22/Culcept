/**
 * CoAlter Stage 2 — patternSelector (L2-d)
 *
 * 正本:
 *   - UI spec §7.12 Pattern → State 許可マトリクス (Two-Stage Gating §7 側正本)
 *   - UI spec §4.3 mode 別 suppression (Two-Stage Gating §4 側正本)
 *   - UI spec §7.10 F-1 / F-2 共存規則
 *   - UI spec §7.11 非同居規則
 *   - speech template §3-§9 文面テンプレート (本 phase は selector のみ、文面は L2-m)
 *
 * Two-Stage Gating:
 *   1. Stage 1 — §7.12 existence gate (constants.ts PATTERN_STATE_ALLOWED)
 *   2. Stage 2 — §4.3 mode 別 suppression (本 selector で適用)
 *
 * 最終可否 = Stage 1 AND Stage 2。
 *
 * 責務:
 *   - selectPattern: 状態 × mode × context → primary variant 1 つ (or null)
 *   - selectSecondaryPattern: §7.10 合成規則下の F-1 副次 (S7 Daily/Travel)
 *
 * 非責務 (他 phase):
 *   - 文面 LLM 合成 → L2-m speechBuilder
 *   - 連投抑制 / 同パターン連投禁止 → L2-l rate limit
 *   - 緊急介入時の chip 削減 → L2-k urgent
 */

import {
  PATTERN_STATE_ALLOWED,
  STATE_PATTERN_PRIORITY,
} from "./constants";
import type {
  PatternVariant,
  PresenceMode,
  PresenceState,
} from "./types";

// ─────────────────────────────────────────────
// 文脈入力 (実装側から渡す観測値、本書では型のみ正本化)
// ─────────────────────────────────────────────

/**
 * Pattern 選択時の context。
 *
 * 実装側 (executor watcher) で観測した値を渡す。閾値判定はここで完結し、
 * 本 selector は受け取った boolean をそのまま使う。
 */
export interface PatternContext {
  /** S2 で安全な介入に必要な情報が欠けているか (true → C 優先、§7.12 fallback) */
  infoMissing?: boolean;
  /** S5 で不確実性が介入の有効性を阻害しているか (true → C 優先、§7.12 / §11.1 裁判官化リスク回避) */
  uncertaintyHigh?: boolean;
  /** S5 で関係全体の可視化が先に必要か (B 候補) */
  needFraming?: boolean;
  /** S5 で片側の揺れ・疲労が主か (D 候補) */
  oneSidedFatigue?: boolean;
  /** S5 で両者間翻訳が必要か (E 候補) */
  needTranslation?: boolean;
  /**
   * Travel mode で関係シグナル (温度差 / 認識差 / 片側の引っかかり) が明確か。
   * true → §4.3.6 D 既定優先度低下を解除し、D を再昇格 (§9.3.3 保留論点の hook)
   */
  relationshipSignalsClear?: boolean;
  /**
   * S7 Daily で関係ノイズが高いか。
   * true → F-1 副次同伴 1 行を併設 (§4.3.8 / §7.10)
   * false → F-1 副次抑制可
   */
  relationshipNoiseHigh?: boolean;
}

// ─────────────────────────────────────────────
// Primary selector
// ─────────────────────────────────────────────

/**
 * Two-Stage Gating を通過する primary variant を返す。
 *
 * - Stage 1: §7.12 で許可されている variant のみが候補
 * - Stage 2: §4.3 mode 別 suppression で除外された variant を弾く
 * - state 内の優先順位 (§7.12 fallback) で 1 つ選ぶ
 *
 * 該当する variant がない (S0/S1/S3/S4/S6/S8 等) → null。
 */
export function selectPattern(
  state: PresenceState,
  mode: PresenceMode,
  context: PatternContext = {},
): PatternVariant | null {
  const priorities = STATE_PATTERN_PRIORITY[state];
  if (!priorities || priorities.length === 0) {
    // 発話パターンを持たない state (v1.1 §8.2)
    return null;
  }

  // state 内優先順を使い、Stage 2 suppression を弾きながら最初の候補を返す
  for (const variant of priorities) {
    if (!isAllowedAtStage1(variant, state)) continue;
    if (isSuppressedAtStage2(variant, state, mode, context)) continue;
    if (!matchesContextPriority(variant, state, mode, context)) continue;
    return variant;
  }

  // 全候補 suppression された場合 (例: S5 Travel で D 候補のみ残り、relationshipSignalsClear=false)
  // → §4.3 で全 suppression なら null
  return null;
}

// ─────────────────────────────────────────────
// Secondary (F-1 副次同伴、§7.10)
// ─────────────────────────────────────────────

/**
 * §7.10 合成規則下の F-1 副次同伴 variant を返す。
 *
 * 発動条件:
 *   - state = S7
 *   - primary = F2 (生活提案が主)
 *   - mode = Daily で context.relationshipNoiseHigh = true、または mode = Travel (常時)
 *
 * 副次同伴は提案カード内の最終行 1 行として収容 (独立カード化禁止、§7.10)。
 * 本 selector は variant を返すだけで、レイアウトは UI 側で適用する。
 *
 * 通常モード S7 では F-1 standalone のみで副次同伴は発動しない (null を返す)。
 */
export function selectSecondaryPattern(
  state: PresenceState,
  mode: PresenceMode,
  primary: PatternVariant | null,
  context: PatternContext = {},
): PatternVariant | null {
  if (state !== "S7") return null;
  if (primary !== "F2") return null;
  if (mode === "normal") return null;
  if (mode === "daily") {
    return context.relationshipNoiseHigh === true ? "F1" : null;
  }
  // mode === "travel": §7.10 / §4.3.8 Travel 「副次同伴必須」
  return "F1";
}

// ─────────────────────────────────────────────
// 内部 helper (Stage 1 / Stage 2 / 優先順位フィルタ)
// ─────────────────────────────────────────────

function isAllowedAtStage1(
  variant: PatternVariant,
  state: PresenceState,
): boolean {
  return PATTERN_STATE_ALLOWED[variant][state];
}

/**
 * Stage 2 mode 別 suppression (§4.3)。
 *
 * 現時点で正本化されている mode 別 override:
 *   - S5 + Travel + D: 既定優先度低下 (§4.3.6)。relationshipSignalsClear=true で再昇格
 *   - S7 + Daily + F1 (standalone): 関係ノイズ低時抑制可。本 selector では primary として
 *     F1 を返さない (S7 Daily の primary は F2 default)
 *   - S7 + Travel + F1 (standalone): primary としては抑制 (Travel は F2 主 + F1 副次)
 *
 * 本関数が true を返す = この variant は Stage 2 で抑制 (primary 候補から除外)。
 */
function isSuppressedAtStage2(
  variant: PatternVariant,
  state: PresenceState,
  mode: PresenceMode,
  context: PatternContext,
): boolean {
  // S5 + Travel + D: relationshipSignalsClear=false なら抑制
  if (state === "S5" && mode === "travel" && variant === "D") {
    return context.relationshipSignalsClear !== true;
  }
  // S7 + Daily + F1 (standalone): F2 を default にする (§4.3.8 Daily override)
  if (state === "S7" && mode === "daily" && variant === "F1") {
    return true;
  }
  // S7 + Travel + F1 (standalone): primary としては抑制 (副次は selectSecondaryPattern 経由)
  if (state === "S7" && mode === "travel" && variant === "F1") {
    return true;
  }
  return false;
}

/**
 * Context 依存の選択優先順位フィルタ (§7.12 fallback ロジック)。
 *
 * - S2: A default / C は infoMissing=true 時のみ
 * - S5: C は uncertaintyHigh=true 時のみ / B は needFraming=true 時のみ /
 *       D は oneSidedFatigue=true 時のみ / E は needTranslation=true 時のみ
 * - S7: F2 default / F1 standalone (normal のみ)
 */
function matchesContextPriority(
  variant: PatternVariant,
  state: PresenceState,
  mode: PresenceMode,
  context: PatternContext,
): boolean {
  if (state === "S2") {
    // §7.12: A default、C は infoMissing=true 時のみ。
    // A は infoMissing=true の時 C に譲る (C 優先で fallback ロジック反転)。
    if (variant === "A") return context.infoMissing !== true;
    if (variant === "C") return context.infoMissing === true;
  }
  if (state === "S5") {
    if (variant === "C") return context.uncertaintyHigh === true;
    if (variant === "B") return context.needFraming === true;
    if (variant === "D") return context.oneSidedFatigue === true;
    if (variant === "E") return context.needTranslation === true;
    return false;
  }
  if (state === "S7") {
    if (variant === "F2") return true; // default
    if (variant === "F1") return mode === "normal"; // standalone は通常モードのみ
  }
  return true;
}
