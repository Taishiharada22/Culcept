// tests/unit/plan/postVisit/postVisitMetrics.test.ts
// 評価OS Stage 0-C: dogfood 計測 pure helper の検証。
//   funnel 集計（shown/answered/skipped/suppressed/mirror）・主指標 rate・suppress 効きすぎ・
//   redaction 違反検出（0 必須）・Fit-Arc entry 判定（定量 + 定性）・store funnel イベント。
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  computeDogfoodMetrics,
  countRedactionViolations,
  evaluateFitArcEntry,
  FIT_ARC_ENTRY_DEFAULT,
  type DogfoodMetrics,
} from "@/lib/plan/postVisit/postVisitMetrics";
import type { ElicitEvent } from "@/lib/plan/postVisit/postVisitStore";
import type { PostVisitObservation } from "@/lib/plan/postVisit/postVisitObservation";

afterEach(() => vi.unstubAllGlobals());

function ev(outcome: ElicitEvent["outcome"], suppressReason?: ElicitEvent["suppressReason"]): ElicitEvent {
  return { placeKey: "k", at: 1, outcome, ...(suppressReason ? { suppressReason } : {}) };
}
function obs(over: Partial<PostVisitObservation> = {}): PostVisitObservation {
  return { v: 1, placeKey: "pabc123", lens: "focus_work", trigger: "lens_proposed", response: "keep", reasonChips: [], dwellSignal: null, at: 1, ...over };
}

describe("computeDogfoodMetrics — funnel 集計 / 主指標", () => {
  it("★shown/answered/skipped/suppressed/mirror を区別して数える", () => {
    const log = [ev("shown"), ev("shown"), ev("shown"), ev("answered"), ev("skipped"), ev("suppressed", "habitual"), ev("mirror_shown")];
    const m = computeDogfoodMetrics(log, [obs(), obs()]);
    expect(m.promptShown).toBe(3);
    expect(m.answered).toBe(1);
    expect(m.skipped).toBe(1);
    expect(m.suppressed).toBe(1);
    expect(m.mirrorShown).toBe(1);
    expect(m.observations).toBe(2);
  });
  it("★post-decision-observation rate = answered / promptShown（主指標）", () => {
    const log = [ev("shown"), ev("shown"), ev("shown"), ev("shown"), ev("answered"), ev("answered")];
    const m = computeDogfoodMetrics(log, []);
    expect(m.postDecisionObservationRate).toBeCloseTo(0.5);
    expect(m.answerRate).toBeCloseTo(0.5);
  });
  it("★分母0で 0（NaN を出さない）", () => {
    const m = computeDogfoodMetrics([], []);
    expect(m.postDecisionObservationRate).toBe(0);
    expect(m.suppressRate).toBe(0);
  });
  it("★suppress rate = suppressed/(suppressed+shown)・理由別集計", () => {
    const log = [ev("shown"), ev("suppressed", "habitual"), ev("suppressed", "high_fatigue"), ev("suppressed", "habitual")];
    const m = computeDogfoodMetrics(log, []);
    expect(m.suppressRate).toBeCloseTo(3 / 4);
    expect(m.suppressByReason.habitual).toBe(2);
    expect(m.suppressByReason.high_fatigue).toBe(1);
    expect(m.suppressByReason.sensitive).toBe(0);
  });
});

describe("countRedactionViolations — 禁止情報の混入検出（0 必須）", () => {
  it("★正常な観測（whitelist・opaque placeKey）→ 0", () => {
    expect(countRedactionViolations([obs(), obs({ placeKey: "p_unknown" })])).toBe(0);
  });
  it("★非 whitelist キー（生情報）混入 → 違反", () => {
    const dirty = { ...obs(), address: "東京都...", lat: 35.6 } as unknown as PostVisitObservation;
    expect(countRedactionViolations([dirty])).toBe(1);
  });
  it("★placeKey が opaque 形でない（原文漏れ疑い）→ 違反", () => {
    expect(countRedactionViolations([obs({ placeKey: "スターバックス渋谷" })])).toBe(1);
  });
});

describe("evaluateFitArcEntry — Fit-Arc へ進む条件", () => {
  function metrics(over: Partial<DogfoodMetrics> = {}): DogfoodMetrics {
    return {
      promptShown: 30, answered: 10, skipped: 8, suppressed: 5, mirrorShown: 2, observations: 10,
      postDecisionObservationRate: 10 / 30, answerRate: 10 / 30, skipRate: 8 / 30,
      suppressRate: 5 / 35, suppressByReason: { sensitive: 0, home_work: 0, habitual: 5, high_fatigue: 0, after_skip: 0, recent_same: 0 },
      redactionViolations: 0, ...over,
    };
  }
  it("★全定量条件を満たす → quantitativeReady=true", () => {
    const d = evaluateFitArcEntry(metrics());
    expect(d.quantitativeReady).toBe(true);
    expect(d.unmet).toEqual([]);
  });
  it("★redaction 違反があれば即 not ready", () => {
    const d = evaluateFitArcEntry(metrics({ redactionViolations: 1 }));
    expect(d.quantitativeReady).toBe(false);
    expect(d.unmet.join()).toContain("redaction");
  });
  it("★prompt/回答が少ない → not ready", () => {
    const d = evaluateFitArcEntry(metrics({ promptShown: 5, answered: 1 }));
    expect(d.quantitativeReady).toBe(false);
  });
  it("★回答率が低い（邪魔の疑い）→ not ready", () => {
    const d = evaluateFitArcEntry(metrics({ answered: 3, answerRate: 0.1, postDecisionObservationRate: 0.1 }));
    expect(d.quantitativeReady).toBe(false);
    expect(d.unmet.join()).toContain("邪魔");
  });
  it("★suppress が効きすぎ（高 rate）→ not ready", () => {
    const d = evaluateFitArcEntry(metrics({ suppressRate: 0.9 }));
    expect(d.quantitativeReady).toBe(false);
    expect(d.unmet.join()).toContain("効きすぎ");
  });
  it("★観測の鏡が一度も出ていない → not ready", () => {
    const d = evaluateFitArcEntry(metrics({ mirrorShown: 0 }));
    expect(d.quantitativeReady).toBe(false);
  });
  it("★定性条件（人判断）は常に3点提示される", () => {
    const d = evaluateFitArcEntry(metrics());
    expect(d.qualitativeChecks).toHaveLength(3);
    expect(d.qualitativeChecks.join()).toContain("邪魔");
  });
  it("★既定閾値の sanity", () => {
    expect(FIT_ARC_ENTRY_DEFAULT.minAnswered).toBeGreaterThanOrEqual(1);
    expect(FIT_ARC_ENTRY_DEFAULT.maxSuppressRate).toBeLessThanOrEqual(1);
  });
});

describe("store funnel イベント — flag OFF で no-op", () => {
  function mockLS() {
    const store: Record<string, string> = {};
    return { _store: store, getItem: (k: string) => (k in store ? store[k]! : null), setItem: vi.fn((k: string, v: string) => { store[k] = v; }), removeItem: (k: string) => { delete store[k]; } };
  }
  it("★flag OFF: recordPromptShown/Suppressed/MirrorShown は書かない・loadElicitLog は []", async () => {
    const { recordPromptShown, recordPromptSuppressed, recordMirrorShown, loadElicitLog } = await import("@/lib/plan/postVisit/postVisitStore");
    const ls = mockLS();
    vi.stubGlobal("window", { localStorage: ls });
    recordPromptShown("k", 1);
    recordPromptSuppressed("k", "habitual", 1);
    recordMirrorShown("k", 1);
    expect(ls.setItem).not.toHaveBeenCalled();
    expect(loadElicitLog()).toEqual([]);
  });
});
