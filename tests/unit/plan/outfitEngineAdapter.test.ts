import { vi, describe, it, expect, beforeEach } from "vitest";

import type { OutfitProposal, TodayProposal } from "@/lib/shared/outfitEngine";
import type { WardrobeItem } from "@/lib/shared/wardrobe";

// facade を mock して、 node テストで本物の engine chain (/calendar/_lib) を読み込まない。
vi.mock("@/lib/shared/outfitEngine", () => ({
  generateTodayProposal: vi.fn(),
}));

// 5-C2: flag + builder を mock（既定 flag off → 既存テストは現行 path のまま）。
const { flagFn, builderFn } = vi.hoisted(() => ({
  flagFn: vi.fn((): boolean => false),
  builderFn: vi.fn(),
}));
vi.mock("@/lib/shared/wornHistory", () => ({
  WORN_HISTORY_FLAGS: { engineReadsCorpus: flagFn },
  buildWornHistoryEngineInput: builderFn,
}));

import { generateTodayProposal } from "@/lib/shared/outfitEngine";
import {
  generateCalendarOutfitProposal,
  weatherVmToDaily,
  proposalToVM,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitEngineAdapter";

const mockEngine = vi.mocked(generateTodayProposal);

// 全テスト共通: flag 既定 off・builder 既定 null（既存テストは現行 path を維持）。
beforeEach(() => {
  flagFn.mockReset();
  flagFn.mockReturnValue(false);
  builderFn.mockReset();
  builderFn.mockResolvedValue(null);
});

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

  it("TodayProposal → proposals + sync、 imageUrl 保持、 band 直写し (D1-2: 常に 3 件・main は中央 [1])", async () => {
    mockEngine.mockReturnValue(makeToday());
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r).not.toBeNull();
    expect(r!.proposals).toHaveLength(3); // D1-2: ensureThreeProposals で常に 3 件
    // main は中央 (proposals[1]) に配置（CEO 補正: OutfitCarousel.initialIndex=1 for count=3）
    expect(r!.proposals[1].title).toBe("きれいめ"); // moodTag (元 main)
    expect(r!.proposals[1].syncScore).toBe(84);
    expect(r!.proposals[1].syncBandKey).toBe("good");
    expect(r!.proposals[1].items[0].imageUrl).toBe("data:image/png;base64,AAA");
    expect(r!.sync).toEqual({ score: 84, bandKey: "good", bandLabel: expect.any(String) });
    // D1-2: source は engine（alternatives なしなので engine_padded）
    expect(r!.source).toBe("engine_padded");
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

  it("main + alternatives を最大 3 件まで proposals 化（D1-2: main は中央 [1]）", async () => {
    // 各 alt の id を main と異なる items にして、 mock pad に置換されないようにする
    mockEngine.mockReturnValue(
      makeToday() && ({
        main: makeProposal({ id: "main-1" }),
        alternatives: [
          makeProposal({
            id: "casual-2",
            items: [wItem({ id: "alt2-i1", categoryMain: "tops" })],
          }),
          makeProposal({
            id: "dressy-3",
            items: [wItem({ id: "alt3-i1", categoryMain: "tops" })],
          }),
          makeProposal({
            id: "rain-4",
            items: [wItem({ id: "alt4-i1", categoryMain: "tops" })],
          }),
        ],
        reason: "r",
        weatherSummary: "",
        syncScore: 84,
        confidence: 0.5,
        date: "2026-05-29",
      } as unknown as TodayProposal),
    );
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r!.proposals).toHaveLength(3); // main + 2 alts (cap 3)
    expect(r!.proposals[1].id).toBe("main-1"); // 中央 = main
    // 端 (relaxed/smart) は engine alternatives から採用される（mock pad ではない）
    expect(r!.proposals[0].id).toBe("casual-2"); // relaxed = casual variant 優先
    expect(r!.proposals[2].id).toBe("dressy-3"); // smart = dressy variant 優先
    expect(r!.source).toBe("engine"); // 全部 engine 由来
  });
});

describe("generateCalendarOutfitProposal — D1-2 ensureThreeProposals 結線", () => {
  beforeEach(() => mockEngine.mockReset());

  it("Tier A: engine が main + casual + dressy → source=engine, proposals[1]=main", async () => {
    mockEngine.mockReturnValue({
      main: makeProposal({ id: "main-1" }),
      alternatives: [
        makeProposal({
          id: "casual-2",
          items: [wItem({ id: "c-i1", categoryMain: "tops" })],
        }),
        makeProposal({
          id: "dressy-3",
          items: [wItem({ id: "d-i1", categoryMain: "tops" })],
        }),
      ],
      reason: "r",
      weatherSummary: "",
      syncScore: 84,
      confidence: 0.5,
      date: "2026-05-29",
    } as unknown as TodayProposal);
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r).not.toBeNull();
    expect(r!.proposals).toHaveLength(3);
    expect(r!.proposals[1].id).toBe("main-1");
    expect(r!.source).toBe("engine");
  });

  it("Tier B: engine main のみ → source=engine_padded、 mock pad で 3 件、 main は中央", async () => {
    mockEngine.mockReturnValue({
      main: makeProposal({ id: "main-only" }),
      alternatives: [],
      reason: "r",
      weatherSummary: "",
      syncScore: 84,
      confidence: 0.5,
      date: "2026-05-29",
    } as unknown as TodayProposal);
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r).not.toBeNull();
    expect(r!.proposals).toHaveLength(3);
    expect(r!.proposals[1].id).toBe("main-only");
    expect(r!.source).toBe("engine_padded");
    // 端は mock pad（id は "mock-outfit-*-pad-*" 形式）
    expect(r!.proposals[0].id).toMatch(/mock-outfit-.*-pad/);
    expect(r!.proposals[2].id).toMatch(/mock-outfit-.*-pad/);
  });

  it("engine 提案が wardrobe item を持つ場合、 swap-by-axis で派生が作られる（mock pad ではない）", async () => {
    // INPUT.wardrobe は wItem({id:"i1",categoryMain:"outer",...}) 1 件のみ。
    // 同カテゴリの swap 候補が無いので、 swap-by-axis は失敗 → mock pad に降りる。
    // → 本テストは「wardrobe 1 件では padded になる」既存挙動を回帰固定する。
    mockEngine.mockReturnValue({
      main: makeProposal({ id: "main-1", items: [wItem({ id: "i1", categoryMain: "outer" })] }),
      alternatives: [],
      reason: "r",
      weatherSummary: "",
      syncScore: 84,
      confidence: 0.5,
      date: "2026-05-29",
    } as unknown as TodayProposal);
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r!.source).toBe("engine_padded");
    expect(r!.proposals[1].id).toBe("main-1");
  });

  it("source は型上 engine | engine_padded のみ（hydrated_mock / mock は caller 側で）", async () => {
    mockEngine.mockReturnValue(makeToday());
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(["engine", "engine_padded"]).toContain(r!.source);
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

describe("generateCalendarOutfitProposal — 5-C2 gated injection（flag 既定 off）", () => {
  beforeEach(() => {
    mockEngine.mockReset();
    mockEngine.mockReturnValue(makeToday());
  });

  it("flag false → builder を呼ばず、 facade に wornHistoryInput を渡さない", async () => {
    flagFn.mockReturnValue(false);
    await generateCalendarOutfitProposal(INPUT);
    expect(builderFn).not.toHaveBeenCalled();
    expect(mockEngine).toHaveBeenCalledWith(
      expect.not.objectContaining({ wornHistoryInput: expect.anything() }),
    );
  });

  it("flag true → knownWardrobeIds から builder を呼び、 bundle を facade へ渡す", async () => {
    flagFn.mockReturnValue(true);
    const bundle = {
      learningRecords: [{ date: "2026-05-29", itemIds: ["i1"], satisfaction: 5 as const }],
      recencyRecords: [],
    };
    builderFn.mockResolvedValue(bundle);
    await generateCalendarOutfitProposal(INPUT);
    expect(builderFn).toHaveBeenCalledWith({ knownWardrobeIds: ["i1"] });
    expect(mockEngine).toHaveBeenCalledWith(expect.objectContaining({ wornHistoryInput: bundle }));
  });

  it("flag true + builder null → old path fallback（wornHistoryInput 無し）", async () => {
    flagFn.mockReturnValue(true);
    builderFn.mockResolvedValue(null);
    await generateCalendarOutfitProposal(INPUT);
    expect(builderFn).toHaveBeenCalled();
    expect(mockEngine).toHaveBeenCalledWith(
      expect.not.objectContaining({ wornHistoryInput: expect.anything() }),
    );
  });
});
