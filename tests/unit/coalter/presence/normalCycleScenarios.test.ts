/**
 * Stage 3 L3-b — 通常モード 1 サイクル E2E シナリオ test
 *
 * plan v0.3 §6.2 7 シナリオ全網羅 (executor 単体検証):
 *   ① 通常経路 / ② chip 応答 / ③ 提案 / ④ handoff / ⑤ 退出 → 再起動
 *   ⑥ 緊急短縮 / ⑦ 超越 cooldown
 */

import { describe, it, expect } from "vitest";

import {
  presenceReducer,
  initialPresenceState,
  type PresenceEvent,
} from "@/lib/coalter/presence/reducer";
import {
  adaptCritical,
  adaptExplicit,
  adaptImplicit,
} from "@/lib/coalter/presence/signalAdapter";
import {
  rejectionReducer,
  initialRejectionState,
  flattenCooldowns,
} from "@/lib/coalter/presence/rejectionReducer";
import { resolveCooldown } from "@/lib/coalter/presence/cooldownResolver";
import {
  NORMAL_CYCLE_SCENARIOS,
  SCENARIO_NORMAL,
  SCENARIO_PROPOSAL,
  SCENARIO_CRITICAL_SHORTCUT,
  SCENARIO_HANDOFF,
  SCENARIO_EXIT_RESTART,
} from "@/app/(dev)/coalter-preview/full/scenarios/normalCycle";

describe("L3-b ① 通常経路 (S0→...→S5)", () => {
  it("暗黙 soft → S1 → S2 → S3 → S4 → S5", () => {
    let state = initialPresenceState();
    state = presenceReducer(state, {
      type: "SIGNAL",
      signal: adaptImplicit({ softScore: 0.5, detectedAt: 0 }),
    });
    expect(state.state).toBe("S1");
    state = presenceReducer(state, { type: "S1_ENTRY_OK" });
    expect(state.state).toBe("S2");
    state = presenceReducer(state, { type: "S2_ACCEPTED" });
    expect(state.state).toBe("S3");
    state = presenceReducer(state, { type: "S3_RESPONSE" });
    expect(state.state).toBe("S4");
    state = presenceReducer(state, { type: "S4_DONE" });
    expect(state.state).toBe("S5");
  });
});

describe("L3-b ② chip 応答 (S5 で state 不変)", () => {
  it("S5 で chip_tap (explicit signal) → state 不変", () => {
    let state = initialPresenceState();
    state = presenceReducer(state, {
      type: "SIGNAL",
      signal: adaptImplicit({ softScore: 0.5, detectedAt: 0 }),
    });
    state = presenceReducer(state, { type: "S1_ENTRY_OK" });
    state = presenceReducer(state, { type: "S2_ACCEPTED" });
    state = presenceReducer(state, { type: "S3_RESPONSE" });
    state = presenceReducer(state, { type: "S4_DONE" });
    expect(state.state).toBe("S5");
    state = presenceReducer(state, {
      type: "SIGNAL",
      signal: adaptExplicit({ source: "chip_tap", detectedAt: 1000 }),
    });
    expect(state.state).toBe("S5"); // S5 中 explicit signal は state 不変
  });
});

describe("L3-b ③ 提案 (S5→S6→S7)", () => {
  it("S5 → S6 → S7 を順次遷移", () => {
    let state = initialPresenceState();
    const events: PresenceEvent[] = [
      { type: "SIGNAL", signal: adaptImplicit({ softScore: 0.5, detectedAt: 0 }) },
      { type: "S1_ENTRY_OK" },
      { type: "S2_ACCEPTED" },
      { type: "S3_RESPONSE" },
      { type: "S4_DONE" },
      { type: "S5_DONE" },
      { type: "S6_PROPOSE" },
    ];
    for (const event of events) state = presenceReducer(state, event);
    expect(state.state).toBe("S7");
  });

  it("S6 で REWORK → S5 戻り、再 S5_DONE → S6 → PROPOSE → S7", () => {
    let state = presenceReducer({ state: "S6" }, { type: "S6_REWORK" });
    expect(state.state).toBe("S5");
    state = presenceReducer(state, { type: "S5_DONE" });
    expect(state.state).toBe("S6");
    state = presenceReducer(state, { type: "S6_PROPOSE" });
    expect(state.state).toBe("S7");
  });
});

describe("L3-b ④ handoff (S7→S8)", () => {
  it("S7 で S7_DONE → S8", () => {
    const state = presenceReducer({ state: "S7" }, { type: "S7_DONE" });
    expect(state.state).toBe("S8");
  });
});

describe("L3-b ⑤ 退出 → 再起動 (S8→S0→S1)", () => {
  it("EXIT → S8 → RESTART → S0 → 新 signal → S1", () => {
    let state = initialPresenceState();
    state = presenceReducer(state, {
      type: "SIGNAL",
      signal: adaptImplicit({ softScore: 0.5, detectedAt: 0 }),
    });
    expect(state.state).toBe("S1");
    state = presenceReducer(state, { type: "S1_ENTRY_OK" });
    state = presenceReducer(state, { type: "EXIT" });
    expect(state.state).toBe("S8");
    state = presenceReducer(state, { type: "RESTART" });
    expect(state.state).toBe("S0");
    state = presenceReducer(state, {
      type: "SIGNAL",
      signal: adaptImplicit({ softScore: 0.5, detectedAt: 1000 }),
    });
    expect(state.state).toBe("S1");
  });
});

describe("L3-b ⑥ 緊急短縮 (S0→S2 critical、v1.1 §8.4)", () => {
  it("critical signal で S1 スキップ、S0→S2 直接", () => {
    let state = initialPresenceState();
    state = presenceReducer(state, {
      type: "SIGNAL",
      signal: adaptCritical({ trigger: "heat_escalation", detectedAt: 0 }),
    });
    expect(state.state).toBe("S2");
  });
});

describe("L3-b ⑦ 超越 cooldown (intervention_retreat 中の mention)", () => {
  it("intervention_retreat active + mention → cooldownResolver は通す (§6.6.3)", () => {
    let rejection = initialRejectionState();
    rejection = rejectionReducer(rejection, {
      type: "COALTER_RETREAT_REQUESTED",
      at: 0,
    });
    const r = resolveCooldown({
      availability: "active",
      activeCooldowns: flattenCooldowns(rejection),
      fireKind: "mention",
    });
    expect(r.admit).toBe(true); // mention 強制起動は §6.6.3 で許可
  });

  it("intervention_retreat active + chip_response (free_text_reply) → cooldownResolver で棄却", () => {
    let rejection = initialRejectionState();
    rejection = rejectionReducer(rejection, {
      type: "COALTER_RETREAT_REQUESTED",
      at: 0,
    });
    const r = resolveCooldown({
      availability: "active",
      activeCooldowns: flattenCooldowns(rejection),
      fireKind: "chip",
    });
    expect(r.admit).toBe(false);
    expect(r.tier).toBe(3);
  });
});

describe("L3-b 全シナリオ集約", () => {
  it("NORMAL_CYCLE_SCENARIOS は 7 シナリオ含む", () => {
    expect(NORMAL_CYCLE_SCENARIOS).toHaveLength(7);
    const ids = NORMAL_CYCLE_SCENARIOS.map((s) => s.id);
    expect(ids).toContain(SCENARIO_NORMAL.id);
    expect(ids).toContain(SCENARIO_PROPOSAL.id);
    expect(ids).toContain(SCENARIO_HANDOFF.id);
    expect(ids).toContain(SCENARIO_EXIT_RESTART.id);
    expect(ids).toContain(SCENARIO_CRITICAL_SHORTCUT.id);
  });

  it("各シナリオが id / name / description / steps / expectedFinalState を持つ", () => {
    for (const sc of NORMAL_CYCLE_SCENARIOS) {
      expect(typeof sc.id).toBe("string");
      expect(typeof sc.name).toBe("string");
      expect(typeof sc.description).toBe("string");
      expect(Array.isArray(sc.steps)).toBe(true);
      expect(sc.steps.length).toBeGreaterThan(0);
      expect(typeof sc.expectedFinalState).toBe("string");
    }
  });
});
