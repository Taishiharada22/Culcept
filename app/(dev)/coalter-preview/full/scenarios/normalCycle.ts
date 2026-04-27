/**
 * Stage 3 L3-b — 通常モード 1 サイクル E2E シナリオ定義
 *
 * 正本: layout plan v0.3 §6.2
 *
 * 各シナリオは event 列で表現。シナリオ runner が順次 dispatch することで
 * preview 上で 1 サイクル S0 → S8 を観察可能にする。
 *
 * 7 シナリオ (plan §6.2 表):
 *   1. 通常経路: 暗黙 soft → S0→S1→S2→S3→S4→S5
 *   2. chip 応答: S5 chip tap → S5 内 pattern 切替 (本 mock では state 不変)
 *   3. 提案: S5 → S6 → S7
 *   4. handoff: S7 → S8
 *   5. 退出: S8 常駐
 *   6. 緊急短縮: critical → S0→S2 直接
 *   7. 超越 cooldown: dignity active 中の @coalter → 抑制応答
 *
 * NOTE (plan §6.2 表記の事後修正、spec 整合):
 *   plan §6.2 では「S2 で Pattern B」と表記するが UI spec §7.12 では Pattern B は
 *   S5 のみ許可。本シナリオでは §7.12 正本に従い、S2 では Pattern A、S5 で B/C/D/E
 *   を選択する想定。plan v0.4 minor revision で同期予定 (CEO task)。
 */

import type { PresenceEvent } from "@/lib/coalter/presence/reducer";

export interface ScenarioStep {
  /** 説明文 (debug / log 用) */
  description: string;
  /** dispatch 種別 */
  kind: "signal_explicit" | "signal_implicit" | "signal_critical" | "signal_mode_promotion" | "signal_manual_restart" | "presence_event" | "mode_manual" | "mode_natural_exit" | "rejection";
  /** 各 kind の payload */
  payload: Record<string, unknown>;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  steps: ReadonlyArray<ScenarioStep>;
  /** 期待される最終 state (assertion 用) */
  expectedFinalState: string;
}

// ─────────────────────────────────────────────
// シナリオ 1: 通常経路
// ─────────────────────────────────────────────

export const SCENARIO_NORMAL: ScenarioDefinition = {
  id: "normal_path",
  name: "① 通常経路 (S0→S1→S2→S3→S4→S5)",
  description: "暗黙 soft signal で開始 → 通常モードで 1 サイクル中盤まで進行",
  steps: [
    {
      description: "暗黙 soft signal 投入 (膠着検出 mock)",
      kind: "signal_implicit",
      payload: { softScore: 0.5 },
    },
    {
      description: "S1 entry consent 通過 → S2",
      kind: "presence_event",
      payload: { type: "S1_ENTRY_OK" },
    },
    {
      description: "S2 受容 → S3",
      kind: "presence_event",
      payload: { type: "S2_ACCEPTED" },
    },
    {
      description: "S3 応答取得 → S4",
      kind: "presence_event",
      payload: { type: "S3_RESPONSE" },
    },
    {
      description: "S4 理解更新完了 → S5",
      kind: "presence_event",
      payload: { type: "S4_DONE" },
    },
  ],
  expectedFinalState: "S5",
};

// ─────────────────────────────────────────────
// シナリオ 2: S5 内 chip 応答 (state 不変、Pattern 切替の preview)
// ─────────────────────────────────────────────

export const SCENARIO_S5_CHIP: ScenarioDefinition = {
  id: "s5_chip_response",
  name: "② S5 chip 応答 (state 維持で Pattern 選択切替)",
  description: "S5 到達後、chip tap で Pattern variant 選択を切替 (state 不変)",
  steps: [
    {
      description: "通常経路で S5 到達",
      kind: "signal_implicit",
      payload: { softScore: 0.5 },
    },
    {
      description: "S1→S2",
      kind: "presence_event",
      payload: { type: "S1_ENTRY_OK" },
    },
    {
      description: "S2→S3",
      kind: "presence_event",
      payload: { type: "S2_ACCEPTED" },
    },
    {
      description: "S3→S4",
      kind: "presence_event",
      payload: { type: "S3_RESPONSE" },
    },
    {
      description: "S4→S5",
      kind: "presence_event",
      payload: { type: "S4_DONE" },
    },
    {
      description: "S5 で chip tap (explicit signal)、state 不変",
      kind: "signal_explicit",
      payload: { source: "chip_tap" },
    },
  ],
  expectedFinalState: "S5",
};

// ─────────────────────────────────────────────
// シナリオ 3: 提案 (S5 → S6 → S7)
// ─────────────────────────────────────────────

export const SCENARIO_PROPOSAL: ScenarioDefinition = {
  id: "proposal_path",
  name: "③ 提案経路 (S5→S6→S7)",
  description: "S5 → 整理完了 → S6 提案可能 → S7 提案表示",
  steps: [
    { description: "S0→S1", kind: "signal_implicit", payload: { softScore: 0.5 } },
    { description: "S1→S2", kind: "presence_event", payload: { type: "S1_ENTRY_OK" } },
    { description: "S2→S3", kind: "presence_event", payload: { type: "S2_ACCEPTED" } },
    { description: "S3→S4", kind: "presence_event", payload: { type: "S3_RESPONSE" } },
    { description: "S4→S5", kind: "presence_event", payload: { type: "S4_DONE" } },
    { description: "S5→S6 整理完了", kind: "presence_event", payload: { type: "S5_DONE" } },
    {
      description: "S6→S7 「提案を聞く」tap",
      kind: "presence_event",
      payload: { type: "S6_PROPOSE" },
    },
  ],
  expectedFinalState: "S7",
};

// ─────────────────────────────────────────────
// シナリオ 4: handoff (S7 → S8)
// ─────────────────────────────────────────────

export const SCENARIO_HANDOFF: ScenarioDefinition = {
  id: "handoff_path",
  name: "④ handoff 経路 (S7→S8)",
  description: "S7 提案を承認 / 不承認 / 閉じる いずれも S8 退出",
  steps: [
    { description: "S0→S1", kind: "signal_implicit", payload: { softScore: 0.5 } },
    { description: "S1→S2", kind: "presence_event", payload: { type: "S1_ENTRY_OK" } },
    { description: "S2→S3", kind: "presence_event", payload: { type: "S2_ACCEPTED" } },
    { description: "S3→S4", kind: "presence_event", payload: { type: "S3_RESPONSE" } },
    { description: "S4→S5", kind: "presence_event", payload: { type: "S4_DONE" } },
    { description: "S5→S6", kind: "presence_event", payload: { type: "S5_DONE" } },
    {
      description: "S6→S7",
      kind: "presence_event",
      payload: { type: "S6_PROPOSE" },
    },
    {
      description: "S7 承認 / 不承認 / 閉じる いずれも S8",
      kind: "presence_event",
      payload: { type: "S7_DONE" },
    },
  ],
  expectedFinalState: "S8",
};

// ─────────────────────────────────────────────
// シナリオ 5: 退出 (S8 常駐 → 再起動)
// ─────────────────────────────────────────────

export const SCENARIO_EXIT_RESTART: ScenarioDefinition = {
  id: "exit_restart",
  name: "⑤ 退出 → 再起動 (S8→S0→S1)",
  description: "S8 cooldown → manual_restart → S0 → S1",
  steps: [
    { description: "S0→S1", kind: "signal_implicit", payload: { softScore: 0.5 } },
    { description: "S1→S2", kind: "presence_event", payload: { type: "S1_ENTRY_OK" } },
    { description: "S2→S8 (任意状態 EXIT)", kind: "presence_event", payload: { type: "EXIT" } },
    {
      description: "S8 → S0 (RESTART)",
      kind: "presence_event",
      payload: { type: "RESTART" },
    },
    {
      description: "S0 → S1 (新 signal)",
      kind: "signal_implicit",
      payload: { softScore: 0.5 },
    },
  ],
  expectedFinalState: "S1",
};

// ─────────────────────────────────────────────
// シナリオ 6: 緊急短縮 (S0 → S2 critical)
// ─────────────────────────────────────────────

export const SCENARIO_CRITICAL_SHORTCUT: ScenarioDefinition = {
  id: "critical_shortcut",
  name: "⑥ 緊急短縮 (S0→S2 critical 短縮、v1.1 §8.4)",
  description: "critical signal で S1 スキップ、S0 から S2 直接",
  steps: [
    {
      description: "critical signal 投入",
      kind: "signal_critical",
      payload: { trigger: "heat_escalation" },
    },
  ],
  expectedFinalState: "S2",
};

// ─────────────────────────────────────────────
// シナリオ 7: 超越 cooldown 中の @coalter (dignity rupture)
// ─────────────────────────────────────────────

export const SCENARIO_TRANSCENDENT_COOLDOWN: ScenarioDefinition = {
  id: "transcendent_cooldown",
  name: "⑦ 超越 cooldown 中の介入 (S0 維持 + 抑制応答)",
  description:
    "coalter_retreat cooldown active → mention 強制 → 介入棄却 + 抑制応答 (§3.3.1)",
  steps: [
    {
      description: "coalter_retreat cooldown 設定",
      kind: "rejection",
      payload: { type: "COALTER_RETREAT_REQUESTED", at: 0 },
    },
    {
      description: "mention 強制起動を試行 (coolant 中、cooldownResolver で棄却される想定)",
      kind: "signal_explicit",
      payload: { source: "mention" },
    },
  ],
  // mention 強制は intervention_retreat 中で許可されるため S0→S1 に進む
  // (cooldownResolver 上は通る、§6.6.3「期間中も明示呼び出し可」)
  expectedFinalState: "S1",
};

// ─────────────────────────────────────────────
// 全シナリオ集約
// ─────────────────────────────────────────────

export const NORMAL_CYCLE_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  SCENARIO_NORMAL,
  SCENARIO_S5_CHIP,
  SCENARIO_PROPOSAL,
  SCENARIO_HANDOFF,
  SCENARIO_EXIT_RESTART,
  SCENARIO_CRITICAL_SHORTCUT,
  SCENARIO_TRANSCENDENT_COOLDOWN,
];
