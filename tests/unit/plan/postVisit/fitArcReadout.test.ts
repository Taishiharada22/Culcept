// tests/unit/plan/postVisit/fitArcReadout.test.ts
// 評価OS Stage 1: Fit-Arc readout pure helper の検証。
//   観測ゼロ=断定しない(empty/null)・少数=dashed/仮説・>=3=observed(solid)・件数は常に同伴・
//   fillRatio は本人回答由来で honest・flag OFF/production hard block・ranking 非依存(決定論)。
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  FIT_ARC_READOUT_ENABLED,
  isFitArcReadoutEnabled,
  buildFitArcReadout,
  FIT_ARC_OBSERVED_MIN,
} from "@/lib/plan/postVisit/fitArcReadout";
import type { PostVisitObservation, PostVisitResponse } from "@/lib/plan/postVisit/postVisitObservation";

afterEach(() => vi.unstubAllEnvs());

function obs(response: PostVisitResponse | null): PostVisitObservation {
  return { v: 1, placeKey: "pk", lens: "focus_work", trigger: "lens_proposed", response, reasonChips: [], dwellSignal: null, at: 1 };
}

describe("flag — dormant / default OFF / production hard block", () => {
  it("★定数 OFF", () => expect(FIT_ARC_READOUT_ENABLED).toBe(false));
  it("★dev でも OFF（const false）", () => { vi.stubEnv("NODE_ENV", "development"); expect(isFitArcReadoutEnabled()).toBe(false); });
  it("★production でも OFF（hard block）", () => { vi.stubEnv("NODE_ENV", "production"); expect(isFitArcReadoutEnabled()).toBe(false); });
});

describe("buildFitArcReadout — 観測不足では断定しない", () => {
  it("★観測ゼロ → insufficient / empty / 値なし(null) / honest かつ温かい前向き文言（断定しない）", () => {
    const r = buildFitArcReadout([]);
    expect(r.state).toBe("insufficient");
    expect(r.arcStyle).toBe("empty");
    expect(r.fillRatio).toBeNull(); // ★値を出さない＝推測しない
    expect(r.fillPercent).toBeNull();
    expect(r.observationCount).toBe(0);
    expect(r.label).toContain("答え合わせ"); // 答え合わせに繋がる前向き文言
    expect(r.label).toContain("見えてきます");
    // ★断定/数値を含まない（観測不足で高精度に見せない）
    expect(r.label).not.toMatch(/\d+%|適合度|高い|低い/);
  });
  it("★未回答(null)は適合に寄与せず・回答ゼロなら insufficient", () => {
    const r = buildFitArcReadout([obs(null), obs(null)]);
    expect(r.state).toBe("insufficient");
    expect(r.observationCount).toBe(0); // 件数=回答済み
    expect(r.fillPercent).toBeNull();
  });
});

describe("buildFitArcReadout — 少数=dashed/仮説、>=3=observed/solid", () => {
  it("★1-2 件 → tentative / dashed / 「まだ仮説」・値は出すが確定でない", () => {
    const r = buildFitArcReadout([obs("keep"), obs("conditional")]);
    expect(r.state).toBe("tentative");
    expect(r.arcStyle).toBe("dashed");
    expect(r.tentative).toBe(true);
    expect(r.label).toContain("仮説");
    expect(r.fillPercent).not.toBeNull();
  });
  it("★>=3 件 → observed / solid / 「あなたの観測 N 件から」", () => {
    const r = buildFitArcReadout([obs("keep"), obs("keep"), obs("conditional")]);
    expect(r.state).toBe("observed");
    expect(r.arcStyle).toBe("solid");
    expect(r.tentative).toBe(false);
    expect(r.label).toContain("あなたの観測");
    expect(FIT_ARC_OBSERVED_MIN).toBe(3);
  });
});

describe("buildFitArcReadout — fillRatio は本人回答由来で honest / 件数常に同伴", () => {
  it("★全 keep → 100% / 全 no_more → 0% / 混在は平均", () => {
    expect(buildFitArcReadout([obs("keep"), obs("keep"), obs("keep")]).fillPercent).toBe(100);
    expect(buildFitArcReadout([obs("no_more"), obs("no_more"), obs("no_more")]).fillPercent).toBe(0);
    const mix = buildFitArcReadout([obs("keep"), obs("no_more"), obs("conditional")]); // (1+0+0.6)/3 ≈ 0.533
    expect(mix.fillPercent).toBe(53);
  });
  it("★observationCount は常に存在（全 state で件数を返す）", () => {
    expect(buildFitArcReadout([]).observationCount).toBe(0);
    expect(buildFitArcReadout([obs("keep")]).observationCount).toBe(1);
    expect(buildFitArcReadout([obs("keep"), obs("keep"), obs("keep"), obs("keep")]).observationCount).toBe(4);
  });
  it("★subtitle は『あなたへの適合』（他者平均でない）", () => {
    expect(buildFitArcReadout([obs("keep")]).subtitle).toBe("あなたへの適合");
  });
  it("★決定論（同入力→同出力・副作用なし・ranking 非依存）", () => {
    const input = [obs("keep"), obs("conditional"), obs("not_today")];
    expect(buildFitArcReadout(input)).toEqual(buildFitArcReadout(input));
  });
});

describe("UI 配線 import smoke", () => {
  it("★FitArcReadout component が解決・export される", async () => {
    const mod = await import("@/app/(culcept)/plan/components/FitArcReadout");
    expect(typeof mod.FitArcReadout).toBe("function");
  });
  it("★PlaceFitArcReadout(connected) が解決・export される", async () => {
    const mod = await import("@/app/(culcept)/plan/components/PlaceFitArcReadout");
    expect(typeof mod.PlaceFitArcReadout).toBe("function");
  });
  it("★LocationDetailSheet が解決（FitArc 配線を含む）", async () => {
    const mod = await import("@/app/(culcept)/calendar/_components/travel/locationNotes/LocationDetailSheet");
    expect(typeof mod.LocationDetailSheet).toBe("function");
  });
});
