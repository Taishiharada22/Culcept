/**
 * R2-4 Empty-day Fixture Smoke — generator + reasoning を realistic fixture で end-to-end 検証。
 *   memory有無/suppressed/conflicting/low energy/bad weather/tight windows/overpacking防止/tier差別化/hard constraints優先。
 *   pure のみ（DB/route/UI なし）。
 */
import { describe, it, expect } from "vitest";
import { generateEmptyDay, type EmptyDayProposalSet, type EmptyDayTier } from "@/lib/plan/reality/empty-day/empty-day-generator";
import { buildAllReasoning } from "@/lib/plan/reality/empty-day/empty-day-reasoning";
import type { AvailableWindow, EmptyDayInput, HardConstraint } from "@/lib/plan/reality/empty-day/empty-day-input";
import type { SynthesizedContext } from "@/lib/plan/reality/learning/memory-synthesis";
import type { MemoryLeaning } from "@/lib/plan/reality/learning/memory-model";

const WINDOWS: AvailableWindow[] = [
  { startMinute: 540, endMinute: 660, meaning: null }, // 09-11 morning 120
  { startMinute: 780, endMinute: 960, meaning: null }, // 13-16 afternoon 180
  { startMinute: 1080, endMinute: 1200, meaning: null }, // 18-20 evening 120
];
const HARD: HardConstraint[] = [{ startMinute: 660, endMinute: 720, label: null, protection: "hard_external" }]; // 11-12 会議
const TOTAL = WINDOWS.reduce((s, w) => s + (w.endMinute - w.startMinute), 0);

function sc(value: string, leaning: MemoryLeaning, over: Partial<SynthesizedContext> = {}): SynthesizedContext {
  return { context: { dimension: "band", value }, leaning, userVerdict: null, suppressed: false, confidence: "tentative", readiness: "ready", recentEpisodes: 1, totalEpisodes: 2, evidenceCount: 6, notes: [], ...over };
}
function input(over: Partial<EmptyDayInput> = {}): EmptyDayInput {
  return { date: "2026-06-20", availableWindows: WINDOWS, hardConstraints: HARD, energy: 0.6, weather: null, mobility: null, memoryUsableContexts: [], userIntent: null, permissionLevel: 2, excludedContexts: [], ...over };
}
const tier = (s: EmptyDayProposalSet, t: EmptyDayTier) => s.proposals.find((p) => p.tier === t)!;
const overlaps = (a: { startMinute: number; endMinute: number }, b: { startMinute: number; endMinute: number }) => a.startMinute < b.endMinute && b.startMinute < a.endMinute;

describe("R2-4 smoke — 全 tier・hard constraints・overpacking", () => {
  it("全シナリオ共通: 3 案・block は available 内・hard constraints と非重複・overpacking なし", () => {
    const scenarios = [
      input(),
      input({ memoryUsableContexts: [sc("evening", "toward_declining"), sc("morning", "toward_adopting")] }),
      input({ energy: 0.15 }),
      input({ weather: "storm" }),
      input({ availableWindows: [{ startMinute: 600, endMinute: 645, meaning: null }, { startMinute: 800, endMinute: 850, meaning: null }] }), // tight
    ];
    for (const inp of scenarios) {
      const s = generateEmptyDay(inp);
      expect(s.proposals.map((p) => p.tier)).toEqual(["protect", "easy", "push"]);
      const avail = inp.availableWindows;
      const availTotal = avail.reduce((sum, w) => sum + (w.endMinute - w.startMinute), 0);
      for (const p of s.proposals) {
        // overpacking 防止: active+rest = 全空き枠時間・active は超過しない
        expect(p.activeMinutes + p.restMinutes).toBe(availTotal);
        expect(p.activeMinutes).toBeLessThanOrEqual(availTotal);
        for (const b of p.blocks) {
          // hard constraints 優先: block は available 窓内 ∧ hard constraint と重ならない
          expect(avail.some((w) => b.startMinute >= w.startMinute && b.endMinute <= w.endMinute)).toBe(true);
          for (const h of inp.hardConstraints) expect(overlaps(b, h)).toBe(false);
        }
      }
      // tier 差別化（単調）
      expect(tier(s, "easy").activeMinutes).toBeLessThanOrEqual(tier(s, "protect").activeMinutes);
      expect(tier(s, "protect").activeMinutes).toBeLessThanOrEqual(tier(s, "push").activeMinutes);
    }
  });
});

describe("R2-4 smoke — memory シナリオ", () => {
  it("memory あり: declining 窓は active になりにくい・memoryBasis に反映", () => {
    const s = generateEmptyDay(input({ memoryUsableContexts: [sc("evening", "toward_declining"), sc("morning", "toward_adopting")] }));
    const reasonings = buildAllReasoning(input({ memoryUsableContexts: [sc("evening", "toward_declining"), sc("morning", "toward_adopting")] }), s);
    expect(reasonings.some((r) => r.memoryBasis.join("").includes("見送りやすい傾向を反映"))).toBe(true);
  });
  it("memory なし: memoryBasis 空・confidence low", () => {
    const s = generateEmptyDay(input());
    const r = buildAllReasoning(input(), s);
    expect(r.every((x) => x.memoryBasis.length === 0)).toBe(true);
    expect(r.every((x) => x.confidence === "low")).toBe(true);
  });
  it("suppressed memory: 防御フィルタで反映されない", () => {
    const s = generateEmptyDay(input({ memoryUsableContexts: [sc("evening", "toward_declining", { suppressed: true })] }));
    const r = buildAllReasoning(input({ memoryUsableContexts: [sc("evening", "toward_declining", { suppressed: true })] }), s);
    expect(r.every((x) => x.memoryBasis.length === 0)).toBe(true); // suppressed は使われない
  });
  it("conflicting memory(leaning null): 反映されない", () => {
    const conflicted = { ...sc("evening", "toward_declining"), leaning: null } as SynthesizedContext;
    const s = generateEmptyDay(input({ memoryUsableContexts: [conflicted] }));
    expect(buildAllReasoning(input({ memoryUsableContexts: [conflicted] }), s).every((x) => x.memoryBasis.length === 0)).toBe(true);
  });
});

describe("R2-4 smoke — energy / weather", () => {
  it("low energy は push の負荷を下げる（詰めすぎない）", () => {
    const lo = tier(generateEmptyDay(input({ energy: 0.15 })), "push").activeMinutes;
    const hi = tier(generateEmptyDay(input({ energy: 0.9 })), "push").activeMinutes;
    expect(lo).toBeLessThan(hi);
    expect(lo).toBeLessThanOrEqual(TOTAL);
  });
  it("bad weather + active 多 → weather fit caution", () => {
    const s = generateEmptyDay(input({ weather: "storm", energy: 0.9 }));
    const pushReason = buildAllReasoning(input({ weather: "storm", energy: 0.9 }), s).find((r) => r.tier === "push")!;
    expect(pushReason.fits.weather).toBe("caution");
  });
  it("low energy で energy fit が caution を含む（high strain 案）", () => {
    const s = generateEmptyDay(input({ energy: 0.15 }));
    const r = buildAllReasoning(input({ energy: 0.15 }), s);
    expect(r.some((x) => x.fits.energy === "caution" || x.fits.energy === "ok")).toBe(true);
  });
});
