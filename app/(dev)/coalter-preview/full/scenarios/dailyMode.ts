/**
 * Stage 3 L3-d — Daily Mode 1 サイクル E2E シナリオ
 *
 * 正本: layout plan v0.3 §6.4 / Core UX v1.1 §2 / UI spec §6.5
 *
 * Daily mode で S0 → S8 の 9 遷移 + 通常モード自動復帰までを観察。
 *
 * 4 シナリオ:
 *   ① Daily 通常経路 (mode_promotion → S0(daily) → S1 → S2)
 *   ② Daily chip 応答 (S3 → S4 → S5)
 *   ③ Daily 提案 (S5 → S6 → S7、Pattern F-2)
 *   ④ Daily 退出 (S7 → S8 → S0(通常)、§6.5 自然退出)
 */

import type { ScenarioDefinition } from "./normalCycle";

export const SCENARIO_DAILY_NORMAL_PATH: ScenarioDefinition = {
  id: "daily_normal_path",
  name: "① Daily 通常経路 (mode_promotion → S2)",
  description: "Daily mode 昇格 → S0→S1→S2 (Pattern A)",
  steps: [
    {
      description: "Daily mode 昇格 signal (明示 mode_promotion、§11.5 enforce)",
      kind: "signal_mode_promotion",
      payload: { target: "daily", source: "mode_tap" },
    },
    {
      description: "通常 → Daily 手動切替 (mode tap、§6.3)",
      kind: "mode_manual",
      payload: { target: "daily" },
    },
    {
      description: "S1 entry consent → S2",
      kind: "presence_event",
      payload: { type: "S1_ENTRY_OK" },
    },
  ],
  expectedFinalState: "S2",
};

export const SCENARIO_DAILY_CHIP_RESPONSE: ScenarioDefinition = {
  id: "daily_chip_response",
  name: "② Daily chip 応答 (S3→S4→S5)",
  description: "Daily mode で S3 chip tap → S4 → S5",
  steps: [
    {
      description: "Daily 昇格",
      kind: "signal_mode_promotion",
      payload: { target: "daily", source: "mode_tap" },
    },
    { description: "通常 → Daily", kind: "mode_manual", payload: { target: "daily" } },
    { description: "S1→S2", kind: "presence_event", payload: { type: "S1_ENTRY_OK" } },
    { description: "S2→S3", kind: "presence_event", payload: { type: "S2_ACCEPTED" } },
    { description: "S3→S4", kind: "presence_event", payload: { type: "S3_RESPONSE" } },
    { description: "S4→S5", kind: "presence_event", payload: { type: "S4_DONE" } },
  ],
  expectedFinalState: "S5",
};

export const SCENARIO_DAILY_PROPOSAL: ScenarioDefinition = {
  id: "daily_proposal",
  name: "③ Daily 提案 (S5→S6→S7、Pattern F-2)",
  description: "Daily mode で S5 整理完了 → S6 → S7 (Pattern F-2 生活提案)",
  steps: [
    {
      description: "Daily 昇格",
      kind: "signal_mode_promotion",
      payload: { target: "daily", source: "mode_tap" },
    },
    { description: "通常 → Daily", kind: "mode_manual", payload: { target: "daily" } },
    { description: "S1→S2", kind: "presence_event", payload: { type: "S1_ENTRY_OK" } },
    { description: "S2→S3", kind: "presence_event", payload: { type: "S2_ACCEPTED" } },
    { description: "S3→S4", kind: "presence_event", payload: { type: "S3_RESPONSE" } },
    { description: "S4→S5", kind: "presence_event", payload: { type: "S4_DONE" } },
    { description: "S5→S6", kind: "presence_event", payload: { type: "S5_DONE" } },
    {
      description: "S6→S7 (提案を聞く、Pattern F-2 が選択される)",
      kind: "presence_event",
      payload: { type: "S6_PROPOSE" },
    },
  ],
  expectedFinalState: "S7",
};

export const SCENARIO_DAILY_NATURAL_EXIT: ScenarioDefinition = {
  id: "daily_natural_exit",
  name: "④ Daily 退出 (S7→S8→S0(通常)、§6.5 自然退出)",
  description: "プラン完成 → S8 → 通常モード自動復帰",
  steps: [
    {
      description: "Daily 昇格",
      kind: "signal_mode_promotion",
      payload: { target: "daily", source: "mode_tap" },
    },
    { description: "通常 → Daily", kind: "mode_manual", payload: { target: "daily" } },
    { description: "S1→S2", kind: "presence_event", payload: { type: "S1_ENTRY_OK" } },
    { description: "S2→S3", kind: "presence_event", payload: { type: "S2_ACCEPTED" } },
    { description: "S3→S4", kind: "presence_event", payload: { type: "S3_RESPONSE" } },
    { description: "S4→S5", kind: "presence_event", payload: { type: "S4_DONE" } },
    { description: "S5→S6", kind: "presence_event", payload: { type: "S5_DONE" } },
    { description: "S6→S7", kind: "presence_event", payload: { type: "S6_PROPOSE" } },
    { description: "S7→S8 (承認 / 不承認 いずれも)", kind: "presence_event", payload: { type: "S7_DONE" } },
    {
      description: "プラン完成 → 通常モード自動復帰 (§6.5.1)",
      kind: "mode_natural_exit",
      payload: {},
    },
  ],
  expectedFinalState: "S8", // presence は S8 のまま、mode が daily → normal に変わる
};

export const DAILY_MODE_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  SCENARIO_DAILY_NORMAL_PATH,
  SCENARIO_DAILY_CHIP_RESPONSE,
  SCENARIO_DAILY_PROPOSAL,
  SCENARIO_DAILY_NATURAL_EXIT,
];
