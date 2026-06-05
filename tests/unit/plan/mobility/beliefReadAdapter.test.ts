import { describe, it, expect } from "vitest";
import { buildModeBelief } from "@/lib/plan/mobility/beliefReadAdapter";
import {
  parseStore,
  SELECTED_MODE_STORE_VERSION,
  type SelectedModeStore,
} from "@/lib/plan/map/selectedModeStore";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

function store(byDay: Record<string, Record<string, RouteTransportMode>>): SelectedModeStore {
  return { version: SELECTED_MODE_STORE_VERSION, byDay };
}
const LEG = "a__b";

describe("buildModeBelief (v0-F-lite belief read adapter)", () => {
  it("履歴なし（空 store）→ empty belief", () => {
    expect(buildModeBelief(store({}), LEG)).toEqual({
      legKey: LEG,
      counts: {},
      total: 0,
      topMode: null,
      topShare: 0,
    });
  });

  it("legKey が store に無い → empty", () => {
    const b = buildModeBelief(store({ "2026-06-01": { x__y: "train" } }), LEG);
    expect(b.total).toBe(0);
    expect(b.topMode).toBeNull();
  });

  it("空 legKey 文字列 → empty", () => {
    expect(buildModeBelief(store({ "2026-06-01": { a__b: "train" } }), "").total).toBe(0);
  });

  it("1日だけ → total 1・topMode=mode・topShare 1", () => {
    const b = buildModeBelief(store({ "2026-06-01": { [LEG]: "train" } }), LEG);
    expect(b.total).toBe(1);
    expect(b.topMode).toBe("train");
    expect(b.topShare).toBe(1);
    expect(b.counts).toEqual({ train: 1 });
  });

  it("複数日 同一 leg（3日 train・dayKey 跨ぎ集計）→ total 3・train 3", () => {
    const b = buildModeBelief(
      store({
        "2026-06-01": { [LEG]: "train" },
        "2026-06-02": { [LEG]: "train" },
        "2026-06-03": { [LEG]: "train" },
      }),
      LEG,
    );
    expect(b.total).toBe(3);
    expect(b.counts).toEqual({ train: 3 });
    expect(b.topMode).toBe("train");
    expect(b.topShare).toBe(1);
  });

  it("分散（train 2・walk 1）→ topMode train・topShare 2/3・counts 両方（alternatives 源）", () => {
    const b = buildModeBelief(
      store({
        "2026-06-01": { [LEG]: "train" },
        "2026-06-02": { [LEG]: "walk" },
        "2026-06-03": { [LEG]: "train" },
      }),
      LEG,
    );
    expect(b.total).toBe(3);
    expect(b.counts).toEqual({ train: 2, walk: 1 });
    expect(b.topMode).toBe("train");
    expect(b.topShare).toBeCloseTo(2 / 3);
  });

  it("unknown は belief から除外（total に数えない）", () => {
    const b = buildModeBelief(
      store({ "2026-06-01": { [LEG]: "train" }, "2026-06-02": { [LEG]: "unknown" } }),
      LEG,
    );
    expect(b.total).toBe(1);
    expect(b.counts).toEqual({ train: 1 });
    expect(b.topMode).toBe("train");
  });

  it("全部 unknown → empty（「いつもは 移動」と言わない）", () => {
    const b = buildModeBelief(
      store({ "2026-06-01": { [LEG]: "unknown" }, "2026-06-02": { [LEG]: "unknown" } }),
      LEG,
    );
    expect(b.total).toBe(0);
    expect(b.topMode).toBeNull();
  });

  it("破損 localStorage（parseStore garbage）→ empty（fail-open）", () => {
    const b = buildModeBelief(parseStore("not a json"), LEG);
    expect(b.total).toBe(0);
    expect(b.topMode).toBeNull();
  });

  it("tie（train 2 / walk 2）→ 決定的 winner（昇順先勝ち=train）・topShare 0.5", () => {
    const b = buildModeBelief(
      store({
        "2026-06-01": { [LEG]: "train" },
        "2026-06-02": { [LEG]: "walk" },
        "2026-06-03": { [LEG]: "train" },
        "2026-06-04": { [LEG]: "walk" },
      }),
      LEG,
    );
    expect(b.total).toBe(4);
    expect(b.topMode).toBe("train");
    expect(b.topShare).toBe(0.5);
  });
});
