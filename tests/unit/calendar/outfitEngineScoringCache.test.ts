import { vi, describe, it, expect, beforeEach } from "vitest";

// Phase 5-C3: generateDayProposal の scoring cache prime を検証する。
// loadWornHistory / computeRotationProfiles を観測可能にし、 他は real（spread）で壊さない。
const cap = vi.hoisted(() => ({ rotInput: undefined as unknown }));
const loadWornHistorySpy = vi.hoisted(() => vi.fn(() => [] as unknown[]));

vi.mock("@/app/(culcept)/calendar/_lib/rotationTracker", async (orig) => ({
  ...(await orig()),
  loadWornHistory: loadWornHistorySpy,
}));
vi.mock("@/app/(culcept)/calendar/_lib/deepTemporalIntelligence", async (orig) => ({
  ...(await orig()),
  computeRotationProfiles: vi.fn((wh: unknown) => {
    cap.rotInput = wh;
    return [];
  }),
  seasonalPersonalBoost: vi.fn(() => 0),
}));
vi.mock("@/app/(culcept)/calendar/_lib/bidirectionalFeedback", async (orig) => ({
  ...(await orig()),
  loadRejections: vi.fn(() => []),
}));

import { generateDayProposal, clearScoringCache } from "@/app/(culcept)/calendar/_lib/outfitEngine";

const WARDROBE = [
  { id: "t1", categoryMain: "tops", name: "T", color: "#000" },
  { id: "b1", categoryMain: "bottoms", name: "B", color: "#000" },
  { id: "s1", categoryMain: "shoes", name: "S", color: "#000" },
] as unknown as Parameters<typeof generateDayProposal>[0];

function rot(): { date: string; itemIds: string[]; satisfaction: number }[] {
  return [
    { date: "2026-05-01", itemIds: ["t1"], satisfaction: 5 },
    { date: "2026-05-10", itemIds: ["t1"], satisfaction: 2 },
    { date: "2026-05-20", itemIds: ["t1"], satisfaction: 5 },
  ];
}

function run(extOptions: Record<string, unknown>): void {
  generateDayProposal(WARDROBE, "2026-05-29", null, [], [], undefined, null, null, extOptions as never);
}

beforeEach(() => {
  cap.rotInput = undefined;
  loadWornHistorySpy.mockClear();
  loadWornHistorySpy.mockReturnValue([]);
  clearScoringCache();
});

describe("generateDayProposal — Phase 5-C3 scoring cache prime", () => {
  it("rotationRecords あり → injected records で computeRotationProfiles、 loadWornHistory を読まない", () => {
    const r = rot();
    run({ rotationRecords: r });
    expect(cap.rotInput).toBe(r); // prime が injected records を使う
    expect(loadWornHistorySpy).not.toHaveBeenCalled(); // primed cache 経由で localStorage 不読
  });

  it("rotationRecords なし → 現行 loadWornHistory path", () => {
    run({ extWeather: null, comboGraph: null, adaptation: null });
    expect(loadWornHistorySpy).toHaveBeenCalled();
  });

  it("rotationRecords 空 → fallback（loadWornHistory）", () => {
    run({ rotationRecords: [] });
    expect(loadWornHistorySpy).toHaveBeenCalled();
  });

  it("rotationRecords の satisfaction が computeRotationProfiles へ届く", () => {
    run({ rotationRecords: rot() });
    expect((cap.rotInput as Array<{ satisfaction: number }>).map((x) => x.satisfaction)).toEqual([5, 2, 5]);
  });

  it("run 後に cache が clear され、 次 run（rotationRecords なし・同 wardrobe）で loadWornHistory が呼ばれる", () => {
    run({ rotationRecords: rot() });
    loadWornHistorySpy.mockClear();
    run({ extWeather: null, comboGraph: null, adaptation: null }); // 同 WARDROBE 参照・prime なし
    expect(loadWornHistorySpy).toHaveBeenCalled(); // primed cache が漏れていない
  });
});
