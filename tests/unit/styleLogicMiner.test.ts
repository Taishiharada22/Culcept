import { describe, it, expect } from "vitest";
import { mineStyleLogic } from "@/app/(immersive)/my-style/_lib/styleLogicMiner";
import type { SavedState, WardrobeItem, SavedSetup } from "@/app/(immersive)/my-style/_lib/types";
import type { WornRecord } from "@/app/(culcept)/calendar/_lib/types";

/* ── Helpers ── */

function makeState(overrides: Partial<SavedState>): SavedState {
  return {
    wardrobe: [],
    setups: [],
    styleSelections: [],
    unexpectedStyleLanes: [],
    iam: { likedTags: [], dislikedTags: [], desiredImpressions: [], naturalSelfTags: [] },
    iseek: { attractedWorldviews: [], attractedElements: [], unexpectedPulls: [], avoidedElements: [] },
    ibecome: { pairs: [] },
    timelineSnapshots: [],
    colorPrefs: { dominant: [] },
    ...overrides,
  };
}

function makeItem(overrides: Partial<WardrobeItem>): WardrobeItem {
  return {
    id: `item_${Math.random().toString(36).slice(2)}`,
    name: "Test Item",
    category: "tops",
    color: "black",
    ...overrides,
  };
}

function makeSetup(itemIds: string[], overrides?: Partial<SavedSetup>): SavedSetup {
  return {
    id: `setup_${Math.random().toString(36).slice(2)}`,
    title: "Test Setup",
    itemIds,
    moodTags: [],
    impressionTags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/* ── Tests ── */

describe("mineStyleLogic", () => {
  it("insufficient data returns empty rules", () => {
    const state = makeState({
      wardrobe: [makeItem({}), makeItem({})],
      setups: [makeSetup(["a"]), makeSetup(["b"])], // only 2 setups
    });
    const result = mineStyleLogic(state);
    expect(result.dataQuality).toBe("insufficient");
    expect(result.rules).toEqual([]);
  });

  it("combo rules detected when items co-appear in 2+ setups", () => {
    const top1 = makeItem({ id: "top1", category: "tops", color: "white" });
    const top2 = makeItem({ id: "top2", category: "tops", color: "blue" });
    const bot1 = makeItem({ id: "bot1", category: "bottoms", color: "black" });
    const bot2 = makeItem({ id: "bot2", category: "bottoms", color: "navy" });
    const wardrobe = [top1, top2, bot1, bot2];

    const setups = [
      makeSetup(["top1", "bot1"]),
      makeSetup(["top1", "bot1"]),
      makeSetup(["top1", "bot1"]),
      makeSetup(["top2", "bot2"]),
    ];

    const state = makeState({ wardrobe, setups });
    const result = mineStyleLogic(state);

    const comboRules = result.rules.filter((r) => r.type === "combo");
    expect(comboRules.length).toBeGreaterThanOrEqual(1);

    const top1Bot1Combo = comboRules.find(
      (r) => r.id.includes("top1") && r.id.includes("bot1"),
    );
    expect(top1Bot1Combo).toBeDefined();
    expect(top1Bot1Combo!.occurrences).toBeGreaterThanOrEqual(2);
  });

  it("color dominant rule detected", () => {
    const wardrobe = [
      makeItem({ id: "a", color: "black" }),
      makeItem({ id: "b", color: "black" }),
      makeItem({ id: "c", color: "black" }),
      makeItem({ id: "d", color: "white" }),
    ];
    const setups = [
      makeSetup(["a", "b"]),
      makeSetup(["b", "c"]),
      makeSetup(["a", "c"]),
    ];

    const state = makeState({ wardrobe, setups });
    const result = mineStyleLogic(state);

    const colorRules = result.rules.filter((r) => r.type === "color");
    const dominant = colorRules.find((r) => r.description.includes("ブラック"));
    expect(dominant).toBeDefined();
  });

  it("dark palette detected", () => {
    const wardrobe = [
      makeItem({ id: "a", color: "black" }),
      makeItem({ id: "b", color: "navy" }),
      makeItem({ id: "c", color: "charcoal" }),
      makeItem({ id: "d", color: "white" }),
      makeItem({ id: "e", color: "beige" }),
    ];
    const setups = [
      makeSetup(["a", "b"]),
      makeSetup(["b", "c"]),
      makeSetup(["a", "c"]),
    ];

    const state = makeState({ wardrobe, setups });
    const result = mineStyleLogic(state);

    const darkRule = result.rules.find((r) => r.id.includes("dark_palette"));
    expect(darkRule).toBeDefined();
    expect(darkRule!.description).toContain("ダーク系");
  });

  it("silhouette I-line detected", () => {
    const top1 = makeItem({ id: "t1", category: "tops", color: "white", silhouette: "slim" });
    const top2 = makeItem({ id: "t2", category: "tops", color: "black", silhouette: "slim" });
    const bot1 = makeItem({ id: "b1", category: "bottoms", color: "black", silhouette: "slim" });
    const bot2 = makeItem({ id: "b2", category: "bottoms", color: "navy", silhouette: "regular" });
    const wardrobe = [top1, top2, bot1, bot2];

    const setups = [
      makeSetup(["t1", "b1"]),
      makeSetup(["t2", "b1"]),
      makeSetup(["t1", "b2"]),
      makeSetup(["t2", "b2"]),
    ];

    const state = makeState({ wardrobe, setups });
    const result = mineStyleLogic(state);

    const silhouetteRules = result.rules.filter((r) => r.type === "silhouette");
    const iLine = silhouetteRules.find((r) => r.description.includes("Iライン"));
    expect(iLine).toBeDefined();
  });

  it("formality consistency detected", () => {
    const items = [
      makeItem({ id: "a", color: "black", formality: "casual" }),
      makeItem({ id: "b", color: "white", formality: "casual" }),
      makeItem({ id: "c", color: "navy", formality: "casual" }),
      makeItem({ id: "d", color: "gray", formality: "casual" }),
    ];
    const setups = [
      makeSetup(["a", "b"]),
      makeSetup(["b", "c"]),
      makeSetup(["c", "d"]),
      makeSetup(["a", "d"]),
    ];

    const state = makeState({ wardrobe: items, setups });
    const result = mineStyleLogic(state);

    const formalityRules = result.rules.filter((r) => r.type === "formality");
    const consistent = formalityRules.find((r) => r.id.includes("consistent"));
    expect(consistent).toBeDefined();
  });

  it("avoidance: sneakers + dress pants never paired", () => {
    const sneaker = makeItem({ id: "sneaker1", category: "shoes", color: "white", subcategory: "sneaker" });
    const dressPants = makeItem({ id: "dress1", category: "bottoms", color: "black", formality: "dress" });
    const casualBottom = makeItem({ id: "casual1", category: "bottoms", color: "blue", formality: "casual" });
    const dressShoe = makeItem({ id: "shoe2", category: "shoes", color: "black" });
    const top1 = makeItem({ id: "top1", category: "tops", color: "white" });
    const top2 = makeItem({ id: "top2", category: "tops", color: "navy" });
    const top3 = makeItem({ id: "top3", category: "tops", color: "gray" });

    const wardrobe = [sneaker, dressPants, casualBottom, dressShoe, top1, top2, top3];

    // 5+ setups; sneaker only with casual bottom, dress shoes with dress pants
    const setups = [
      makeSetup(["top1", "casualBottom", "sneaker1"]),
      makeSetup(["top2", "casualBottom", "sneaker1"]),
      makeSetup(["top3", "casualBottom", "sneaker1"]),
      makeSetup(["top1", "dress1", "shoe2"]),
      makeSetup(["top2", "dress1", "shoe2"]),
    ];

    // Fix: use the correct item IDs that match wardrobe
    const fixedSetups = [
      makeSetup(["top1", "casual1", "sneaker1"]),
      makeSetup(["top2", "casual1", "sneaker1"]),
      makeSetup(["top3", "casual1", "sneaker1"]),
      makeSetup(["top1", "dress1", "shoe2"]),
      makeSetup(["top2", "dress1", "shoe2"]),
    ];

    const state = makeState({ wardrobe, setups: fixedSetups });
    const result = mineStyleLogic(state);

    const avoidanceRules = result.rules.filter((r) => r.type === "avoidance");
    const sneakerDress = avoidanceRules.find((r) => r.id.includes("sneakers_dress_pants"));
    expect(sneakerDress).toBeDefined();
  });

  it("day of week rules with worn records", () => {
    // Items with formality
    const formalTop = makeItem({ id: "ft", category: "tops", color: "white", formality: "dress" });
    const formalBot = makeItem({ id: "fb", category: "bottoms", color: "black", formality: "dress" });
    const casualTop = makeItem({ id: "ct", category: "tops", color: "blue", formality: "casual" });
    const casualBot = makeItem({ id: "cb", category: "bottoms", color: "beige", formality: "casual" });
    const wardrobe = [formalTop, formalBot, casualTop, casualBot];

    // Create worn records: Mondays formal, Saturdays casual
    // Use dates that land on Monday (dow=1) and Saturday (dow=6)
    const records: WornRecord[] = [
      // Mondays (formal)
      { date: "2026-03-02", itemIds: ["ft", "fb"], satisfaction: 4 }, // Mon
      { date: "2026-03-09", itemIds: ["ft", "fb"], satisfaction: 5 }, // Mon
      { date: "2026-03-16", itemIds: ["ft", "fb"], satisfaction: 4 }, // Mon (future but for testing)
      // Saturdays (casual)
      { date: "2026-02-28", itemIds: ["ct", "cb"], satisfaction: 5 }, // Sat
      { date: "2026-03-07", itemIds: ["ct", "cb"], satisfaction: 4 }, // Sat
      { date: "2026-03-14", itemIds: ["ct", "cb"], satisfaction: 5 }, // Sat
      // Some other days to fill the 7 record minimum
      { date: "2026-03-03", itemIds: ["ct", "cb"], satisfaction: 3 }, // Tue
    ];

    // Need at least 3 setups to avoid "insufficient" data quality
    const setups = [
      makeSetup(["ft", "fb"]),
      makeSetup(["ct", "cb"]),
      makeSetup(["ft", "cb"]),
    ];

    const state = makeState({ wardrobe, setups });
    const result = mineStyleLogic(state, records);

    const dayOfWeekRules = result.rules.filter((r) => r.type === "dayOfWeek");
    expect(dayOfWeekRules.length).toBeGreaterThanOrEqual(1);
  });

  it("season rules detected", () => {
    const wardrobe = [
      // AW items with dark colors
      makeItem({ id: "aw1", color: "black", season: "aw" }),
      makeItem({ id: "aw2", color: "navy", season: "aw" }),
      makeItem({ id: "aw3", color: "charcoal", season: "aw" }),
      // SS items with light colors
      makeItem({ id: "ss1", color: "white", season: "ss" }),
      makeItem({ id: "ss2", color: "cream", season: "ss" }),
      makeItem({ id: "ss3", color: "beige", season: "ss" }),
    ];

    const setups = [
      makeSetup(["aw1", "aw2"]),
      makeSetup(["ss1", "ss2"]),
      makeSetup(["aw2", "aw3"]),
    ];

    const state = makeState({ wardrobe, setups });
    const result = mineStyleLogic(state);

    const seasonRule = result.rules.find((r) => r.id.includes("seasonal_tone_shift"));
    expect(seasonRule).toBeDefined();
    expect(seasonRule!.description).toContain("秋冬はダークトーン");
  });

  it("rules are deduped and capped at 12", () => {
    // Create a large wardrobe and many setups to generate many rules
    const items: WardrobeItem[] = [];
    for (let i = 0; i < 20; i++) {
      items.push(
        makeItem({
          id: `item${i}`,
          category: i % 2 === 0 ? "tops" : "bottoms",
          color: "black",
          colorName: "black",
          formality: "casual",
          silhouette: "slim",
          season: i < 10 ? "aw" : "ss",
        }),
      );
    }

    const setups: SavedSetup[] = [];
    for (let i = 0; i < 15; i++) {
      const topIdx = (i * 2) % 20;
      const botIdx = ((i * 2) + 1) % 20;
      setups.push(makeSetup([`item${topIdx}`, `item${botIdx}`]));
    }

    const state = makeState({ wardrobe: items, setups });
    const result = mineStyleLogic(state);

    // Max 12 rules
    expect(result.rules.length).toBeLessThanOrEqual(12);

    // Deduped — no duplicate IDs
    const ids = result.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rules filtered by confidence >= 0.5 and occurrences >= 2", () => {
    // With 3 setups and minimal data, most rules should have low confidence
    const items = [
      makeItem({ id: "a", color: "red" }),
      makeItem({ id: "b", color: "green" }),
      makeItem({ id: "c", color: "yellow" }),
    ];
    const setups = [
      makeSetup(["a", "b"]),
      makeSetup(["b", "c"]),
      makeSetup(["a", "c"]),
    ];

    const state = makeState({ wardrobe: items, setups });
    const result = mineStyleLogic(state);

    // All returned rules must pass the filter
    for (const rule of result.rules) {
      expect(rule.confidence).toBeGreaterThanOrEqual(0.5);
      expect(rule.occurrences).toBeGreaterThanOrEqual(2);
    }
  });
});
