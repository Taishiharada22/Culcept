/**
 * Stage 3 L3-h — 緊急介入視覚層 E2E シナリオ (8 シナリオ)
 *
 * 正本: layout plan v0.3 §6.8 / UI spec §8.5 / §8.6 / runtime §1.5
 */

import type { ScenarioDefinition } from "./normalCycle";

export const SCENARIO_URGENT_DIGNITY: ScenarioDefinition = {
  id: "urgent_dignity",
  name: "① dignity 抵触 critical → urgent + memory 縮退 (§8.6.2)",
  description: "dignity_violation trigger で urgent dominant_card 起動",
  steps: [
    {
      description: "dignity critical signal",
      kind: "signal_critical",
      payload: { trigger: "dignity_violation" },
    },
  ],
  expectedFinalState: "S2",
};

export const SCENARIO_URGENT_RUPTURE: ScenarioDefinition = {
  id: "urgent_rupture",
  name: "② rupture 検出 critical → urgent + memory 降格",
  description: "rupture_detected trigger で urgent 起動",
  steps: [
    {
      description: "rupture critical signal",
      kind: "signal_critical",
      payload: { trigger: "rupture_detected" },
    },
  ],
  expectedFinalState: "S2",
};

export const SCENARIO_URGENT_SAFETY: ScenarioDefinition = {
  id: "urgent_safety",
  name: "③ safety 違反 critical → urgent (§8.6.3 同居禁止 enforce)",
  description: "safety_concern trigger で urgent 起動",
  steps: [
    {
      description: "safety critical signal",
      kind: "signal_critical",
      payload: { trigger: "safety_concern" },
    },
  ],
  expectedFinalState: "S2",
};

export const SCENARIO_URGENT_AUTO_RELEASE: ScenarioDefinition = {
  id: "urgent_auto_release",
  name: "④ 自動解除 (intervention_complete、§8.5.4)",
  description: "urgent 起動 → 介入完了 → 自動解除",
  steps: [
    {
      description: "critical signal で urgent 起動",
      kind: "signal_critical",
      payload: { trigger: "heat_escalation" },
    },
    {
      description: "S2→S3 (応答取得 = 介入完了 trigger)",
      kind: "presence_event",
      payload: { type: "S2_ACCEPTED" },
    },
  ],
  expectedFinalState: "S3",
};

export const SCENARIO_URGENT_MANUAL_RELEASE: ScenarioDefinition = {
  id: "urgent_manual_release",
  name: "⑤ 手動解除 (UrgentRelease tap、user_dismiss)",
  description: "urgent 起動 → ユーザー dismiss → 即解除",
  steps: [
    {
      description: "critical signal",
      kind: "signal_critical",
      payload: { trigger: "heat_escalation" },
    },
    {
      description: "EXIT (dismiss 相当)",
      kind: "presence_event",
      payload: { type: "EXIT" },
    },
  ],
  expectedFinalState: "S8",
};

export const SCENARIO_URGENT_COOLDOWN_RELEASE: ScenarioDefinition = {
  id: "urgent_cooldown_release",
  name: "⑥ cooldown 解除 (intervention_retreat 期間経過)",
  description: "intervention_retreat cooldown 設定 → 期間経過 → 平常 memory surface 復帰",
  steps: [
    {
      description: "intervention_retreat cooldown 設定",
      kind: "rejection",
      payload: { type: "COALTER_RETREAT_REQUESTED", at: 0 },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_URGENT_S7_REJECTED: ScenarioDefinition = {
  id: "urgent_s7_rejected",
  name: "⑦ urgent + S7 同居試行 → 構造的拒否 (§8.6.3)",
  description: "S7 状態中 urgent 起動 → checkCoexistence で violation",
  steps: [
    {
      description: "S0→...→S7 まで進行",
      kind: "signal_implicit",
      payload: { softScore: 0.5 },
    },
    { description: "S1→S2", kind: "presence_event", payload: { type: "S1_ENTRY_OK" } },
    { description: "S2→S3", kind: "presence_event", payload: { type: "S2_ACCEPTED" } },
    { description: "S3→S4", kind: "presence_event", payload: { type: "S3_RESPONSE" } },
    { description: "S4→S5", kind: "presence_event", payload: { type: "S4_DONE" } },
    { description: "S5→S6", kind: "presence_event", payload: { type: "S5_DONE" } },
    { description: "S6→S7", kind: "presence_event", payload: { type: "S6_PROPOSE" } },
    {
      description: "S7 中の critical signal は state 不変 (urgency は別 phase)",
      kind: "signal_critical",
      payload: { trigger: "heat_escalation" },
    },
  ],
  expectedFinalState: "S7",
};

export const SCENARIO_URGENT_TONE_CONTINUITY: ScenarioDefinition = {
  id: "urgent_tone_continuity",
  name: "⑧ トーン連続性 (§8.6.4 アニメ連続性)",
  description: "urgent 起動 → 解除 → 平常復帰 (アニメ連続)",
  steps: [
    {
      description: "critical signal",
      kind: "signal_critical",
      payload: { trigger: "heat_escalation" },
    },
    {
      description: "S2→S3 介入完了",
      kind: "presence_event",
      payload: { type: "S2_ACCEPTED" },
    },
    {
      description: "S3→S4",
      kind: "presence_event",
      payload: { type: "S3_RESPONSE" },
    },
  ],
  expectedFinalState: "S4",
};

export const URGENT_LAYER_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  SCENARIO_URGENT_DIGNITY,
  SCENARIO_URGENT_RUPTURE,
  SCENARIO_URGENT_SAFETY,
  SCENARIO_URGENT_AUTO_RELEASE,
  SCENARIO_URGENT_MANUAL_RELEASE,
  SCENARIO_URGENT_COOLDOWN_RELEASE,
  SCENARIO_URGENT_S7_REJECTED,
  SCENARIO_URGENT_TONE_CONTINUITY,
];
