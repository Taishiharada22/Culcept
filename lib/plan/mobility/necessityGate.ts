// lib/plan/mobility/necessityGate.ts
//
// v0-B: pure necessity gate（沈黙デフォルト）
// MobilityHypothesis → surface する / 沈黙する を判定する純関数。
// ★Aneurasync Map を「鬱陶しい AI」にしないための中核（research#2 F5: 先回りは必要性ゲートで沈黙デフォルト）。
//
// 純粋関数。UI / localStorage / API / DB / Date.now / production 配線なし・通知なし。
//
// 禁則:
//   - ❌ 常時表示・通知（沈黙がデフォルト）
//   - ❌ contextNote だけで過剰表示（signal 閾値を必ず通す）
//   - ❌ fake belief / weather だけで表示強制（surface は habitual の signal に基づく）

import type { MobilityHypothesis } from "./mobilityHypothesis";

/** gate の判断理由（telemetry/debug + 後段 v0-C copy 用） */
export type GateReason =
  | "sensitive" // privacy blackout → 沈黙（最優先）
  | "cold_start" // 観測ゼロ（habitual なし）→ 沈黙
  | "low_signal" // 観測/一貫性 不足（weak/none）→ 沈黙（contextNote があってもバイパスしない）
  | "surface_habitual" // 出す: habitual のみ
  | "surface_with_context"; // 出す: habitual + contextNote

export interface GateContext {
  /**
   * leg が sensitive（MovementPrivacyClass の blackout 対象: sensitive_adjacent/sensitive_both 等）か。
   * caller が leg の privacy から供給する（v0-B は pure・privacy 判定はしない）。
   */
  readonly sensitive?: boolean;
}

export interface GateDecision {
  readonly surface: boolean;
  readonly reason: GateReason;
}

/**
 * v0-B: surface するか沈黙するかを判定（純粋・沈黙デフォルト）。
 *
 * 沈黙条件（優先順）:
 *   1. sensitive（privacy blackout）
 *   2. cold-start（habitualMode なし）
 *   3. low_signal（habitualStrength が weak/none = 観測/一貫性 不足）
 *      ★contextNote があっても signal 閾値はバイパスしない（過剰表示防止）
 * surface 条件: 上記いずれにも該当せず habitualStrength ≥ moderate。
 * 閾値（moderate）は暫定。open question「最小観測数で accurate か creepy か」を Phase-1 で実測調整。
 */
export function decideSurface(
  hypothesis: MobilityHypothesis,
  gateContext: GateContext = {},
): GateDecision {
  if (gateContext.sensitive) {
    return { surface: false, reason: "sensitive" };
  }
  if (hypothesis.habitualMode === null) {
    return { surface: false, reason: "cold_start" };
  }
  if (hypothesis.habitualStrength === "weak" || hypothesis.habitualStrength === "none") {
    return { surface: false, reason: "low_signal" };
  }
  return {
    surface: true,
    reason: hypothesis.contextNote ? "surface_with_context" : "surface_habitual",
  };
}
