/**
 * R2-3 Empty-day Reason Builder（pure）— time/energy/weather/mobility fit・memory 根拠・permission risk・
 *   confidence≤tentative・readiness・非断定 copy（trait/liked-disliked 断定なし）。
 */
import { describe, it, expect } from "vitest";
import { buildEmptyDayReasoning, buildAllReasoning } from "@/lib/plan/reality/empty-day/empty-day-reasoning";
import type { EmptyDayInput } from "@/lib/plan/reality/empty-day/empty-day-input";
import type { EmptyDayBlock, EmptyDayProposal, EmptyDayProposalSet } from "@/lib/plan/reality/empty-day/empty-day-generator";
import type { MemoryLeaning } from "@/lib/plan/reality/learning/memory-model";
import type { DecisionBand } from "@/lib/plan/reality/learning/prm-alter-bridge";

function block(band: DecisionBand, memoryLeaning: MemoryLeaning | null = null, kind: EmptyDayBlock["kind"] = "focus_work"): EmptyDayBlock {
  return { startMinute: 0, endMinute: 60, kind, band, memoryLeaning };
}
function proposal(over: Partial<EmptyDayProposal> = {}): EmptyDayProposal {
  return { tier: "push", blocks: [block("evening")], activeMinutes: 120, restMinutes: 120, strain: "medium", ...over };
}
function input(over: Partial<EmptyDayInput> = {}): EmptyDayInput {
  return { date: "2026-06-20", availableWindows: [], hardConstraints: [], energy: 0.6, weather: null, mobility: null, memoryUsableContexts: [], userIntent: null, permissionLevel: 3, excludedContexts: [], ...over };
}
const ASSERT = /あなたは.*です|必ず|絶対|に決まって|すべきだ|しかない/;
const TRAIT = /性格|怠惰|だらしな|人格|無責任/;
const LIKED = /好き|嫌い|苦手/;

describe("R2-3 fits", () => {
  it("time fit: 余白ゼロ→caution・余白多→good", () => {
    expect(buildEmptyDayReasoning(input(), proposal({ activeMinutes: 240, restMinutes: 0 })).fits.time).toBe("caution");
    expect(buildEmptyDayReasoning(input(), proposal({ activeMinutes: 60, restMinutes: 300 })).fits.time).toBe("good");
  });
  it("energy fit: 高 strain + low energy→caution・low strain→good", () => {
    expect(buildEmptyDayReasoning(input({ energy: 0.2 }), proposal({ strain: "high" })).fits.energy).toBe("caution");
    expect(buildEmptyDayReasoning(input({ energy: 0.6 }), proposal({ strain: "low" })).fits.energy).toBe("good");
  });
  it("weather fit: null→ok・bad+active 多→caution・normal→good", () => {
    expect(buildEmptyDayReasoning(input({ weather: null }), proposal()).fits.weather).toBe("ok");
    expect(buildEmptyDayReasoning(input({ weather: "rain" }), proposal({ activeMinutes: 240, restMinutes: 60 })).fits.weather).toBe("caution");
    expect(buildEmptyDayReasoning(input({ weather: "heat" }), proposal()).fits.weather).toBe("good");
  });
  it("mobility fit: null→ok・あり→good", () => {
    expect(buildEmptyDayReasoning(input({ mobility: null }), proposal()).fits.mobility).toBe("ok");
    expect(buildEmptyDayReasoning(input({ mobility: { typicalTravelBufferMin: 20 } }), proposal()).fits.mobility).toBe("good");
  });
});

describe("R2-3 memory basis / permission / confidence / readiness", () => {
  it("memoryBasis: 影響 block から非断定 distinct 根拠・memory 無→空", () => {
    const r = buildEmptyDayReasoning(input(), proposal({ blocks: [block("evening", "toward_declining"), block("morning", "toward_adopting"), block("evening", "toward_declining")] }));
    expect(r.memoryBasis).toHaveLength(2); // distinct
    expect(r.memoryBasis.join("")).toContain("夜の時間帯では見送りやすい傾向を反映");
    expect(buildEmptyDayReasoning(input(), proposal({ blocks: [block("evening", null)] })).memoryBasis).toEqual([]);
  });
  it("permissionRisk: level≤1→confirm_recommended・≥2→none", () => {
    expect(buildEmptyDayReasoning(input({ permissionLevel: 1 }), proposal()).permissionRisk).toBe("confirm_recommended");
    expect(buildEmptyDayReasoning(input({ permissionLevel: 3 }), proposal()).permissionRisk).toBe("none");
  });
  it("confidence は常に ≤tentative・memory 無→low", () => {
    const noMem = buildEmptyDayReasoning(input(), proposal({ blocks: [block("evening", null)] }));
    expect(noMem.confidence).toBe("low");
    const withMem = buildEmptyDayReasoning(
      input({ memoryUsableContexts: [{ context: { dimension: "band", value: "evening" }, leaning: "toward_declining", userVerdict: null, suppressed: false, confidence: "tentative", readiness: "ready", recentEpisodes: 1, totalEpisodes: 2, evidenceCount: 6, notes: [] }] }),
      proposal({ blocks: [block("evening", "toward_declining")] }),
    );
    expect(["low", "tentative"]).toContain(withMem.confidence);
    expect(withMem.confidence).toBe("tentative");
  });
  it("readiness: blocks 空→draft・通常→ready_to_show", () => {
    expect(buildEmptyDayReasoning(input(), proposal({ blocks: [] })).readiness).toBe("draft");
    expect(buildEmptyDayReasoning(input(), proposal()).readiness).toBe("ready_to_show");
  });
});

describe("R2-3 非断定 copy", () => {
  it("lines/memoryBasis に断定/trait/liked-disliked を含まない", () => {
    const r = buildEmptyDayReasoning(input({ energy: 0.2, weather: "rain" }), proposal({ strain: "high", activeMinutes: 240, restMinutes: 0, blocks: [block("evening", "toward_declining")] }));
    const text = [...r.lines, ...r.memoryBasis].join(" ");
    expect(text).not.toMatch(ASSERT);
    expect(text).not.toMatch(TRAIT);
    expect(text).not.toMatch(LIKED);
    expect(r.lines.length).toBeGreaterThan(0);
  });
});

describe("R2-3 buildAllReasoning", () => {
  it("set の 3 案すべて reasoning", () => {
    const set: EmptyDayProposalSet = { date: "2026-06-20", proposals: [proposal({ tier: "protect" }), proposal({ tier: "easy" }), proposal({ tier: "push" })], recommended: "protect" };
    expect(buildAllReasoning(input(), set).map((r) => r.tier)).toEqual(["protect", "easy", "push"]);
  });
});
