/**
 * S2 — CoAlter demo personalization fixture（**preview 専用・demo データ・実 DB read なし**）
 *
 * 役割: CoAlter Plan Intelligence の personalization live 配線を preview で smoke するための
 *   **2 人分の demo `PersonalizationSnapshot`**（self = viewer / partner = 相手）。
 *
 * なぜ fixture か（honesty）:
 *   - staging に性格診断軸が無い（production のみ観測）。flag ON でも実 read は neutral → 効果ゼロ。
 *   - そこで「軸が入った世界」を preview で見せるため **demo 軸**を用意する。これは S1 で fixture session
 *     （温泉/予算 等の条件）を使ったのと同じ流儀。**実 DB の他人軸 read（真の M2-B privacy 案件）には踏み込まない**。
 *   - VM/UI は必ず `demo: true` を伴って表示する（live 実データと誤認させない）。
 *
 * 厳守:
 *   - 実在の `TraitAxisKey`（traitAxes.ts）のみ使用。derive が読む軸に値を置く（捏造軸を作らない）。
 *   - asOf / observedAt は **固定 ISO**（決定論・Date.now を取らない）。
 *   - self の軸のみ engine scoring に効く（adapter が owner=participantIds[0] に限定）。
 *     partner 軸は説明レイヤ（pair readout）専用＝engine の順位計算には入らない。
 */

import type { AxisSnapshot, PersonalizationSnapshot } from "@/lib/shared/personalization/types";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { CoAlterPlanMode } from "./coalterPlanSessionFixture";

/** demo 観測の固定時刻（決定論）。 */
const DEMO_OBSERVED_AT = "2026-06-15T00:00:00.000Z";
const DEMO_AS_OF = "2026-06-20T00:00:00.000Z";

/** 軸 1 件（demo）。score -1..1 / confidence 0..1。 */
function ax(score: number, confidence: number): AxisSnapshot {
  return { score, confidence, observedAt: DEMO_OBSERVED_AT };
}

function snapshot(userId: string, axes: Partial<Record<TraitAxisKey, AxisSnapshot>>): PersonalizationSnapshot {
  return { userId, asOf: DEMO_AS_OF, axes, hdm: null, dynamicState: null, decisionMeta: null };
}

export interface CoAlterDemoPersonalization {
  /** viewer（engine scoring に効く側）。 */
  self: PersonalizationSnapshot;
  /** 相手（説明レイヤ＝pair readout 専用・engine には入らない）。 */
  partner: PersonalizationSnapshot;
}

/**
 * Travel demo:
 *   - self（Kento）= 新しい場所に前向き（novelty 高）＋ 詰め込まずゆっくり（density 低）＋ 即興で動きたい
 *   - partner（Mio）= 定番に安心（novelty 低・慎重）＋ ゆっくり（density 低）＋ 事前に決めたい
 *   → 一致点 readout: 「お二人ともゆっくり過ごす方向」（pace 同方向）
 *   → forecast（摩擦・ランク 2 件）: ①行き先選び（新奇 vs 定番）②段取り（即興 vs 計画）
 *   → self soft preference: pace=slow（active 却下を補強）＋ novelty descriptor（新奇 angle に効く）
 */
const TRAVEL_SELF = snapshot("demo-kento", {
  tradition_vs_novelty: ax(0.6, 0.7), //      +新奇
  novelty_threshold: ax(0.5, 0.65), //        +未知も平気
  change_embrace_vs_resist: ax(-0.4, 0.6), // -変化を歓迎（invert で novelty 寄与）
  quality_vs_quantity: ax(-0.4, 0.55), //     -質を深く → density 低 → pace slow
  energy_rhythm: ax(-0.3, 0.5), //            -静かに充電 → density 低
  plan_vs_spontaneous: ax(0.5, 0.6), //       +即興で動きたい（段取り摩擦の self 側）
});

const TRAVEL_PARTNER = snapshot("demo-mio", {
  tradition_vs_novelty: ax(-0.5, 0.7), //     -定番
  novelty_threshold: ax(-0.4, 0.6), //        -未知は不安（novelty 源泉を2本にし coverage を floor 超えへ）
  cautious_vs_bold: ax(-0.6, 0.7), //         -慎重 → 安心圏（comfortVsAdventure 低）
  quality_vs_quantity: ax(-0.5, 0.6), //      -質を深く → ゆっくり
  energy_rhythm: ax(-0.4, 0.55), //           -静かに充電
  plan_vs_spontaneous: ax(-0.5, 0.6), //      -事前に決めたい（段取り摩擦の partner 側）
});

/**
 * Daily demo:
 *   - self（Kento）= 人と動くと回復（外向）＋ 活発に消費するリズム
 *   - partner（Mio）= 静かめ（内向）＋ 慎重 ＋ 静かに充電するリズム
 *   → forecast: 対人の差（人の多さ）/ moment: 人気カフェで Mio 人疲れ
 *   → rhythm（S3-3）: energy_rhythm がズレ（Kento 活発消費 / Mio 静か充電）→ interleave（山と谷を交互に）
 */
const DAILY_SELF = snapshot("demo-kento", {
  introvert_vs_extrovert: ax(0.45, 0.6), //   +外向
  energy_rhythm: ax(0.35, 0.55), //           +活発に消費 → density やや高 + rhythm 活発側
  social_initiative: ax(0.4, 0.55), //        +自分から
});

const DAILY_PARTNER = snapshot("demo-mio", {
  introvert_vs_extrovert: ax(-0.4, 0.6), //   -内向
  cautious_vs_bold: ax(-0.45, 0.6), //        -慎重
  stress_isolation_vs_social: ax(-0.35, 0.5), // -一人で回復
  energy_rhythm: ax(-0.4, 0.55), //           -静かに充電 → rhythm 静か側（pace は単独源泉で floor 未満＝forecast 不変）
});

export const COALTER_DEMO_PERSONALIZATION: Record<CoAlterPlanMode, CoAlterDemoPersonalization> = {
  daily: { self: DAILY_SELF, partner: DAILY_PARTNER },
  travel: { self: TRAVEL_SELF, partner: TRAVEL_PARTNER },
};
