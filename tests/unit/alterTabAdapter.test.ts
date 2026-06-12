/**
 * alterTab adapter（W3a）— 写像・主観日×暦日キー・shift 解決・捏造禁止の fixture
 * 正本: docs/day-state-w3-execution-plan.md §2.2 / §2.4
 */
import {
  buildAlterDayInput,
  daySegmentsFromGraph,
  formatIsoDateLocal,
  resolveShiftInput,
  subjectiveDateFor,
  toHHMM,
} from "@/lib/plan/alterTab/adapter";
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { BuildDayGraphResult } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ── fixture: 実 buildDayGraph を通して整合した graph を得る（手書き graph の偽整合を避ける） ──

function oneOffAnchor(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return {
    anchorKind: "one_off",
    sourceId: "src-manual",
    title: "予定",
    date: "2026-06-12",
    rigidity: "fixed",
    confirmedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  } as ExternalAnchor;
}

function graphFor(anchors: ExternalAnchor[]): BuildDayGraphResult {
  return buildDayGraph({ anchors, date: "2026-06-12" });
}

describe("subjectiveDateFor — 主観日境界 05:00（暦日キーの吸収）", () => {
  it("05:00 以降は当日キー", () => {
    expect(subjectiveDateFor(new Date(2026, 5, 12, 5, 0))).toBe("2026-06-12");
    expect(subjectiveDateFor(new Date(2026, 5, 12, 23, 59))).toBe("2026-06-12");
  });
  it("00:00-04:59 は前日キー", () => {
    expect(subjectiveDateFor(new Date(2026, 5, 12, 0, 0))).toBe("2026-06-11");
    expect(subjectiveDateFor(new Date(2026, 5, 12, 4, 59))).toBe("2026-06-11");
  });
  it("月初・年初跨ぎ（カレンダー演算）", () => {
    expect(subjectiveDateFor(new Date(2026, 6, 1, 2, 0))).toBe("2026-06-30");
    expect(subjectiveDateFor(new Date(2027, 0, 1, 3, 30))).toBe("2026-12-31");
  });
  it("formatIsoDateLocal / toHHMM はゼロ詰め", () => {
    expect(formatIsoDateLocal(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toHHMM(new Date(2026, 5, 12, 7, 5))).toBe("07:05");
  });
});

describe("daySegmentsFromGraph — DayGraph nodes → DaySegmentLite 写像", () => {
  const result = graphFor([
    oneOffAnchor({ id: "a1", title: "打合せ", startTime: "10:00", endTime: "11:00" }),
    oneOffAnchor({ id: "a2", title: "通院", startTime: "15:00", endTime: "16:00" }),
  ]);
  const segments = daySegmentsFromGraph(result.graph);

  it("event / gap のみ写像し start・end（observation boundary）は含めない", () => {
    expect(segments.every((s) => s.kind === "event" || s.kind === "gap")).toBe(true);
    expect(segments.filter((s) => s.kind === "event")).toHaveLength(2);
    expect(segments.filter((s) => s.kind === "gap").length).toBeGreaterThan(0);
  });

  it("event は label / latencyTolerance / timeBucket / durationMin を DayGraph 計算済み値から流用", () => {
    const ev = segments.find((s) => s.kind === "event" && s.startHHMM === "10:00");
    expect(ev).toBeDefined();
    expect(ev!.label).toBe("打合せ");
    expect(ev!.durationMin).toBe(60);
    expect(ev!.timeBucket).toBe("morning");
    expect(ev!.latencyTolerance).toBeDefined();
  });
});

describe("resolveShiftInput — 優先順位と捏造禁止", () => {
  const anchors = [
    oneOffAnchor({ id: "w1", title: "シフト", startTime: "22:00", endTime: "23:00", sourceId: "src-shift" }),
  ];
  const result = graphFor(anchors);

  it("休み印が最優先（public_holiday / off → off、requested_off → off_request）", () => {
    expect(resolveShiftInput({ dayIndicatorVariant: "public_holiday" })).toEqual({ kind: "off" });
    expect(resolveShiftInput({ dayIndicatorVariant: "off" })).toEqual({ kind: "off" });
    expect(resolveShiftInput({ dayIndicatorVariant: "requested_off" })).toEqual({ kind: "off_request" });
  });

  it("シフト表取り込み source の anchor → work（anchor の原時刻を使う = boundary clip 前）", () => {
    const shift = resolveShiftInput({
      graph: result.graph,
      anchors,
      shiftSourceIds: new Set(["src-shift"]),
    });
    expect(shift).toEqual({ kind: "work", startTime: "22:00", endTime: "23:00" });
  });

  it("shift source 非該当 / 集合空 → none（manual 予定から勤務を推測しない）", () => {
    expect(
      resolveShiftInput({ graph: result.graph, anchors, shiftSourceIds: new Set(["other"]) }),
    ).toEqual({ kind: "none" });
    expect(resolveShiftInput({ graph: result.graph, anchors, shiftSourceIds: new Set() })).toEqual({
      kind: "none",
    });
  });
});

describe("buildAlterDayInput — 統合（事実写像のみ・weather null・density 流用）", () => {
  const anchors = [
    oneOffAnchor({ id: "a1", title: "打合せ", startTime: "10:00", endTime: "11:00" }),
  ];
  const result = graphFor(anchors);

  it("date は主観日・nowHHMM 注入・density は DayGraph 計算済み値・weather は null（W3a 欠測の正直表示）", () => {
    const { date, input } = buildAlterDayInput({
      now: new Date(2026, 5, 12, 7, 30),
      graphResult: result,
    });
    expect(date).toBe("2026-06-12");
    expect(input.nowHHMM).toBe("07:30");
    expect(input.density).toBe(result.graph.attributes.density);
    expect(input.weather).toBeNull();
    expect(input.segments.length).toBeGreaterThan(0);
  });

  it("graph 欠如日は segments=[]（予定の無い日）・hasUnresolvedTravel undefined", () => {
    const { input } = buildAlterDayInput({ now: new Date(2026, 5, 12, 7, 30), graphResult: undefined });
    expect(input.segments).toEqual([]);
    expect(input.hasUnresolvedTravel).toBeUndefined();
    expect(input.shift).toEqual({ kind: "none" });
  });

  it("transitions あり → hasUnresolvedTravel=true（travel segment を捏造しない）", () => {
    const twoPlaces = graphFor([
      oneOffAnchor({ id: "a1", title: "会議", startTime: "10:00", endTime: "11:00", locationText: "渋谷" }),
      oneOffAnchor({ id: "a2", title: "面談", startTime: "14:00", endTime: "15:00", locationText: "新宿" }),
    ]);
    const { input } = buildAlterDayInput({ now: new Date(2026, 5, 12, 7, 30), graphResult: twoPlaces });
    if (twoPlaces.graph.transitions.length > 0) {
      expect(input.hasUnresolvedTravel).toBe(true);
      expect(input.segments.some((s) => s.kind === "travel")).toBe(false);
    } else {
      expect(input.hasUnresolvedTravel).toBe(false);
    }
  });
});
