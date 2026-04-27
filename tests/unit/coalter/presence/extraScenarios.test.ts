/**
 * Stage 3 L3-f / L3-g / L3-h / L3-i — 拡張シナリオ executor 単体検証
 *
 * 各シナリオ定義の構造的整合 + executor 単体での挙動を確認。
 * UI E2E は preview /coalter-preview/full で目視確認。
 */

import { describe, it, expect } from "vitest";

import { MODE_TRANSITION_SCENARIOS } from "@/app/(dev)/coalter-preview/full/scenarios/modeTransitions";
import { MEMORY_SURFACE_SCENARIOS } from "@/app/(dev)/coalter-preview/full/scenarios/memorySurface";
import { URGENT_LAYER_SCENARIOS } from "@/app/(dev)/coalter-preview/full/scenarios/urgentLayer";
import { REJECTION_FLOW_SCENARIOS } from "@/app/(dev)/coalter-preview/full/scenarios/rejectionFlows";

import { modeReducer } from "@/lib/coalter/presence/modeReducer";
import { addMemoryItem, emptyMemoryStore } from "@/lib/coalter/presence/memoryStore";
import {
  rejectionReducer,
  initialRejectionState,
  flattenCooldowns,
} from "@/lib/coalter/presence/rejectionReducer";
import { detectUrgent } from "@/lib/coalter/presence/urgentTrigger";
import {
  checkCoexistence,
} from "@/lib/coalter/presence/urgentMemoryPriority";
import { adaptCritical } from "@/lib/coalter/presence/signalAdapter";

describe("L3-f Mode Transitions — 6 シナリオ", () => {
  it("MODE_TRANSITION_SCENARIOS は 6 件", () => {
    expect(MODE_TRANSITION_SCENARIOS).toHaveLength(6);
  });

  it("⑤ Daily ↔ Travel 直接遷移は state 不変 (modeReducer)", () => {
    expect(
      modeReducer("daily", { type: "MANUAL_SWITCH", target: "travel" }),
    ).toBe("daily");
    expect(
      modeReducer("travel", { type: "MANUAL_SWITCH", target: "daily" }),
    ).toBe("travel");
  });

  it("⑥ 暗黙 signal で AUTO_ESCALATE → 不変 (§11.5 構造的担保)", () => {
    expect(
      modeReducer("normal", {
        type: "AUTO_ESCALATE",
        target: "daily",
        signal: { kind: "implicit", strength: "soft", detectedAt: 0 },
      }),
    ).toBe("normal");
  });
});

describe("L3-g Memory Surface — 6 シナリオ", () => {
  it("MEMORY_SURFACE_SCENARIOS は 6 件", () => {
    expect(MEMORY_SURFACE_SCENARIOS).toHaveLength(6);
  });

  it("④ §8.3.4 禁止組み合わせ生成試行 → throw", () => {
    expect(() =>
      addMemoryItem(emptyMemoryStore(), {
        id: "x",
        content: "test",
        origin: "inferred",
        certainty: "high",
        visibility: "both_visible",
        modeContext: "normal",
        createdAt: 0,
        updatedAt: 0,
      }),
    ).toThrow(/Forbidden/);
  });
});

describe("L3-h Urgent Layer — 8 シナリオ", () => {
  it("URGENT_LAYER_SCENARIOS は 8 件", () => {
    expect(URGENT_LAYER_SCENARIOS).toHaveLength(8);
  });

  it("① dignity critical → category=dignity_violation / form=dominant_card", () => {
    const r = detectUrgent({
      signal: adaptCritical({ trigger: "dignity_violation", detectedAt: 0 }),
      presenceState: "S2",
    });
    expect(r?.category).toBe("dignity_violation");
    expect(r?.form).toBe("dominant_card");
  });

  it("⑦ S7 中の urgent + S7 同居は checkCoexistence で違反 (§8.6.3)", () => {
    const r = checkCoexistence({
      urgentActive: true,
      urgentForm: "overlay_banner",
      presenceState: "S7",
    });
    expect(r.ok).toBe(false);
    expect(r.violationIndex).toBe(4);
  });
});

describe("L3-i Rejection Flows — 6 シナリオ", () => {
  it("REJECTION_FLOW_SCENARIOS は 6 件", () => {
    expect(REJECTION_FLOW_SCENARIOS).toHaveLength(6);
  });

  it("④ 3 拒否の独立性: 3 event 順次発火で 3 slot 独立記録", () => {
    let s = initialRejectionState();
    s = rejectionReducer(s, {
      type: "MODE_ESCALATION_REJECTED",
      rejectedMode: "daily",
      at: 0,
    });
    s = rejectionReducer(s, {
      type: "PROPOSAL_REJECTED",
      theme: "food",
      at: 1,
    });
    s = rejectionReducer(s, {
      type: "COALTER_RETREAT_REQUESTED",
      at: 2,
    });
    expect(s.modeEscalation).toHaveLength(1);
    expect(s.individualProposal).toHaveLength(1);
    expect(s.coalterRetreat).toHaveLength(1);
    expect(flattenCooldowns(s)).toHaveLength(3);
  });

  it("⑤ §6.8 非判定性: state JSON に「failure」「bad」が出現しない", () => {
    let s = initialRejectionState();
    s = rejectionReducer(s, {
      type: "PROPOSAL_REJECTED",
      theme: "movie",
      at: 0,
    });
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/failure/i);
    expect(json).not.toMatch(/"bad"/i);
  });
});

describe("L3-d/e/f/g/h/i 全シナリオ集約 — 41 シナリオ正本性", () => {
  it("Stage 3 拡張シナリオ合計: 7 (L3-b) + 4 + 4 + 6 + 6 + 8 + 6 = 41 (plan §6.10)", () => {
    // 本 test では L3-d 〜 L3-i 分のみ集計 (L3-b は別 test)
    const total =
      4 + // L3-d Daily
      4 + // L3-e Travel
      MODE_TRANSITION_SCENARIOS.length + // L3-f 6
      MEMORY_SURFACE_SCENARIOS.length + // L3-g 6
      URGENT_LAYER_SCENARIOS.length + // L3-h 8
      REJECTION_FLOW_SCENARIOS.length; // L3-i 6
    expect(total).toBe(34); // L3-d/e/f/g/h/i = 34
    // L3-b 7 + 34 = 41 (plan §6.10)
  });
});
