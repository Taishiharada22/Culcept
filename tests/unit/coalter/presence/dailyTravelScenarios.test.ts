/**
 * Stage 3 L3-d / L3-e — Daily / Travel mode E2E シナリオ test
 *
 * plan v0.3 §6.4 / §6.5:
 *   - Daily 4 シナリオ + Travel 4 シナリオ
 *   - 通常モード自動復帰 (§6.5.1)
 *   - Pattern F-2 主 + F-1 副次同伴 (§7.10、Travel S7)
 */

import { describe, it, expect } from "vitest";

import {
  presenceReducer,
  initialPresenceState,
} from "@/lib/coalter/presence/reducer";
import {
  modeReducer,
  initialMode,
} from "@/lib/coalter/presence/modeReducer";
import {
  selectPattern,
  selectSecondaryPattern,
} from "@/lib/coalter/presence/patternSelector";
import { adaptModePromotion } from "@/lib/coalter/presence/signalAdapter";
import { DAILY_MODE_SCENARIOS } from "@/app/(dev)/coalter-preview/full/scenarios/dailyMode";
import { TRAVEL_MODE_SCENARIOS } from "@/app/(dev)/coalter-preview/full/scenarios/travelMode";

describe("L3-d Daily mode 4 シナリオ", () => {
  it("DAILY_MODE_SCENARIOS は 4 シナリオ", () => {
    expect(DAILY_MODE_SCENARIOS).toHaveLength(4);
  });

  it("Daily mode で S7 の primary は F2 (§4.3.8 / §7.12)", () => {
    expect(selectPattern("S7", "daily", { relationshipNoiseHigh: false })).toBe("F2");
  });

  it("Daily mode + relationshipNoiseHigh で secondary=F1 (§7.10 副次同伴)", () => {
    const primary = selectPattern("S7", "daily", { relationshipNoiseHigh: true });
    const secondary = selectSecondaryPattern("S7", "daily", primary, {
      relationshipNoiseHigh: true,
    });
    expect(primary).toBe("F2");
    expect(secondary).toBe("F1");
  });

  it("Daily 自然退出: PLAN_COMPLETE で daily → normal", () => {
    const next = modeReducer("daily", { type: "PLAN_COMPLETE" });
    expect(next).toBe("normal");
  });
});

describe("L3-e Travel mode 4 シナリオ", () => {
  it("TRAVEL_MODE_SCENARIOS は 4 シナリオ", () => {
    expect(TRAVEL_MODE_SCENARIOS).toHaveLength(4);
  });

  it("Travel mode で S7 の primary は F2、secondary は常時 F1 (§7.10 Travel 副次同伴必須)", () => {
    const primary = selectPattern("S7", "travel", {});
    const secondary = selectSecondaryPattern("S7", "travel", primary, {});
    expect(primary).toBe("F2");
    expect(secondary).toBe("F1");
  });

  it("Travel S5 + D 候補 (relationshipSignalsClear=false) → 抑制 (§4.3.6 Travel D 既定優先度低下)", () => {
    expect(
      selectPattern("S5", "travel", {
        oneSidedFatigue: true,
        relationshipSignalsClear: false,
      }),
    ).toBeNull();
  });

  it("Travel S5 + D 候補 (relationshipSignalsClear=true) → D 復活", () => {
    expect(
      selectPattern("S5", "travel", {
        oneSidedFatigue: true,
        relationshipSignalsClear: true,
      }),
    ).toBe("D");
  });

  it("Travel 自然退出: PLAN_COMPLETE で travel → normal", () => {
    const next = modeReducer("travel", { type: "PLAN_COMPLETE" });
    expect(next).toBe("normal");
  });
});

describe("L3-d/e mode promotion + presence 連動", () => {
  it("mode_promotion signal は presence reducer で S0 から S1 へ (S1 経由、§1.5)", () => {
    let state = initialPresenceState();
    state = presenceReducer(state, {
      type: "SIGNAL",
      signal: adaptModePromotion({
        target: "daily",
        source: "mode_tap",
        detectedAt: 0,
      }),
    });
    expect(state.state).toBe("S1");
  });

  it("Daily / Travel mode 中の S0→S1→...→S8 1 サイクル全 9 遷移完走", () => {
    let pState = initialPresenceState();
    let mode = initialMode();

    // mode promotion
    mode = modeReducer(mode, { type: "MANUAL_SWITCH", target: "daily" });
    expect(mode).toBe("daily");

    pState = presenceReducer(pState, {
      type: "SIGNAL",
      signal: adaptModePromotion({
        target: "daily",
        source: "mode_tap",
        detectedAt: 0,
      }),
    });
    expect(pState.state).toBe("S1");

    pState = presenceReducer(pState, { type: "S1_ENTRY_OK" });
    pState = presenceReducer(pState, { type: "S2_ACCEPTED" });
    pState = presenceReducer(pState, { type: "S3_RESPONSE" });
    pState = presenceReducer(pState, { type: "S4_DONE" });
    pState = presenceReducer(pState, { type: "S5_DONE" });
    pState = presenceReducer(pState, { type: "S6_PROPOSE" });
    pState = presenceReducer(pState, { type: "S7_DONE" });
    expect(pState.state).toBe("S8");

    // 自然退出 → 通常モード
    mode = modeReducer(mode, { type: "PLAN_COMPLETE" });
    expect(mode).toBe("normal");
  });
});
