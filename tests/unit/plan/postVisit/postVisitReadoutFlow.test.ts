// tests/unit/plan/postVisit/postVisitReadoutFlow.test.ts
// 評価OS Stage 1-B: 「答え合わせ保存 → 再読込 → Fit-Arc readout 更新」のデータ経路を実証。
//   PlaceFitArcReadout が refreshSignal で行う処理（store 読込 → buildFitArcReadout）と同一の流れを、
//   flag を mock で ON にして検証（browser 不要・disk 軽）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ★store を実際に動かすため、postVisit flag を ON に mock（FitArc flag とは別・store は postVisit flag を見る）
vi.mock("@/lib/plan/postVisit/postVisitObservation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/plan/postVisit/postVisitObservation")>();
  return { ...actual, isPostVisitCheckEnabled: () => true };
});

import { recordPostVisitObservation, loadPostVisitObservations } from "@/lib/plan/postVisit/postVisitStore";
import { buildPostVisitObservation, type PostVisitResponse } from "@/lib/plan/postVisit/postVisitObservation";
import { buildFitArcReadout } from "@/lib/plan/postVisit/fitArcReadout";

function mockLS() {
  const store: Record<string, string> = {};
  return { getItem: (k: string) => (k in store ? store[k]! : null), setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
}
beforeEach(() => vi.stubGlobal("window", { localStorage: mockLS() }));
afterEach(() => vi.unstubAllGlobals());

const DESC = "テスト場所 / 東山エリア";
function save(response: PostVisitResponse, at: number) {
  recordPostVisitObservation(buildPostVisitObservation({ placeDescriptor: DESC, lens: "focus_work", trigger: "lens_proposed", response, at }));
}
// PlaceFitArcReadout と同じ：store を読み（同一 place に絞り）readout を作る
function readout() {
  return buildFitArcReadout(loadPostVisitObservations());
}

describe("save → 再読込 → readout 更新（PostVisitCheckCard と FitArc の連動データ経路）", () => {
  it("★保存ゼロ → insufficient（断定なし・値 null）", () => {
    expect(readout().state).toBe("insufficient");
    expect(readout().fillPercent).toBeNull();
    expect(readout().observationCount).toBe(0);
  });
  it("★1件保存 → 再読込で tentative（dashed・件数1・「仮説」）", () => {
    save("keep", 1);
    const r = readout();
    expect(r.state).toBe("tentative");
    expect(r.arcStyle).toBe("dashed");
    expect(r.observationCount).toBe(1);
    expect(r.label).toContain("仮説");
  });
  it("★3件保存 → 再読込で observed（solid・件数3・% 確定）", () => {
    save("keep", 1); save("keep", 2); save("keep", 3);
    const r = readout();
    expect(r.state).toBe("observed");
    expect(r.arcStyle).toBe("solid");
    expect(r.observationCount).toBe(3);
    expect(r.fillPercent).toBe(100);
  });
  it("★保存ごとに件数が増え readout が更新される（0→1→2→3）", () => {
    const counts: number[] = [readout().observationCount];
    save("keep", 1); counts.push(readout().observationCount);
    save("conditional", 2); counts.push(readout().observationCount);
    save("not_today", 3); counts.push(readout().observationCount);
    expect(counts).toEqual([0, 1, 2, 3]);
    expect(readout().state).toBe("observed"); // 3件で solid
  });
});
