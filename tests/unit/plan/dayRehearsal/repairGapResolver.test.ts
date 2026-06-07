/**
 * Repair Gap Resolver v1 — pure layer のテスト。
 * protect signal（use_recovery_window）→ DayGraph GapNode 解決 → gap-meaning recovery assertion を検証。
 * 厳密 double time-match / fail-safe skip（不一致・曖昧・event 不在）/ protect_buffer defer / evidence 保持 / pure。
 * ★Reality 非接続・予定変更なし。
 */
import { describe, it, expect } from "vitest";
import { resolveProtectSignalsToGapMeaning } from "@/lib/plan/dayRehearsal/repairGapResolver";
import type { RepairProtectSignal } from "@/lib/plan/dayRehearsal/repairProtectSignal";
import type { DayRepairKind } from "@/lib/plan/dayRehearsal/dayRepairCandidates";
import type { Evidence } from "@/lib/plan/dayRehearsal/dayRehearsalTypes";
import type { EventNode, GapNode, DayGraph } from "@/lib/plan/dayGraph/dayGraphTypes";

const EV: Evidence = { basis: ["recovery window"], known: ["余白が確保されている"], unknown: [], inferred: [] };

function evNode(id: string, startTime: string, endTime: string): EventNode {
  return { id, kind: "event", origin: "explicit", startTime, endTime, durationMin: 60, timeBucket: "morning", anchorId: id, displayLabel: id, verb: "unknown", rigidity: "soft", latencyTolerance: "flexible", durationSource: "explicit", boundaryClipped: false, sensitive: false, overlapsWithNodeIds: [] } as unknown as EventNode;
}
function gapNode(id: string, startTime: string, endTime: string): GapNode {
  return { id, kind: "gap", origin: "implicit", startTime, endTime, durationMin: 0, timeBucket: "morning", sensitiveProximity: false } as unknown as GapNode;
}
function mkGraph(nodes: Array<EventNode | GapNode>): DayGraph {
  return { snapshotId: "t", attributes: { date: "2026-06-07", dayMood: "light", density: "balanced" }, nodes, edges: [] } as unknown as DayGraph;
}
const sig = (kind: DayRepairKind, targetStepIndex: number | null, evidence: Evidence = EV): RepairProtectSignal => ({ kind, targetStepIndex, protectionHint: "recovery", evidence });

describe("resolveProtectSignalsToGapMeaning（GapNode 解決・fail-safe・Reality 非接続）", () => {
  // events[0]=06:00-07:00, gap=07:00-09:00, events[1]=09:00-10:00
  const cleanGraph = mkGraph([evNode("e0", "06:00", "07:00"), gapNode("2026-06-07_gap_0", "07:00", "09:00"), evNode("e1", "09:00", "10:00")]);

  it("GR1. use_recovery_window(step0) → 一致 GapNode に解決（gapNodeId/区間/meaning/evidence）", () => {
    const out = resolveProtectSignalsToGapMeaning([sig("use_recovery_window", 0)], cleanGraph);
    expect(out).toHaveLength(1);
    expect(out[0].gapNodeId).toBe("2026-06-07_gap_0");
    expect(out[0].startTime).toBe("07:00");
    expect(out[0].endTime).toBe("09:00");
    expect(out[0].meaning).toBe("recovery");
    expect(out[0].kind).toBe("use_recovery_window");
    expect(out[0].evidence).toBe(EV);
  });

  it("GR2. protect_buffer は defer（解決しない・skip）", () => {
    const out = resolveProtectSignalsToGapMeaning([sig("protect_buffer", 0)], cleanGraph);
    expect(out).toEqual([]);
  });

  it("GR3. event[i+1] 不在（最終 event）→ skip", () => {
    const out = resolveProtectSignalsToGapMeaning([sig("use_recovery_window", 1)], cleanGraph); // e1 が最後
    expect(out).toEqual([]);
  });

  it("GR4. targetStepIndex null → skip", () => {
    expect(resolveProtectSignalsToGapMeaning([sig("use_recovery_window", null)], cleanGraph)).toEqual([]);
  });

  it("GR5. 一致 GapNode なし（区間不一致 / overlap で merge）→ skip（fail-safe）", () => {
    // gap が 07:30-09:00（e0.end 07:00 と不一致）→ double-match せず skip
    const g = mkGraph([evNode("e0", "06:00", "07:00"), gapNode("g", "07:30", "09:00"), evNode("e1", "09:00", "10:00")]);
    expect(resolveProtectSignalsToGapMeaning([sig("use_recovery_window", 0)], g)).toEqual([]);
  });

  it("GR6. GapNode が存在しない（隣接 event）→ skip", () => {
    const g = mkGraph([evNode("e0", "06:00", "07:00"), evNode("e1", "07:00", "08:00")]);
    expect(resolveProtectSignalsToGapMeaning([sig("use_recovery_window", 0)], g)).toEqual([]);
  });

  it("GR7. 曖昧（同一区間の GapNode が 2 件）→ skip（fail-safe・!==1）", () => {
    const g = mkGraph([evNode("e0", "06:00", "07:00"), gapNode("g1", "07:00", "09:00"), gapNode("g2", "07:00", "09:00"), evNode("e1", "09:00", "10:00")]);
    expect(resolveProtectSignalsToGapMeaning([sig("use_recovery_window", 0)], g)).toEqual([]);
  });

  it("GR8. 複数 signal → use_recovery_window のみ解決・順序保持", () => {
    // events: e0 06-07, gap 07-09, e1 09-10, gap 10-12, e2 12-13
    const g = mkGraph([
      evNode("e0", "06:00", "07:00"), gapNode("g0", "07:00", "09:00"),
      evNode("e1", "09:00", "10:00"), gapNode("g1", "10:00", "12:00"),
      evNode("e2", "12:00", "13:00"),
    ]);
    const out = resolveProtectSignalsToGapMeaning([sig("protect_buffer", 0), sig("use_recovery_window", 0), sig("use_recovery_window", 1)], g);
    expect(out.map((a) => a.gapNodeId)).toEqual(["g0", "g1"]);
  });

  it("GR9. 空 signal → 空", () => {
    expect(resolveProtectSignalsToGapMeaning([], cleanGraph)).toEqual([]);
  });

  it("GR10. deterministic（同入力 → 同出力）", () => {
    const s = [sig("use_recovery_window", 0)];
    expect(resolveProtectSignalsToGapMeaning(s, cleanGraph)).toEqual(resolveProtectSignalsToGapMeaning(s, cleanGraph));
  });

  it("GR11. pure（入力 signals / dayGraph を破壊しない）", () => {
    const s = [sig("use_recovery_window", 0)];
    const nodesBefore = cleanGraph.nodes.length;
    resolveProtectSignalsToGapMeaning(s, cleanGraph);
    expect(s).toHaveLength(1);
    expect(cleanGraph.nodes.length).toBe(nodesBefore);
  });

  it("GR12. assertion は ChangeSet/apply field を持たない（橋渡し候補のみ）", () => {
    const a = resolveProtectSignalsToGapMeaning([sig("use_recovery_window", 0)], cleanGraph)[0] as unknown as Record<string, unknown>;
    for (const forbidden of ["ops", "changeSet", "before", "after", "applied", "startMin", "endMin", "itemId"]) {
      expect(a[forbidden]).toBeUndefined();
    }
  });
});
