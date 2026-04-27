/**
 * Stage 3 L3-e — Travel Mode 1 サイクル E2E シナリオ
 *
 * 正本: layout plan v0.3 §6.5 / Core UX v1.1 §2 / UI spec §6.5
 *
 * 4 シナリオ:
 *   ① Travel 通常経路
 *   ② Travel chip 応答
 *   ③ Travel 提案 (Pattern F-2 主 + F-1 副次同伴、§7.10)
 *   ④ Travel 退出 (§6.5 自然退出)
 */

import type { ScenarioDefinition } from "./normalCycle";

export const SCENARIO_TRAVEL_NORMAL_PATH: ScenarioDefinition = {
  id: "travel_normal_path",
  name: "① Travel 通常経路 (mode_promotion → S2)",
  description: "Travel mode 昇格 → S0→S1→S2",
  steps: [
    {
      description: "Travel mode 昇格 signal (明示 mode_promotion)",
      kind: "signal_mode_promotion",
      payload: { target: "travel", source: "mode_tap" },
    },
    {
      description: "通常 → Travel 手動切替",
      kind: "mode_manual",
      payload: { target: "travel" },
    },
    { description: "S1→S2", kind: "presence_event", payload: { type: "S1_ENTRY_OK" } },
  ],
  expectedFinalState: "S2",
};

export const SCENARIO_TRAVEL_CHIP_RESPONSE: ScenarioDefinition = {
  id: "travel_chip_response",
  name: "② Travel chip 応答 (S3→S4→S5)",
  description: "Travel mode で S3 chip tap → S4 → S5",
  steps: [
    {
      description: "Travel 昇格",
      kind: "signal_mode_promotion",
      payload: { target: "travel", source: "mode_tap" },
    },
    {
      description: "通常 → Travel",
      kind: "mode_manual",
      payload: { target: "travel" },
    },
    { description: "S1→S2", kind: "presence_event", payload: { type: "S1_ENTRY_OK" } },
    { description: "S2→S3", kind: "presence_event", payload: { type: "S2_ACCEPTED" } },
    { description: "S3→S4", kind: "presence_event", payload: { type: "S3_RESPONSE" } },
    { description: "S4→S5", kind: "presence_event", payload: { type: "S4_DONE" } },
  ],
  expectedFinalState: "S5",
};

export const SCENARIO_TRAVEL_PROPOSAL: ScenarioDefinition = {
  id: "travel_proposal",
  name: "③ Travel 提案 (S5→S6→S7、F-2 主 + F-1 副次同伴 §7.10)",
  description: "Travel mode で S5 → S6 → S7 (F-2 主、F-1 副次は selectSecondaryPattern で取得)",
  steps: [
    {
      description: "Travel 昇格",
      kind: "signal_mode_promotion",
      payload: { target: "travel", source: "mode_tap" },
    },
    {
      description: "通常 → Travel",
      kind: "mode_manual",
      payload: { target: "travel" },
    },
    { description: "S1→S2", kind: "presence_event", payload: { type: "S1_ENTRY_OK" } },
    { description: "S2→S3", kind: "presence_event", payload: { type: "S2_ACCEPTED" } },
    { description: "S3→S4", kind: "presence_event", payload: { type: "S3_RESPONSE" } },
    { description: "S4→S5", kind: "presence_event", payload: { type: "S4_DONE" } },
    { description: "S5→S6", kind: "presence_event", payload: { type: "S5_DONE" } },
    { description: "S6→S7", kind: "presence_event", payload: { type: "S6_PROPOSE" } },
  ],
  expectedFinalState: "S7",
};

export const SCENARIO_TRAVEL_NATURAL_EXIT: ScenarioDefinition = {
  id: "travel_natural_exit",
  name: "④ Travel 退出 (S7→S8、§6.5 自然退出で通常モード復帰)",
  description: "Travel Plan Brief 出力完了 → S8 → 通常モード自動復帰",
  steps: [
    {
      description: "Travel 昇格",
      kind: "signal_mode_promotion",
      payload: { target: "travel", source: "mode_tap" },
    },
    {
      description: "通常 → Travel",
      kind: "mode_manual",
      payload: { target: "travel" },
    },
    { description: "S1→S2", kind: "presence_event", payload: { type: "S1_ENTRY_OK" } },
    { description: "S2→S3", kind: "presence_event", payload: { type: "S2_ACCEPTED" } },
    { description: "S3→S4", kind: "presence_event", payload: { type: "S3_RESPONSE" } },
    { description: "S4→S5", kind: "presence_event", payload: { type: "S4_DONE" } },
    { description: "S5→S6", kind: "presence_event", payload: { type: "S5_DONE" } },
    { description: "S6→S7", kind: "presence_event", payload: { type: "S6_PROPOSE" } },
    { description: "S7→S8", kind: "presence_event", payload: { type: "S7_DONE" } },
    {
      description: "Plan Brief 完成 → 通常モード復帰 (§6.5.1)",
      kind: "mode_natural_exit",
      payload: {},
    },
  ],
  expectedFinalState: "S8",
};

export const TRAVEL_MODE_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  SCENARIO_TRAVEL_NORMAL_PATH,
  SCENARIO_TRAVEL_CHIP_RESPONSE,
  SCENARIO_TRAVEL_PROPOSAL,
  SCENARIO_TRAVEL_NATURAL_EXIT,
];
