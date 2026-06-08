/**
 * R4-3 Trigger Content Builder（pure）— 非断定・おすすめ前面・empty_day は R2 recommended 流用・coarseNote。
 */
import { describe, it, expect } from "vitest";
import { buildTriggerContent } from "@/lib/plan/reality/triggers/trigger-content";
import type { FiredTrigger } from "@/lib/plan/reality/triggers/trigger-evaluator";
import type { TriggerContext } from "@/lib/plan/reality/triggers/trigger-model";
import type { WorldState } from "@/lib/plan/reality/world-state/world-state";
import type { EmptyDayProposalSet } from "@/lib/plan/reality/empty-day/empty-day-generator";

function fired(over: Partial<FiredTrigger> = {}): FiredTrigger {
  return { kind: "preflight", fireScore: 0.9, leadMinutes: 50, leaveByMinute: 675, windowRef: null, coarse: true, ...over };
}
const ws = (nowMinute: number | null = 670): WorldState => ({ date: "2026-06-20", nowMinute, todaySchedule: [], availableWindows: [], context: null, mobility: null, permissionLevel: 2 });
const ctx = (emptyDay: EmptyDayProposalSet | null = null, now: number | null = 670): TriggerContext => ({ worldState: ws(now), emptyDay });
const ASSERT = /あなたは.*です|必ず|絶対|すべきだ|しかない/;
const TRAIT = /性格|怠惰|人格/;

describe("R4-3 buildTriggerContent", () => {
  it("preflight: headline + recommendedAction + coarseNote(概算)", () => {
    const m = buildTriggerContent(fired(), ctx());
    expect(m.kind).toBe("preflight");
    expect(m.recommendedAction).toContain("準備");
    expect(m.coarseNote).toContain("概算");
    expect(m.lines.join("")).toContain("分");
  });
  it("preflight: leaveBy 超過は『過ぎています』headline", () => {
    const m = buildTriggerContent(fired({ leaveByMinute: 600 }), ctx(null, 670)); // now 670 > leaveBy 600
    expect(m.headline).toContain("過ぎています");
  });
  it("empty_day: R2 recommended tier を流用", () => {
    const set: EmptyDayProposalSet = { date: "2026-06-20", proposals: [], recommended: "easy" };
    const m = buildTriggerContent(fired({ kind: "empty_day" }), ctx(set, 400));
    expect(m.recommendedAction).toContain("回復を優先する組み方");
  });
  it("empty_day: emptyDay null でも headline は出る", () => {
    expect(buildTriggerContent(fired({ kind: "empty_day" }), ctx(null, 400)).headline).toContain("予定が空いています");
  });
  it("gap_opportunity: 空き分を headline に", () => {
    const m = buildTriggerContent(fired({ kind: "gap_opportunity", windowRef: { startMinute: 660, endMinute: 780 } }), ctx());
    expect(m.headline).toContain("120 分");
  });
  it("全 kind 非断定（trait/断定なし）", () => {
    for (const k of ["preflight", "empty_day", "gap_opportunity", "wind_down"] as const) {
      const m = buildTriggerContent(fired({ kind: k }), ctx());
      const text = [m.headline, m.detail ?? "", m.recommendedAction ?? "", ...m.lines].join(" ");
      expect(text).not.toMatch(ASSERT);
      expect(text).not.toMatch(TRAIT);
    }
  });
});
