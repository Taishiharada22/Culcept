import { vi, describe, it, expect, beforeEach } from "vitest";

import type { OutfitProposal, TodayProposal } from "@/lib/shared/outfitEngine";
import type { WardrobeItem } from "@/lib/shared/wardrobe";

/**
 * D2-3 — engine が返した bag/accessory が adapter → 3 候補 helper → VM まで
 *        無改修で通り抜けることを end-to-end で固定する。
 *
 * 補正 1 反映: mock 対象の path は `outfitEngineAdapter.ts` で確認した実値
 *              `"@/lib/shared/outfitEngine"`（既存 outfitEngineAdapter.test.ts と同一）を使う。
 *              dynamic import （`await import("@/lib/shared/outfitEngine")`）も同 path で解決する。
 * 補正 2 反映: 日本語 label は adapter の `CATEGORY_MAIN_JA` で確認した実値
 *              bag → "バッグ" / accessory → "小物" を固定（推測ではなく audit 結果）。
 *
 * 実装変更ゼロを想定: adapter は wardrobeItemToVM + CATEGORY_MAIN_JA で既に bag/accessory に対応済、
 * ensureThreeProposals は id 対称差で diff を取るため bag/accessory が増えても破綻しない、
 * OutfitCollage は OutfitSlot に bag/accessory を完備（D2-0 監査済）。 test only で fix する。
 */

// ── 実 import path と一致した mock（補正 1）─────────────
vi.mock("@/lib/shared/outfitEngine", () => ({
  generateTodayProposal: vi.fn(),
}));

// flag (5-C2) を既定 off に固定（既存 outfitEngineAdapter.test.ts と同方針）
const { flagFn, builderFn } = vi.hoisted(() => ({
  flagFn: vi.fn((): boolean => false),
  builderFn: vi.fn(),
}));
vi.mock("@/lib/shared/wornHistory", () => ({
  WORN_HISTORY_FLAGS: { engineReadsCorpus: flagFn },
  buildWornHistoryEngineInput: builderFn,
}));

import { generateTodayProposal } from "@/lib/shared/outfitEngine";
import { generateCalendarOutfitProposal } from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitEngineAdapter";

const mockEngine = vi.mocked(generateTodayProposal);

// ── factories ───────────────────────────────────────────

function w(p: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return {
    name: p.id,
    category: "tops",
    color: "#000",
    ...p,
  } as WardrobeItem;
}

function bagItem(id: string, extras: Partial<WardrobeItem> = {}): WardrobeItem {
  return w({ id, name: id, categoryMain: "bag", colorHex: "#6b5848", ...extras });
}

function accessoryItem(id: string, extras: Partial<WardrobeItem> = {}): WardrobeItem {
  return w({ id, name: id, categoryMain: "accessory", colorHex: "#cccccc", ...extras });
}

function makeProposal(
  id: string,
  items: WardrobeItem[],
  over: Partial<OutfitProposal> = {},
): OutfitProposal {
  // tsc 直接 cast を避け、 unknown 経由でテスト用 minimal shape を作る（実 SyncScore に依存しない）
  const sync = { total: 80, band: "good", break_down: {} } as unknown as OutfitProposal["sync"];
  return {
    id,
    items,
    sync,
    risks: [],
    reason: "test",
    moodTag: "",
    variant: id.startsWith("main") ? "main" : id.startsWith("casual") ? "casual" : "dressy",
    ...over,
  } as OutfitProposal;
}

function makeTodayProposal(
  main: OutfitProposal,
  alternatives: OutfitProposal[] = [],
): TodayProposal {
  return {
    main,
    alternatives,
    reason: "test",
    weatherSummary: "",
    syncScore: main.sync.total,
    confidence: 0.5,
    date: "2026-06-15",
  } as unknown as TodayProposal;
}

const TOP = w({ id: "t1", categoryMain: "tops", colorHex: "#aaa" });
const BOTTOM = w({ id: "b1", categoryMain: "bottoms", colorHex: "#333" });
const SHOES = w({ id: "s1", categoryMain: "shoes", colorHex: "#222" });

// adapter input にも wardrobe を渡す（empty wardrobe → 早期 null を回避）
const INPUT_WARDROBE = [TOP, BOTTOM, SHOES, bagItem("bag-in-pool"), accessoryItem("acc-in-pool")];

const INPUT = {
  wardrobe: INPUT_WARDROBE,
  weather: null,
  events: [],
  date: "2026-06-15",
};

beforeEach(() => {
  mockEngine.mockReset();
  flagFn.mockReset();
  flagFn.mockReturnValue(false);
  builderFn.mockReset();
  builderFn.mockResolvedValue(null);
});

// ── D2-3 要件 ─────────────────────────────────────────

describe("D2-3 — engine が bag/accessory を返したら adapter VM に残る", () => {
  it("① engine main に bag が含まれる → adapter VM proposals[1].items に bag が残る、 category label = 実値 'バッグ'", async () => {
    const mainBag = bagItem("bag-1");
    const main = makeProposal("main-1", [TOP, BOTTOM, SHOES, mainBag]);
    mockEngine.mockReturnValue(makeTodayProposal(main));
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r).not.toBeNull();
    // main は中央 (proposals[1]) に維持される
    const centerItems = r!.proposals[1].items;
    const bagVM = centerItems.find((i) => i.id === "bag-1");
    expect(bagVM).toBeDefined();
    // 補正 2: 推測でなく adapter の CATEGORY_MAIN_JA で確認した実値
    expect(bagVM!.category).toBe("バッグ");
  });

  it("② engine main に accessory が含まれる → VM に残る、 label = 実値 '小物'", async () => {
    const mainAcc = accessoryItem("acc-1");
    const main = makeProposal("main-2", [TOP, BOTTOM, SHOES, mainAcc]);
    mockEngine.mockReturnValue(makeTodayProposal(main));
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r).not.toBeNull();
    const accVM = r!.proposals[1].items.find((i) => i.id === "acc-1");
    expect(accVM).toBeDefined();
    expect(accVM!.category).toBe("小物");
  });

  it("③ bag/accessory の imageUrl が失われない（VM に保持される）", async () => {
    const bagImg = "data:image/png;base64,BAG";
    const accImg = "data:image/png;base64,ACC";
    const mainBag = bagItem("bag-img", { imageUrl: bagImg });
    const mainAcc = accessoryItem("acc-img", { imageUrl: accImg });
    const main = makeProposal("main-3", [TOP, BOTTOM, SHOES, mainBag, mainAcc]);
    mockEngine.mockReturnValue(makeTodayProposal(main));
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r).not.toBeNull();
    const center = r!.proposals[1].items;
    expect(center.find((i) => i.id === "bag-img")!.imageUrl).toBe(bagImg);
    expect(center.find((i) => i.id === "acc-img")!.imageUrl).toBe(accImg);
  });

  it("④ cutout success の bag → C1L-5 display priority で cutoutUrl が優先される", async () => {
    const bagImg = "data:image/png;base64,BAG-RAW";
    const bagCutout = "data:image/png;base64,BAG-CUT";
    // cutoutStatus=success + cutoutUrl → getWardrobeDisplayImageUrl が cutoutUrl を返す（C1L-5）
    const mainBag = bagItem("bag-cut", {
      imageUrl: bagImg,
      cutoutUrl: bagCutout,
      cutoutStatus: "success",
    });
    const main = makeProposal("main-4", [TOP, BOTTOM, SHOES, mainBag]);
    mockEngine.mockReturnValue(makeTodayProposal(main));
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r).not.toBeNull();
    const bagVM = r!.proposals[1].items.find((i) => i.id === "bag-cut");
    expect(bagVM!.imageUrl).toBe(bagCutout); // raw ではなく cutout を採用（既存 C1L-5 整合）
  });

  it("⑤ ensureThreeProposals 経由でも proposals[1] が main のまま（中央主役保証）", async () => {
    const main = makeProposal("main-5", [TOP, BOTTOM, SHOES, bagItem("bag-5")]);
    const casual = makeProposal("casual-5", [
      w({ id: "t-c", categoryMain: "tops" }),
      w({ id: "b-c", categoryMain: "bottoms" }),
      w({ id: "s-c", categoryMain: "shoes" }),
    ]);
    const dressy = makeProposal("dressy-5", [
      w({ id: "t-d", categoryMain: "tops" }),
      w({ id: "b-d", categoryMain: "bottoms" }),
      w({ id: "s-d", categoryMain: "shoes" }),
    ]);
    mockEngine.mockReturnValue(makeTodayProposal(main, [casual, dressy]));
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r).not.toBeNull();
    expect(r!.proposals).toHaveLength(3);
    expect(r!.proposals[1].id).toBe("main-5"); // 中央 = main 厳守
    expect(r!.proposals[1].items.some((i) => i.id === "bag-5")).toBe(true);
    expect(r!.source).toBe("engine"); // 3 件全て engine 由来
  });

  it("⑥ engine が bag/accessory を返さない場合 → 既存 4 カテゴリのまま壊れない（退化なし）", async () => {
    // engine main は tops/bottoms/shoes だけ（D1 既存挙動と同じ）
    const main = makeProposal("main-6", [TOP, BOTTOM, SHOES]);
    mockEngine.mockReturnValue(makeTodayProposal(main));
    const r = await generateCalendarOutfitProposal(INPUT);
    expect(r).not.toBeNull();
    expect(r!.proposals[1].id).toBe("main-6");
    expect(r!.proposals[1].items).toHaveLength(3);
    expect(
      r!.proposals[1].items.every((i) => i.category !== "バッグ" && i.category !== "小物"),
    ).toBe(true);
  });
});
