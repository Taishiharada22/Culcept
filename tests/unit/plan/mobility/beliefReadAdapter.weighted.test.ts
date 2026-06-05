import { describe, it, expect } from "vitest";
import { buildModeBelief, buildWeightedModeBelief } from "@/lib/plan/mobility/beliefReadAdapter";
import {
  parseStore,
  SELECTED_MODE_STORE_VERSION,
  type SelectedModeStore,
} from "@/lib/plan/map/selectedModeStore";
import {
  EMPTY_FEEDBACK_STORE,
  parseFeedbackStore,
  HYPOTHESIS_FEEDBACK_SCHEMA_VERSION,
  type HypothesisFeedbackEntry,
  type HypothesisFeedbackStore,
} from "@/lib/plan/mobility/hypothesisFeedbackStore";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

const LEG = "a__b";

function sel(byDay: Record<string, Record<string, RouteTransportMode>>): SelectedModeStore {
  return { version: SELECTED_MODE_STORE_VERSION, byDay };
}
function fb(byDay: Record<string, Record<string, HypothesisFeedbackEntry>>): HypothesisFeedbackStore {
  return { version: HYPOTHESIS_FEEDBACK_SCHEMA_VERSION, byDay };
}
function correction(surfaced: RouteTransportMode, chosen: RouteTransportMode): HypothesisFeedbackEntry {
  return { kind: "explicitCorrection", surfacedMode: surfaced, chosenMode: chosen };
}
function confirmation(mode: RouteTransportMode): HypothesisFeedbackEntry {
  return { kind: "confirmation", surfacedMode: mode, chosenMode: mode };
}

describe("buildWeightedModeBelief (v0-F precision weighting・GPT 必須 12 ケース)", () => {
  // 1
  it("feedback なし → selected 1.0", () => {
    const b = buildWeightedModeBelief(sel({ "2026-06-01": { [LEG]: "train" } }), EMPTY_FEEDBACK_STORE, LEG);
    expect(b.total).toBe(1);
    expect(b.counts).toEqual({ train: 1 });
  });

  // 2
  it("confirmation（一致）→ 1.0（増幅しない）", () => {
    const b = buildWeightedModeBelief(
      sel({ "2026-06-01": { [LEG]: "train" } }),
      fb({ "2026-06-01": { [LEG]: confirmation("train") } }),
      LEG,
    );
    expect(b.total).toBe(1);
    expect(b.counts).toEqual({ train: 1 });
  });

  // 3
  it("explicitCorrection（一致）→ 2.0", () => {
    const b = buildWeightedModeBelief(
      sel({ "2026-06-01": { [LEG]: "walk" } }),
      fb({ "2026-06-01": { [LEG]: correction("train", "walk") } }),
      LEG,
    );
    expect(b.total).toBe(2);
    expect(b.counts).toEqual({ walk: 2 });
  });

  // 4
  it("feedback.chosenMode と最終 mode 不一致 → stale 扱いで 1.0", () => {
    // feedback は walk への訂正だが、最終選択は bus（後で選び直した）→ correction 重みを付けない
    const b = buildWeightedModeBelief(
      sel({ "2026-06-01": { [LEG]: "bus" } }),
      fb({ "2026-06-01": { [LEG]: correction("train", "walk") } }),
      LEG,
    );
    expect(b.total).toBe(1);
    expect(b.counts).toEqual({ bus: 1 });
  });

  // 5 + 6
  it("複数日 weighted count / topMode・topShare・total 算出", () => {
    const b = buildWeightedModeBelief(
      sel({
        "2026-06-01": { [LEG]: "train" }, // selected 1
        "2026-06-02": { [LEG]: "walk" }, // correction 2
        "2026-06-03": { [LEG]: "walk" }, // selected 1
      }),
      fb({ "2026-06-02": { [LEG]: correction("train", "walk") } }),
      LEG,
    );
    expect(b.counts).toEqual({ train: 1, walk: 3 });
    expect(b.total).toBe(4);
    expect(b.topMode).toBe("walk");
    expect(b.topShare).toBe(0.75);
  });

  // 7
  it("unknown は除外（feedback 有無に関わらず）", () => {
    const b = buildWeightedModeBelief(
      sel({ "2026-06-01": { [LEG]: "unknown" }, "2026-06-02": { [LEG]: "train" } }),
      fb({ "2026-06-02": { [LEG]: confirmation("train") } }),
      LEG,
    );
    expect(b.total).toBe(1);
    expect(b.counts).toEqual({ train: 1 });
  });

  // 8
  it("破損 feedback store → fail-open（selected 集計は動く）", () => {
    const b = buildWeightedModeBelief(
      sel({ "2026-06-01": { [LEG]: "train" } }),
      parseFeedbackStore("not a json"),
      LEG,
    );
    expect(b.total).toBe(1);
    expect(b.counts).toEqual({ train: 1 });
  });

  // 9
  it("破損 selectedModeStore → fail-open（empty）", () => {
    const b = buildWeightedModeBelief(
      parseStore("not a json"),
      fb({ "2026-06-01": { [LEG]: correction("train", "walk") } }),
      LEG,
    );
    expect(b.total).toBe(0);
    expect(b.topMode).toBeNull();
  });

  // 10
  it("同日に selected と feedback があっても二重計上しない（1 選択 = 1 加重）", () => {
    const b = buildWeightedModeBelief(
      sel({ "2026-06-01": { [LEG]: "walk" } }),
      fb({ "2026-06-01": { [LEG]: correction("train", "walk") } }),
      LEG,
    );
    // selected(1) + correction(2) を足さない。correction 一致なら 2 のみ。
    expect(b.total).toBe(2);
    expect(b.counts).toEqual({ walk: 2 });
  });

  // 11
  it("confirmation が belief を増幅しすぎない（N confirmation == N selection）", () => {
    const days = {
      "2026-06-01": { [LEG]: "train" as RouteTransportMode },
      "2026-06-02": { [LEG]: "train" as RouteTransportMode },
      "2026-06-03": { [LEG]: "train" as RouteTransportMode },
    };
    const withConfirmations = buildWeightedModeBelief(
      sel(days),
      fb({
        "2026-06-01": { [LEG]: confirmation("train") },
        "2026-06-02": { [LEG]: confirmation("train") },
        "2026-06-03": { [LEG]: confirmation("train") },
      }),
      LEG,
    );
    const withSelectionsOnly = buildWeightedModeBelief(sel(days), EMPTY_FEEDBACK_STORE, LEG);
    expect(withConfirmations).toEqual(withSelectionsOnly);
    expect(withConfirmations.total).toBe(3);
  });

  // 12
  it("explicitCorrection で topMode が変わり得る（uniform=train → weighted=walk）", () => {
    const store = sel({
      "2026-06-01": { [LEG]: "train" },
      "2026-06-02": { [LEG]: "train" },
      "2026-06-03": { [LEG]: "walk" },
      "2026-06-04": { [LEG]: "walk" },
    });
    // uniform（feedback 空）: train 2 / walk 2 → tie → train（昇順先勝ち）
    expect(buildModeBelief(store, LEG).topMode).toBe("train");
    // walk 2 件が訂正 → walk 4 / train 2 → walk へ逆転
    const weighted = buildWeightedModeBelief(
      store,
      fb({
        "2026-06-03": { [LEG]: correction("train", "walk") },
        "2026-06-04": { [LEG]: correction("train", "walk") },
      }),
      LEG,
    );
    expect(weighted.counts).toEqual({ train: 2, walk: 4 });
    expect(weighted.topMode).toBe("walk");
    expect(weighted.topShare).toBeCloseTo(4 / 6);
  });

  // delegate 等価（v0-F-lite 挙動保存）
  it("buildModeBelief は feedback 空の weighted と一致（delegate）", () => {
    const store = sel({ "2026-06-01": { [LEG]: "train" }, "2026-06-02": { [LEG]: "walk" } });
    expect(buildModeBelief(store, LEG)).toEqual(buildWeightedModeBelief(store, EMPTY_FEEDBACK_STORE, LEG));
  });
});
