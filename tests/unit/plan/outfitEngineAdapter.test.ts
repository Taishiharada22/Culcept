import { vi, describe, it, expect, beforeEach } from "vitest";

import type { OutfitProposal, TodayProposal } from "@/lib/shared/outfitEngine";
import type { WardrobeItem } from "@/lib/shared/wardrobe";

// facade を mock して、 node テストで本物の engine chain (/calendar/_lib) を読み込まない。
vi.mock("@/lib/shared/outfitEngine", () => ({
  generateTodayProposal: vi.fn(),
}));

import { generateTodayProposal } from "@/lib/shared/outfitEngine";
import {
  generateCalendarOutfitProposal,
  weatherVmToDaily,
  proposalToVM,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitEngineAdapter";

const mockEngine = vi.mocked(generateTodayProposal);

function wItem(p: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return { name: "アイテム", category: "tops", color: "#cccccc", ...p } as WardrobeItem;
}

function makeProposal(over: Partial<OutfitProposal> = {}): OutfitProposal {
  return {
    id: "p1",
    items: [
      wItem({
        id: "i1",
        name: "ネイビージャケット",
        categoryMain: "outer",
        colorHex: "#223355",
        imageUrl: "data:image/png;base64,AAA",
      }),
    ],
    sync: { total: 84, breakdown: {}, band: "good", reasons: [] },
    risks: [],
    reason: "テスト理由",
    moodTag: "きれいめ",
    variant: "main",
    ...over,
  } as unknown as OutfitProposal;
}

function makeToday(mainOver: Partial<OutfitProposal> = {}): TodayProposal {
  return {
    main: makeProposal(mainOver),
    alternatives: [],
    reason: "r",
    weatherSummary: "",
    syncScore: 84,
    confidence: 0.5,
    date: "2026-05-29",
  } as unknown as TodayProposal;
}

const INPUT = {
  wardrobe: [wItem({ id: "i1" })],
  weather: { icon: "☀️", label: "晴れ", tempMax: 26, tempMin: 18, pop: 10 },
  events: [{ event_type: "meeting" as const, event_name: "会議" }],
  date: "2026-05-29",
};

describe("generateCalendarOutfitProposal — fallback (退化ゼロ)", () => {
  beforeEach(() => mockEngine.mockReset());

  it("空 wardrobe → null、 engine を呼ばない", async () => {
    const r = await generateCalendarOutfitProposal({ ...INPUT, wardrobe: [] });
    expect(r).toBeNull();
    expect(mockEngine).not.toHaveBeenCalled();
  });

  it("engine が null → null", async () => {
    mockEngine.mockReturnValue(null);
    expect(await generateCalendarOutfitProposal(INPUT)).toBeNull();
  });

  it("engine が想定外 shape (例外誘発) → null (UI へ漏らさない)", async () => {
    // main はあるが items/sync を欠く → adapter 内アクセスで例外 → catch で null
    mockEngine.mockReturnValue({ main: { id: "x" }, alternatives: [] } as unknown as TodayProposal);
    expect(await generateCalendarOutfitProposal(INPUT)).toBeNull();
  });
});

describe("generateCalendarOutfitProposal — 変換", () => {
  beforeEach(() => mockEngine.mockReset());

  it("TodayProposal → proposals + sync、 imageUrl 保持、 band 直写し", async () => {
    mockEngine.mockReturnValue(makeToday());
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r).not.toBeNull();
    expect(r!.proposals).toHaveLength(1);
    expect(r!.proposals[0].title).toBe("きれいめ"); // moodTag
    expect(r!.proposals[0].syncScore).toBe(84);
    expect(r!.proposals[0].syncBandKey).toBe("good");
    expect(r!.proposals[0].items[0].imageUrl).toBe("data:image/png;base64,AAA");
    expect(r!.sync).toEqual({ score: 84, bandKey: "good", bandLabel: expect.any(String) });
  });

  it("engine に渡す weather は WeatherDaily へ変換され、 events はそのまま渡る", async () => {
    mockEngine.mockReturnValue(makeToday());
    await generateCalendarOutfitProposal(INPUT);
    expect(mockEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        date: "2026-05-29",
        events: [{ event_type: "meeting", event_name: "会議" }],
        weather: expect.objectContaining({
          weather_icon: "sun",
          temp_max: 26,
          temp_min: 18,
          pop_max: 10,
        }),
      }),
    );
  });

  it("main + alternatives を最大 3 件まで proposals 化", async () => {
    mockEngine.mockReturnValue(
      makeToday() && ({
        main: makeProposal({ id: "m" }),
        alternatives: [makeProposal({ id: "a1" }), makeProposal({ id: "a2" }), makeProposal({ id: "a3" })],
        reason: "r",
        weatherSummary: "",
        syncScore: 84,
        confidence: 0.5,
        date: "2026-05-29",
      } as unknown as TodayProposal),
    );
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r!.proposals).toHaveLength(3); // main + 2 alts (cap 3)
  });
});

describe("pure helpers", () => {
  it("weatherVmToDaily: emoji→weather_icon、 null 素通し、 雨は outfit_tag rain", () => {
    expect(weatherVmToDaily(null)).toBeNull();
    expect(weatherVmToDaily({ icon: "🌧️", label: "雨", tempMax: 20, tempMin: 14, pop: 60 })).toEqual(
      expect.objectContaining({ weather_icon: "rain", outfit_tag: "rain", temp_max: 20, pop_max: 60 }),
    );
  });

  it("proposalToVM: moodTag 無し → variant タイトル、 band 直写し", () => {
    const vm = proposalToVM(makeProposal({ moodTag: "", variant: "casual" }));
    expect(vm.title).toBe("リラックス");
    expect(vm.syncBandKey).toBe("good");
    expect(vm.syncScore).toBe(84);
  });
});
