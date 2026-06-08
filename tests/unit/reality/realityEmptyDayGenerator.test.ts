/**
 * R2-2 Empty-day Candidate Generator（pure）— 守る/楽/攻める 3 案。
 *   tier 単調(easy≤protect≤push)・low energy で詰めすぎない・memory は重み付け(adopting 先/declining rest)・
 *   gap meaning 尊重(recovery/buffer)・hard constraints 非接触(available のみ)・recommended。
 */
import { describe, it, expect } from "vitest";
import { generateEmptyDay, type EmptyDayProposalSet, type EmptyDayTier } from "@/lib/plan/reality/empty-day/empty-day-generator";
import type { EmptyDayInput } from "@/lib/plan/reality/empty-day/empty-day-input";
import type { SynthesizedContext } from "@/lib/plan/reality/learning/memory-synthesis";
import type { MemoryLeaning } from "@/lib/plan/reality/learning/memory-model";

function sc(value: string, leaning: MemoryLeaning): SynthesizedContext {
  return { context: { dimension: "band", value }, leaning, userVerdict: null, suppressed: false, confidence: "tentative", readiness: "ready", recentEpisodes: 1, totalEpisodes: 2, evidenceCount: 6, notes: [] };
}
function input(over: Partial<EmptyDayInput> = {}): EmptyDayInput {
  return {
    date: "2026-06-20",
    availableWindows: [
      { startMinute: 540, endMinute: 660, meaning: null }, // 09-11 morning 120
      { startMinute: 720, endMinute: 900, meaning: null }, // 12-15 afternoon 180
      { startMinute: 1080, endMinute: 1200, meaning: null }, // 18-20 evening 120
    ],
    hardConstraints: [],
    energy: 0.6,
    weather: null,
    mobility: null,
    memoryUsableContexts: [],
    userIntent: null,
    permissionLevel: 1,
    excludedContexts: [],
    ...over,
  };
}
const tier = (s: EmptyDayProposalSet, t: EmptyDayTier) => s.proposals.find((p) => p.tier === t)!;

describe("R2-2 generateEmptyDay — 3 案 構造", () => {
  it("常に 3 案 protect/easy/push の順・各 block は available window 数と一致", () => {
    const s = generateEmptyDay(input());
    expect(s.proposals.map((p) => p.tier)).toEqual(["protect", "easy", "push"]);
    for (const p of s.proposals) expect(p.blocks).toHaveLength(3); // available 3 窓のみ（hard constraints 非接触）
  });
});

describe("R2-2 tier 単調 & energy 詰めすぎない", () => {
  it("activeMinutes: easy ≤ protect ≤ push", () => {
    const s = generateEmptyDay(input());
    expect(tier(s, "easy").activeMinutes).toBeLessThanOrEqual(tier(s, "protect").activeMinutes);
    expect(tier(s, "protect").activeMinutes).toBeLessThanOrEqual(tier(s, "push").activeMinutes);
  });
  it("low energy は push の active を下げる（詰めすぎない）", () => {
    const hi = tier(generateEmptyDay(input({ energy: 0.9 })), "push").activeMinutes;
    const lo = tier(generateEmptyDay(input({ energy: 0.2 })), "push").activeMinutes;
    expect(lo).toBeLessThan(hi);
  });
});

describe("R2-2 memory は重み付けのみ", () => {
  it("adopting 窓を先に active・declining 窓は rest（budget 制約下）", () => {
    const s = generateEmptyDay(
      input({
        availableWindows: [
          { startMinute: 540, endMinute: 660, meaning: null }, // morning 120
          { startMinute: 1080, endMinute: 1200, meaning: null }, // evening 120
        ],
        memoryUsableContexts: [sc("morning", "toward_adopting"), sc("evening", "toward_declining")],
      }),
    );
    const protect = tier(s, "protect");
    const morning = protect.blocks.find((b) => b.band === "morning")!;
    const evening = protect.blocks.find((b) => b.band === "evening")!;
    expect(["focus_work", "light_task"]).toContain(morning.kind); // adopting → active
    expect(["recovery", "open"]).toContain(evening.kind); // declining → rest
    expect(evening.memoryLeaning).toBe("toward_declining");
  });
});

describe("R2-2 gap meaning 尊重", () => {
  it("recovery→recovery・dangerous_tight→buffer（全 tier）", () => {
    const s = generateEmptyDay(
      input({ availableWindows: [{ startMinute: 540, endMinute: 660, meaning: "recovery" }, { startMinute: 720, endMinute: 840, meaning: "dangerous_tight" }] }),
    );
    for (const p of s.proposals) {
      expect(p.blocks[0]!.kind).toBe("recovery");
      expect(p.blocks[1]!.kind).toBe("buffer");
    }
  });
});

describe("R2-2 recommended", () => {
  it("userIntent 優先・なければ energy から", () => {
    expect(generateEmptyDay(input({ userIntent: "protect", energy: 0.9 })).recommended).toBe("protect");
    expect(generateEmptyDay(input({ userIntent: null, energy: 0.2 })).recommended).toBe("easy");
    expect(generateEmptyDay(input({ userIntent: null, energy: 0.9 })).recommended).toBe("push");
    expect(generateEmptyDay(input({ userIntent: null, energy: 0.6 })).recommended).toBe("protect");
  });
});
