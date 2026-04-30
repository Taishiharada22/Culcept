/**
 * CoAlter Stage 2 — Urgent Trigger Logic (L2-k)
 *
 * 正本:
 *   - UI spec §8.5.1 緊急介入視覚層 責務 / §8.5.2 視覚形態 / §8.5.3 トーンと視覚言語
 *   - runtime contract §1.5 critical signal 短縮
 *   - HDM P3 rupture / P4 dignity / safety
 *
 * 責務:
 *   - critical signal + 文脈 → urgent layer 起動判定
 *   - 形態 (overlay_banner / dominant_card / inline_cue) の選択
 *   - memory surface 後退モード (demote / compact) の指示
 *
 * 非責務 (他 phase):
 *   - 緊急介入文面の生成 → speech template / L2-m
 *   - urgent layer の DOM 描画 → preview / production UI
 *   - dignity / rupture cooldown 設定 → 別 reducer (本 trigger は読み取りのみ)
 */

import type { PresenceSignal, PresenceState } from "./types";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

/**
 * Urgent layer の視覚形態 (§8.5.2)。
 */
export type UrgentForm = "overlay_banner" | "dominant_card" | "inline_cue";

/**
 * Urgent カテゴリ (検出理由ラベル)。HDM Wall + safety 構造。
 */
export type UrgentCategory =
  | "rupture_detected"
  | "dignity_violation"
  | "safety_concern"
  | "heat_escalation"
  | "asymmetric_overload";

/**
 * Memory surface 後退モード (§8.6.2)。
 *
 * - demote  : 背景化 (透明度低下、彩度低下、位置はそのまま)。
 *             条件: overlay_banner のみ + memory panel と非競合 + 短時間 (<10s)
 * - compact : サイズ縮小 (panel → badge 化)。
 *             条件: dominant_card or 長時間 (>=10s) or panel 競合
 */
export type MemoryFallback = "demote" | "compact";

/**
 * Trigger 判定の入力。
 */
export interface UrgentTriggerInput {
  /** signalAdapter L2-b で生成された PresenceSignal */
  signal: PresenceSignal;
  /** 現 Presence state */
  presenceState: PresenceState;
  /** dignity cooldown が active か */
  dignityActive?: boolean;
  /** rupture cooldown が active か */
  ruptureActive?: boolean;
  /** 推定される urgent 表示時間 (ms)、未指定なら短時間扱い */
  expectedDurationMs?: number;
  /** memory surface が現在 panel として大きく出ているか (空間的競合判定) */
  memoryPanelOpen?: boolean;
}

/**
 * Trigger 判定結果。null = urgent 起動しない。
 */
export interface UrgentDecision {
  category: UrgentCategory;
  form: UrgentForm;
  memoryFallback: MemoryFallback;
  reason: string;
}

// ─────────────────────────────────────────────
// 形態判定 (§8.5.2)
// ─────────────────────────────────────────────

/**
 * カテゴリ → 既定形態。各カテゴリの典型 UI 強度と整合。
 *
 * - rupture / dignity / safety  : dominant_card (中央上部、発話 surface 主役)
 * - heat_escalation             : overlay_banner (薄いバンド)
 * - asymmetric_overload         : inline_cue (弱キュー、まだ切替前)
 */
function selectForm(category: UrgentCategory): UrgentForm {
  switch (category) {
    case "rupture_detected":
    case "dignity_violation":
    case "safety_concern":
      return "dominant_card";
    case "heat_escalation":
      return "overlay_banner";
    case "asymmetric_overload":
      return "inline_cue";
  }
}

/**
 * §8.6.2 demote vs compact 使い分け。
 *
 * 判断基準:
 *   - 空間競合 (memoryPanelOpen + dominant_card)        → compact
 *   - 表示時間長 (>=10s)                                  → compact
 *   - 短時間 + 非競合 (overlay_banner / inline_cue)      → demote
 */
function selectMemoryFallback(
  form: UrgentForm,
  input: UrgentTriggerInput,
): MemoryFallback {
  // 空間競合: dominant_card は memory panel と物理的に重なる可能性が高い
  if (form === "dominant_card" && input.memoryPanelOpen) return "compact";
  // 表示時間長
  if ((input.expectedDurationMs ?? 0) >= 10_000) return "compact";
  // 短時間 + 非競合
  return "demote";
}

// ─────────────────────────────────────────────
// カテゴリ判定 (signal 検出理由から推定)
// ─────────────────────────────────────────────

/**
 * meta.trigger からカテゴリを推定。adapter (L2-b adaptCritical) が trigger 名を
 * meta に格納している前提で逆引き。
 */
function inferCategory(input: UrgentTriggerInput): UrgentCategory | null {
  // 状態 ベース: dignity / rupture cooldown が active なら最優先で検出
  if (input.dignityActive) return "dignity_violation";
  if (input.ruptureActive) return "rupture_detected";

  // signal がそもそも critical でないなら判定対象外
  if (input.signal.kind !== "critical") return null;

  const trigger = input.signal.meta?.trigger;
  if (typeof trigger !== "string") return "heat_escalation"; // default

  if (trigger.includes("rupture")) return "rupture_detected";
  if (trigger.includes("dignity")) return "dignity_violation";
  if (trigger.includes("safety")) return "safety_concern";
  if (trigger.includes("heat")) return "heat_escalation";
  if (trigger.includes("asymmetric") || trigger.includes("overload")) {
    return "asymmetric_overload";
  }
  return "heat_escalation";
}

// ─────────────────────────────────────────────
// Trigger 判定本体
// ─────────────────────────────────────────────

/**
 * critical signal + 文脈 → urgent layer 起動判定。
 *
 * 起動条件:
 *   - signal.kind === "critical" (runtime §1.5)、または
 *   - dignityActive / ruptureActive のいずれか (cooldown active 中の発火警告)
 *
 * S4 中は派手さ抑制 (§4.3.5 禁止 action: 緊急介入視覚層の発動禁止) のため不発。
 */
export function detectUrgent(input: UrgentTriggerInput): UrgentDecision | null {
  // §4.3.5 不可侵: S4 中は urgent 起動禁止
  if (input.presenceState === "S4") return null;

  const category = inferCategory(input);
  if (category === null) return null;

  // dignity / rupture が cooldown active でも signal が critical でなければ起動しない
  // (cooldown は介入棄却判定であり、UI urgent layer を勝手に出すのは別判断)
  if (
    !input.dignityActive &&
    !input.ruptureActive &&
    input.signal.kind !== "critical"
  ) {
    return null;
  }

  const form = selectForm(category);
  const memoryFallback = selectMemoryFallback(form, input);

  return {
    category,
    form,
    memoryFallback,
    reason: `urgent triggered by ${category} (form=${form}, memory=${memoryFallback})`,
  };
}
