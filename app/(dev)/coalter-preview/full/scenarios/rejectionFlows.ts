/**
 * Stage 3 L3-i — 拒否 3 分類 E2E シナリオ (6 シナリオ)
 *
 * 正本: layout plan v0.3 §6.9 / UI spec §6.6 / §6.7 / §6.8
 */

import type { ScenarioDefinition } from "./normalCycle";

export const SCENARIO_REJECT_MODE_ESCALATION: ScenarioDefinition = {
  id: "reject_mode_escalation",
  name: "① mode 昇格拒否 (§6.6.1)",
  description: "Daily 自動昇格 → ユーザー拒否 → 通常維持 + cooldown",
  steps: [
    {
      description: "MODE_ESCALATION_REJECTED (daily)",
      kind: "rejection",
      payload: { type: "MODE_ESCALATION_REJECTED", rejectedMode: "daily", at: 0 },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_REJECT_PROPOSAL: ScenarioDefinition = {
  id: "reject_proposal",
  name: "② 個別提案拒否 (§6.6.2)",
  description: "S7 提案を拒否 → S8 退出 + proposal_rejection cooldown",
  steps: [
    {
      description: "PROPOSAL_REJECTED (food)",
      kind: "rejection",
      payload: { type: "PROPOSAL_REJECTED", theme: "food", at: 0 },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_REJECT_COALTER_RETREAT: ScenarioDefinition = {
  id: "reject_coalter_retreat",
  name: "③ coalter 後退要求 (§6.6.3)",
  description:
    "ユーザー明示後退要求 → intervention_retreat cooldown + S0 自動遷移完全停止",
  steps: [
    {
      description: "COALTER_RETREAT_REQUESTED",
      kind: "rejection",
      payload: { type: "COALTER_RETREAT_REQUESTED", at: 0 },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_REJECT_INDEPENDENCE: ScenarioDefinition = {
  id: "reject_independence",
  name: "④ 3 拒否の独立性 (§6.7 / 構造的独立)",
  description:
    "3 種を順次発火 → 各 slot が他 slot を変更しない (rejectionReducer 構造保証)",
  steps: [
    {
      description: "MODE_ESCALATION_REJECTED",
      kind: "rejection",
      payload: { type: "MODE_ESCALATION_REJECTED", rejectedMode: "daily", at: 0 },
    },
    {
      description: "PROPOSAL_REJECTED",
      kind: "rejection",
      payload: { type: "PROPOSAL_REJECTED", theme: "food", at: 1 },
    },
    {
      description: "COALTER_RETREAT_REQUESTED",
      kind: "rejection",
      payload: { type: "COALTER_RETREAT_REQUESTED", at: 2 },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_REJECT_NON_JUDGMENTAL: ScenarioDefinition = {
  id: "reject_non_judgmental",
  name: "⑤ 非判定性 (§6.8)",
  description: "拒否後 visual で「失敗」「悪い」表現がゼロ (state shape 検証で確認)",
  steps: [
    {
      description: "PROPOSAL_REJECTED",
      kind: "rejection",
      payload: { type: "PROPOSAL_REJECTED", theme: "movie", at: 0 },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_REJECT_REENTRY_TABLE: ScenarioDefinition = {
  id: "reject_reentry_table",
  name: "⑥ 再介入条件サマリ (§6.7 表)",
  description:
    "各 cooldown 完了 → §6.7 表通りの解除条件で再介入可能 (時間経過は test 側で確認)",
  steps: [
    {
      description: "MODE_ESCALATION_REJECTED (durationMs=100ms)",
      kind: "rejection",
      payload: {
        type: "MODE_ESCALATION_REJECTED",
        rejectedMode: "daily",
        at: 0,
        durationMs: 100,
      },
    },
  ],
  expectedFinalState: "S0",
};

export const REJECTION_FLOW_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  SCENARIO_REJECT_MODE_ESCALATION,
  SCENARIO_REJECT_PROPOSAL,
  SCENARIO_REJECT_COALTER_RETREAT,
  SCENARIO_REJECT_INDEPENDENCE,
  SCENARIO_REJECT_NON_JUDGMENTAL,
  SCENARIO_REJECT_REENTRY_TABLE,
];
