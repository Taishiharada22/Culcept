/**
 * v0 全体ループ integration smoke（A〜I）— 実モジュール経由・mock localStorage round-trip。
 *
 * unit test は各部品を個別検証する。本 test は「仮説→選択→feedback→belief 反映」のループを
 * 実 load/save/guidance を通して**通し**で検証する（決定的・恒久回帰ガード）。
 * 各シナリオ名は CEO smoke checklist A〜I に対応。
 */
import { beforeEach, describe, it, expect } from "vitest";
import { saveSelectedMode } from "@/lib/plan/map/selectedModeStore";
import {
  buildFeedbackEntry,
  saveHypothesisFeedback,
  loadHypothesisFeedback,
} from "@/lib/plan/mobility/hypothesisFeedbackStore";
import { loadWeightedModeBelief } from "@/lib/plan/mobility/beliefReadAdapter";
import { resolveMobilityGuidance } from "@/lib/plan/mobility/mobilityGuidance";
import type { RouteTransportMode } from "@/lib/plan/map/routeMode";

// --- mock localStorage（環境非依存で強制注入）---
class MemStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  key(i: number): string | null {
    return Array.from(this.m.keys())[i] ?? null;
  }
}
beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemStorage(),
    writable: true,
    configurable: true,
  });
});

const LEG = "homeA__workB";

/** 未選択日（=今日）から leg を見たときの guidance。selectedMode null = 仮説評価対象。 */
function viewGuidance(
  legKey: string,
  opts?: { readOnly?: boolean; sensitive?: boolean },
) {
  return resolveMobilityGuidance({
    belief: loadWeightedModeBelief(legKey),
    selectedMode: null,
    readOnly: opts?.readOnly ?? false,
    sensitive: opts?.sensitive ?? false,
    recallMode: null,
  });
}
function seedSelected(day: string, mode: RouteTransportMode): void {
  saveSelectedMode(day, LEG, mode);
}
/** 仮説 surfaced に対し chosen を選んだ訂正を 1 日分記録（selected + feedback 両 store）。 */
function seedCorrection(day: string, surfaced: RouteTransportMode, chosen: RouteTransportMode): void {
  saveSelectedMode(day, LEG, chosen);
  saveHypothesisFeedback(
    day,
    LEG,
    buildFeedbackEntry({ surfacedMode: surfaced, chosenMode: chosen, readOnly: false }),
  );
}

describe("v0 loop integration smoke (A〜I)", () => {
  it("A: train 履歴で『いつもは電車』が surface する", () => {
    seedSelected("2026-06-01", "train");
    seedSelected("2026-06-02", "train");
    seedSelected("2026-06-03", "train");
    const g = viewGuidance(LEG);
    expect(g.hypothesisCopy?.surface).toBe(true);
    expect(g.surfacedMode).toBe("train");
    expect(g.hypothesisCopy?.headline).toContain("電車");
    expect(g.hypothesisCopy?.headline).toContain("いつもは");
    expect(g.recallMode).toBeNull(); // recall と hypothesis は重複させない
  });

  it("B: 仮説に徒歩を選ぶと explicitCorrection が保存される", () => {
    seedSelected("2026-06-01", "train");
    seedSelected("2026-06-02", "train");
    seedSelected("2026-06-03", "train");
    const surfaced = viewGuidance(LEG).surfacedMode; // "train"
    // 今日 徒歩を選択 → 現在選択 walk + feedback 記録
    saveSelectedMode("2026-06-05", LEG, "walk");
    saveHypothesisFeedback(
      "2026-06-05",
      LEG,
      buildFeedbackEntry({ surfacedMode: surfaced, chosenMode: "walk", readOnly: false }),
    );
    expect(loadHypothesisFeedback("2026-06-05", LEG)).toEqual({
      kind: "explicitCorrection",
      surfacedMode: "train",
      chosenMode: "walk",
    });
  });

  it("C: train/walk が拮抗したら沈黙する（split guard）", () => {
    seedSelected("2026-06-01", "train");
    seedSelected("2026-06-02", "train");
    seedSelected("2026-06-03", "train");
    seedCorrection("2026-06-04", "train", "walk");
    seedCorrection("2026-06-06", "train", "walk");
    const belief = loadWeightedModeBelief(LEG);
    expect(belief.counts).toEqual({ train: 3, walk: 4 }); // 加重: walk 2 件 ×2
    expect(belief.topShare).toBeCloseTo(4 / 7); // 0.57 < 0.6
    const g = viewGuidance(LEG);
    expect(g.hypothesisCopy).toBeNull(); // 拮抗 → 断定しない
    expect(g.surfacedMode).toBeNull();
  });

  it("D: correction が積もったら『いつもは徒歩』に遷移する", () => {
    seedSelected("2026-06-01", "train");
    seedSelected("2026-06-02", "train");
    seedSelected("2026-06-03", "train");
    seedCorrection("2026-06-04", "train", "walk");
    seedCorrection("2026-06-06", "train", "walk");
    seedCorrection("2026-06-07", "train", "walk");
    const belief = loadWeightedModeBelief(LEG);
    expect(belief.counts).toEqual({ train: 3, walk: 6 }); // walk 3 件 ×2
    expect(belief.topMode).toBe("walk");
    expect(belief.topShare).toBeCloseTo(6 / 9); // 0.67 ≥ 0.6
    const g = viewGuidance(LEG);
    expect(g.hypothesisCopy?.surface).toBe(true);
    expect(g.surfacedMode).toBe("walk");
    expect(g.hypothesisCopy?.headline).toContain("徒歩");
  });

  it("E: confirmation は記録されるが belief を増幅しない", () => {
    for (const d of ["2026-06-01", "2026-06-02", "2026-06-03"]) {
      saveSelectedMode(d, LEG, "train");
      saveHypothesisFeedback(
        d,
        LEG,
        buildFeedbackEntry({ surfacedMode: "train", chosenMode: "train", readOnly: false }),
      );
    }
    // 記録される
    expect(loadHypothesisFeedback("2026-06-01", LEG)?.kind).toBe("confirmation");
    // 増幅しない: confirmation weight 1 = selected と同じ → train 3（plain 選択と同値）
    const belief = loadWeightedModeBelief(LEG);
    expect(belief.counts).toEqual({ train: 3 });
    expect(belief.total).toBe(3);
  });

  it("F: cold-start（履歴ゼロ）は沈黙する", () => {
    const g = viewGuidance("fresh__leg");
    expect(g.hypothesisCopy).toBeNull();
    expect(g.surfacedMode).toBeNull();
  });

  it("G: sensitive は沈黙・非記録", () => {
    seedSelected("2026-06-01", "train");
    seedSelected("2026-06-02", "train");
    seedSelected("2026-06-03", "train");
    const g = viewGuidance(LEG, { sensitive: true });
    expect(g.hypothesisCopy).toBeNull(); // 沈黙
    expect(g.surfacedMode).toBeNull();
    // surfacedMode null → 選んでも feedback 記録なし
    expect(
      buildFeedbackEntry({ surfacedMode: g.surfacedMode, chosenMode: "walk", readOnly: false }),
    ).toBeNull();
  });

  it("H: readOnly/done は沈黙・非記録", () => {
    seedSelected("2026-06-01", "train");
    seedSelected("2026-06-02", "train");
    seedSelected("2026-06-03", "train");
    const g = viewGuidance(LEG, { readOnly: true });
    expect(g.hypothesisCopy).toBeNull(); // 沈黙
    expect(g.surfacedMode).toBeNull();
    // readOnly → 選んでも feedback 記録なし
    expect(
      buildFeedbackEntry({ surfacedMode: "train", chosenMode: "walk", readOnly: true }),
    ).toBeNull();
  });

  it("I: stale feedback（chosenMode≠最終mode）は重み付けに使われない", () => {
    // feedback は walk への訂正だが、最終選択は bus（後で選び直した）
    saveSelectedMode("2026-06-01", LEG, "bus");
    saveHypothesisFeedback("2026-06-01", LEG, {
      kind: "explicitCorrection",
      surfacedMode: "train",
      chosenMode: "walk",
    });
    const belief = loadWeightedModeBelief(LEG);
    expect(belief.counts).toEqual({ bus: 1 }); // weight 2 でなく 1（stale）
    expect(belief.total).toBe(1);
  });
});
