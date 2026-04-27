/**
 * Stage 3 L3-f — モード昇格・降格 E2E シナリオ
 *
 * 正本: layout plan v0.3 §6.6 / UI spec §6.4 / §6.5 / §6.3 / Core UX §11.5
 *
 * 6 シナリオ (plan §6.6):
 *   ① 手動 → Daily
 *   ② 手動 → Travel
 *   ③ 自動昇格 (S5 状態優先)
 *   ④ 通常復帰
 *   ⑤ Daily ↔ Travel 直接遷移禁止 (modeReducer §11.5 enforce)
 *   ⑥ 何でも Daily/Travel 防止 (暗黙 signal 拒否)
 */

import type { ScenarioDefinition } from "./normalCycle";

export const SCENARIO_MANUAL_TO_DAILY: ScenarioDefinition = {
  id: "manual_to_daily",
  name: "① 手動 → Daily (ModeSwitcher tap、§6.3)",
  description: "通常 + MANUAL_SWITCH(daily) → daily",
  steps: [
    {
      description: "通常 → Daily 手動切替 (chip tap)",
      kind: "mode_manual",
      payload: { target: "daily" },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_MANUAL_TO_TRAVEL: ScenarioDefinition = {
  id: "manual_to_travel",
  name: "② 手動 → Travel",
  description: "通常 + MANUAL_SWITCH(travel) → travel",
  steps: [
    {
      description: "通常 → Travel 手動切替",
      kind: "mode_manual",
      payload: { target: "travel" },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_AUTO_ESCALATE: ScenarioDefinition = {
  id: "auto_escalate",
  name: "③ 自動昇格 (S5 + mode_promotion signal、§6.4)",
  description: "S5 到達後、Daily mode_promotion signal で自動昇格 (§4.4)",
  steps: [
    { description: "S0→S1", kind: "signal_implicit", payload: { softScore: 0.5 } },
    { description: "S1→S2", kind: "presence_event", payload: { type: "S1_ENTRY_OK" } },
    { description: "S2→S3", kind: "presence_event", payload: { type: "S2_ACCEPTED" } },
    { description: "S3→S4", kind: "presence_event", payload: { type: "S3_RESPONSE" } },
    { description: "S4→S5", kind: "presence_event", payload: { type: "S4_DONE" } },
    {
      description: "S5 + mode_promotion (daily) signal 投入",
      kind: "signal_mode_promotion",
      payload: { target: "daily", source: "auto_escalation" },
    },
  ],
  expectedFinalState: "S5",
};

export const SCENARIO_RETURN_TO_NORMAL: ScenarioDefinition = {
  id: "return_to_normal",
  name: "④ 通常復帰 (Daily/Travel → 通常、§6.5)",
  description: "Daily mode 中 PLAN_COMPLETE → 通常モード復帰",
  steps: [
    {
      description: "Daily 昇格",
      kind: "mode_manual",
      payload: { target: "daily" },
    },
    {
      description: "プラン完成 → 通常モード自動復帰 (§6.5.1)",
      kind: "mode_natural_exit",
      payload: {},
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_DAILY_TRAVEL_DIRECT_REJECTED: ScenarioDefinition = {
  id: "daily_travel_direct_rejected",
  name: "⑤ Daily ↔ Travel 直接遷移禁止 (v1.1 §2.3 enforce)",
  description: "daily 中 → MANUAL_SWITCH(travel) は state 不変 (構造的拒否)",
  steps: [
    {
      description: "通常 → Daily",
      kind: "mode_manual",
      payload: { target: "daily" },
    },
    {
      description: "Daily → Travel 直接 (拒否される、daily 維持)",
      kind: "mode_manual",
      payload: { target: "travel" },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_IMPLICIT_DAILY_REJECTED: ScenarioDefinition = {
  id: "implicit_daily_rejected",
  name: "⑥ 何でも Daily/Travel 防止 (暗黙 signal 拒否、§11.5)",
  description:
    "暗黙 signal で AUTO_ESCALATE 試行 → reducer 内で拒否 (mode_promotion のみ受容)",
  steps: [
    {
      description: "暗黙 signal (mode 昇格 trigger にならない)",
      kind: "signal_implicit",
      payload: { softScore: 0.7 },
    },
    // mode は normal のまま
  ],
  expectedFinalState: "S1",
};

export const MODE_TRANSITION_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  SCENARIO_MANUAL_TO_DAILY,
  SCENARIO_MANUAL_TO_TRAVEL,
  SCENARIO_AUTO_ESCALATE,
  SCENARIO_RETURN_TO_NORMAL,
  SCENARIO_DAILY_TRAVEL_DIRECT_REJECTED,
  SCENARIO_IMPLICIT_DAILY_REJECTED,
];
