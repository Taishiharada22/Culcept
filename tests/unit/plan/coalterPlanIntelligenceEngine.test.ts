import { describe, it, expect } from "vitest";

import { COALTER_PLAN_SESSION_FIXTURES } from "@/app/(culcept)/plan/tabs/coalter/coalterPlanSessionFixture";
import { coalterSessionToTravelEvents } from "@/app/(culcept)/plan/tabs/coalter/coalterSessionToTravelEvents";
import { buildPlanIntelligenceLiveVM } from "@/app/(culcept)/plan/tabs/coalter/planIntelligenceLiveViewModel";
import { buildTravelPlanDisplayResult } from "@/lib/shared/travel/travel-plan-display-adapter";

const PROD = { fixtureAllowed: false } as const;

describe("C6-A-1 CoAlter proposal engine live（fixture→events→engine→VM）", () => {
  it("TRAVEL: conditions が engineHint 経由で events に載る（destination/window/pace/mobility/budget/descriptor）", () => {
    const input = coalterSessionToTravelEvents(COALTER_PLAN_SESSION_FIXTURES.travel);
    const kinds = input.events.map((e) => e.kind);
    expect(kinds).toContain("destination_input"); // 箱根
    expect(kinds).toContain("selected_plan_window"); // 1泊2日
    expect(kinds).toContain("pace_input"); // t-pace（ゆっくり出発）
    expect(kinds).toContain("mobility_input"); // t-move
    expect(kinds).toContain("budget_input"); // t-budget
    expect(kinds).toContain("descriptor_input"); // t-onsen（温泉）
    expect(input.participantIds).toEqual(["kento", "mio"]);
  });

  it("TRAVEL: engine が ready で候補とおすすめを返し、pace 衝突で active を外す（透明性）", () => {
    const input = coalterSessionToTravelEvents(COALTER_PLAN_SESSION_FIXTURES.travel);
    const result = buildTravelPlanDisplayResult(input, PROD);
    const vm = buildPlanIntelligenceLiveVM(result);

    expect(vm.status).toBe("ready");
    if (vm.status !== "ready") return;
    expect(vm.candidates.length).toBeGreaterThan(0);
    // pace=slow（ゆっくり出発）→ active(intense) は paceFit conflict で却下される＝「なぜ外したか」が live で出る
    expect(vm.rejected.some((r) => r.angle === "active")).toBe(true);
    // 1 案がおすすめに選ばれる
    expect(vm.decision.recommendedProposalId).not.toBeNull();
    // 候補のどれかが recommended フラグ
    expect(vm.candidates.some((c) => c.recommended)).toBe(true);
  });

  it("DAILY: engine が ready で候補を返す", () => {
    const input = coalterSessionToTravelEvents(COALTER_PLAN_SESSION_FIXTURES.daily);
    const result = buildTravelPlanDisplayResult(input, PROD);
    const vm = buildPlanIntelligenceLiveVM(result);
    expect(vm.status).toBe("ready");
    if (vm.status !== "ready") return;
    expect(vm.candidates.length).toBeGreaterThan(0);
  });

  it("予算表示はバッジも本文も万円へ整形（生値「49999」を一切出さない・カード内不整合なし）", () => {
    const input = coalterSessionToTravelEvents(COALTER_PLAN_SESSION_FIXTURES.travel);
    const result = buildTravelPlanDisplayResult(input, PROD);
    const vm = buildPlanIntelligenceLiveVM(result);
    if (vm.status !== "ready") return;
    const labels = vm.candidates.map((c) => c.budgetBandLabel).filter((l): l is string => l !== null);
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      expect(l).toMatch(/^〜[\d.]+万円$|^〜[\d,]+円$/); // バッジ: 万円 or 3 桁区切り円
      expect(l).toContain("万円");
    }
    // 本文（why prose）にも生値を残さない（バッジ「〜5万円」と本文「~49999円」の不整合を防ぐ）。
    for (const c of vm.candidates) {
      expect(c.why).not.toContain("49999");
      if (c.why.includes("予算")) expect(c.why).toContain("万円");
    }
  });

  it("private leak なし: display 候補は shared 説明のみ（forParticipant / raw rationale を持たない＝M5）", () => {
    const input = coalterSessionToTravelEvents(COALTER_PLAN_SESSION_FIXTURES.travel);
    const result = buildTravelPlanDisplayResult(input, PROD);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    const display = result.display.proposalsDisplay;
    expect(display).toBeDefined();
    for (const p of display?.proposals ?? []) {
      const rec = p as unknown as Record<string, unknown>;
      expect(rec.forParticipant).toBeUndefined(); // 本人 private 説明は構造的に存在しない
      expect(rec.rationale).toBeUndefined(); // raw ViewerScopedRationale も持たない（whyShared のみ）
      expect(typeof p.whyShared).toBe("string");
    }
  });

  it("物理は未確定（捏造しない）: VM は walkKm/returnEta/座標を持たず、未確定を明示する", () => {
    const input = coalterSessionToTravelEvents(COALTER_PLAN_SESSION_FIXTURES.travel);
    const result = buildTravelPlanDisplayResult(input, PROD);
    const vm = buildPlanIntelligenceLiveVM(result);
    if (vm.status !== "ready") return;
    expect(vm.physical.resolved).toBe(false);
    expect(vm.physical.note.length).toBeGreaterThan(0);
    for (const c of vm.candidates) {
      const rec = c as unknown as Record<string, unknown>;
      expect(rec.walkKm).toBeUndefined();
      expect(rec.returnEta).toBeUndefined();
      expect(rec.route).toBeUndefined();
    }
  });

  it("engineHint 不在の condition は events に渡さない（honest: 扱えない意味を捏造しない）", () => {
    // 全 condition から engineHint を外した session → conditions 由来 event は 0（destination/window のみ）
    const base = COALTER_PLAN_SESSION_FIXTURES.travel;
    const stripped = {
      ...base,
      conditions: base.conditions.map((c) => ({ ...c, engineHint: undefined })),
    };
    const input = coalterSessionToTravelEvents(stripped);
    const conditionKinds = input.events
      .map((e) => e.kind)
      .filter((k) => k !== "destination_input" && k !== "selected_plan_window");
    expect(conditionKinds).toEqual([]);
  });
});
