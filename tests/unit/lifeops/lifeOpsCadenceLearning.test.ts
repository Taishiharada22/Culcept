/**
 * Life Ops L-9 — 結果→周期更新（cadence 学習・pure）。
 *   median 学習・サンプル不足→null(default維持)・最新完了日・外れ値頑健・personalize override・ループ統合。
 */
import { describe, it, expect } from "vitest";
import {
  learnCadence,
  personalizeCadenceSpec,
  MIN_LEARN_SAMPLES,
  type CompletionEvent,
} from "@/lib/lifeops/cadence-learning";
import { getCadenceSpec, computeCadenceStatus } from "@/lib/lifeops/cadence-model";

function ev(completedAtISO: string): CompletionEvent {
  return { categoryId: "beauty_salon", menu: "cut", completedAtISO };
}

describe("L-9 learnCadence — 個人間隔の学習", () => {
  it("完了3回(gap2・各30日)→ learnedInterval=30・lastCompletedAt=最新・sampleCount=2", () => {
    const r = learnCadence([ev("2026-01-01"), ev("2026-01-31"), ev("2026-03-02")]); // gap 30,30
    expect(r.learnedIntervalDays).toBe(30);
    expect(r.lastCompletedAtISO).toBe("2026-03-02");
    expect(r.sampleCount).toBe(2);
  });
  it("完了2回(gap1)→ null（default維持・捏造しない）", () => {
    const r = learnCadence([ev("2026-01-01"), ev("2026-01-31")]);
    expect(r.learnedIntervalDays).toBeNull();
    expect(r.sampleCount).toBe(1);
    expect(r.lastCompletedAtISO).toBe("2026-01-31"); // 完了日自体は更新
  });
  it("空→ 全 null", () => {
    expect(learnCadence([])).toEqual({ lastCompletedAtISO: null, learnedIntervalDays: null, sampleCount: 0 });
  });
  it("不正 ISO は除外（有効分だけで学習）", () => {
    const r = learnCadence([ev("2026-01-01"), ev("broken"), ev("2026-01-31"), ev("2026-03-02")]);
    expect(r.sampleCount).toBe(2);
    expect(r.learnedIntervalDays).toBe(30);
  });
  it("median は外れ値に頑健（gap 30,30,90 → 30）", () => {
    const r = learnCadence([ev("2026-01-01"), ev("2026-01-31"), ev("2026-03-02"), ev("2026-05-31")]); // 30,30,90
    expect(r.sampleCount).toBe(3);
    expect(r.learnedIntervalDays).toBe(30); // mean(50)でなく median(30)
  });
  it("順不同でも昇順処理（最新=最大日）", () => {
    const r = learnCadence([ev("2026-03-02"), ev("2026-01-01"), ev("2026-01-31")]);
    expect(r.lastCompletedAtISO).toBe("2026-03-02");
    expect(r.learnedIntervalDays).toBe(30);
  });
  it("MIN_LEARN_SAMPLES は 2", () => {
    expect(MIN_LEARN_SAMPLES).toBe(2);
  });
});

describe("L-9 personalizeCadenceSpec — default override", () => {
  const base = getCadenceSpec("beauty_salon", "cut")!; // typical 42
  it("学習間隔ありで typicalIntervalDays を上書き", () => {
    const spec = personalizeCadenceSpec(base, { lastCompletedAtISO: "2026-03-02", learnedIntervalDays: 30, sampleCount: 2 });
    expect(spec.typicalIntervalDays).toBe(30);
    expect(spec.categoryId).toBe("beauty_salon"); // 他は維持
    expect(spec.nearingRatio).toBe(base.nearingRatio);
  });
  it("学習間隔 null は base のまま", () => {
    const spec = personalizeCadenceSpec(base, { lastCompletedAtISO: "2026-01-31", learnedIntervalDays: null, sampleCount: 1 });
    expect(spec).toEqual(base);
  });
});

describe("L-9 ループ統合 — 学習が次回精度に反映", () => {
  it("個人間隔30日学習 → computeCadenceStatus が default(42)と異なる phase を出す", () => {
    const base = getCadenceSpec("beauty_salon", "cut")!; // typical 42
    const learning = learnCadence([ev("2026-01-01"), ev("2026-01-31"), ev("2026-03-02")]); // interval 30
    const personalized = personalizeCadenceSpec(base, learning);
    const now = "2026-04-01"; // last(3/2)から30日
    // 個人間隔30: 30/30=1.0 → beyond_typical（整えどき）
    expect(computeCadenceStatus(personalized, learning.lastCompletedAtISO, now).phase).toBe("beyond_typical");
    // default42: 30/42=0.71 → within_typical（まだ）。学習で判定が変わる＝精度向上
    expect(computeCadenceStatus(base, learning.lastCompletedAtISO, now).phase).toBe("within_typical");
  });
  it("pure（同入力同出力）", () => {
    const h = [ev("2026-01-01"), ev("2026-01-31"), ev("2026-03-02")];
    expect(learnCadence(h)).toEqual(learnCadence(h));
  });
});
