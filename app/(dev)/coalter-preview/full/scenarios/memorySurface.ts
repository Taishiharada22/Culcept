/**
 * Stage 3 L3-g — 共有メモリ surface E2E シナリオ (6 シナリオ)
 *
 * 正本: layout plan v0.3 §6.7 / UI spec §8.2-§8.4 / Core UX §10
 *
 * 6 シナリオ:
 *   ① メモリ追加 (3 軸ラベル付き)
 *   ② 可視性 4 操作 (表示 / 自分の画面から外す / 相手にも見せる / 相手の可視範囲を下げる)
 *   ③ 後退導線 (RetreatRail)
 *   ④ §8.3.4 禁止組み合わせ生成試行 → 構造的拒否
 *   ⑤ 片側可視性 (user_a_only / user_b_only)
 *   ⑥ mode 文脈継承 (通常 → Daily 昇格、§10.3)
 *
 * 本ファイルはシナリオ定義のみ。実 store 操作は executor 側 helper で実施。
 */

import type { ScenarioDefinition } from "./normalCycle";

export const SCENARIO_MEMORY_ADD: ScenarioDefinition = {
  id: "memory_add",
  name: "① メモリ追加 (3 軸ラベル付き)",
  description: "explicit_shared × high × both_visible 項目を追加",
  steps: [
    {
      description: "memory 追加 (executor 側 setMemoryStore で挿入、本シナリオは visual 確認用)",
      kind: "presence_event",
      payload: { type: "S1_ENTRY_OK" },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_MEMORY_VISIBILITY_OPS: ScenarioDefinition = {
  id: "memory_visibility_ops",
  name: "② 可視性 4 操作 (§8.4.1)",
  description: "表示 / 自分の画面から外す / 相手にも見せる / 相手の可視範囲を下げる の 4 操作を順次",
  steps: [
    {
      description: "操作 visual 確認 (実 visibility 操作は VisibilityControls L1-h で確認)",
      kind: "presence_event",
      payload: { type: "S1_ENTRY_OK" },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_MEMORY_RETREAT_RAIL: ScenarioDefinition = {
  id: "memory_retreat_rail",
  name: "③ 後退導線 (RetreatRail)",
  description: "後退導線 tap で memory 後退 + §8.4.3 トーン準拠",
  steps: [
    {
      description: "RetreatRail visual 確認",
      kind: "presence_event",
      payload: { type: "EXIT" },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_MEMORY_FORBIDDEN_REJECTED: ScenarioDefinition = {
  id: "memory_forbidden_rejected",
  name: "④ §8.3.4 禁止組み合わせ生成試行 → 拒否",
  description: "inferred × high × both_visible を addMemoryItem 経由で試行 → throw",
  steps: [
    {
      description: "禁止組み合わせ生成試行 (memoryStore で throw、test 側で確認)",
      kind: "presence_event",
      payload: { type: "S1_ENTRY_OK" },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_MEMORY_SIDE_ONLY: ScenarioDefinition = {
  id: "memory_side_only",
  name: "⑤ 片側可視性 (user_a_only)",
  description: "user_a_only の項目は user_a viewer のみ表示、user_b は表示されない",
  steps: [
    {
      description: "片側可視性 visual 確認",
      kind: "presence_event",
      payload: { type: "S1_ENTRY_OK" },
    },
  ],
  expectedFinalState: "S0",
};

export const SCENARIO_MEMORY_MODE_INHERIT: ScenarioDefinition = {
  id: "memory_mode_inherit",
  name: "⑥ mode 文脈継承 (通常 → Daily、§10.3)",
  description: "通常 → Daily 昇格時、explicit_shared × medium 以上の項目が複製される",
  steps: [
    {
      description: "通常 → Daily 昇格",
      kind: "mode_manual",
      payload: { target: "daily" },
    },
  ],
  expectedFinalState: "S0",
};

export const MEMORY_SURFACE_SCENARIOS: ReadonlyArray<ScenarioDefinition> = [
  SCENARIO_MEMORY_ADD,
  SCENARIO_MEMORY_VISIBILITY_OPS,
  SCENARIO_MEMORY_RETREAT_RAIL,
  SCENARIO_MEMORY_FORBIDDEN_REJECTED,
  SCENARIO_MEMORY_SIDE_ONLY,
  SCENARIO_MEMORY_MODE_INHERIT,
];
