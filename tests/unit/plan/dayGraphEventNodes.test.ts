/**
 * Phase 3-K K-1b — EventNode generation + displayLabel + redaction tests
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §4.3 / §7 / §22
 *
 * 検証範囲:
 *   - buildDisplayLabel: sensitive 別 generic / non-sensitive title
 *   - buildEventNodeFromAnchor: 全 attribute 正確注入 + sensitive redaction
 *   - buildEventNodesFromAnchors: warnings 収集 + sort + duplicate id
 *   - anchor mutation 0 確認
 */

import { describe, expect, it } from "vitest";

import {
  buildDisplayLabel,
  buildEventNodeFromAnchor,
  buildEventNodesFromAnchors,
} from "@/lib/plan/dayGraph/eventNodes";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeAnchor(overrides: Partial<ExternalAnchor> = {}): ExternalAnchor {
  return {
    id: "anchor_a",
    userId: "user_test",
    title: "カフェ",
    startTime: "14:00",
    endTime: "15:00",
    locationText: "渋谷",
    rigidity: "soft",
    sourceId: "src_1",
    confirmedAt: "2026-05-22T10:00:00.000Z",
    anchorKind: "one_off",
    date: "2026-05-22",
    ...overrides,
  } as ExternalAnchor;
}

const DEFAULT_BOUNDS = { startMin: 360, endMin: 1380 }; // 06:00 - 23:00

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildDisplayLabel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildDisplayLabel", () => {
  it("非 sensitive + title → title そのまま", () => {
    expect(buildDisplayLabel(makeAnchor({ title: "カフェ" }))).toBe("カフェ");
  });

  it("sensitive medical → '予定 (= 医療系)'", () => {
    expect(
      buildDisplayLabel(makeAnchor({ title: "MRI 予約", sensitiveCategory: "medical" })),
    ).toBe("予定 (= 医療系)");
  });

  it("sensitive legal → '予定 (= 法務系)'", () => {
    expect(
      buildDisplayLabel(makeAnchor({ title: "弁護士相談", sensitiveCategory: "legal" })),
    ).toBe("予定 (= 法務系)");
  });

  it("sensitive exam → '予定 (= 試験系)'", () => {
    expect(
      buildDisplayLabel(makeAnchor({ title: "TOEIC", sensitiveCategory: "exam" })),
    ).toBe("予定 (= 試験系)");
  });

  it("sensitive other → '予定 (= 機密)'", () => {
    expect(
      buildDisplayLabel(makeAnchor({ title: "個人事情", sensitiveCategory: "other" })),
    ).toBe("予定 (= 機密)");
  });

  it("title 空 → '予定' fallback", () => {
    expect(buildDisplayLabel(makeAnchor({ title: "" }))).toBe("予定");
    expect(buildDisplayLabel(makeAnchor({ title: "   " }))).toBe("予定");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildEventNodeFromAnchor — ok cases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildEventNodeFromAnchor — ok cases", () => {
  it("通常 anchor → EventNode 完全変換", () => {
    const anchor = makeAnchor();
    const r = buildEventNodeFromAnchor({
      anchor,
      allDayAnchors: [anchor],
      overlapsIds: new Set(),
      bounds: DEFAULT_BOUNDS,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.node.kind).toBe("event");
    expect(r.node.origin).toBe("explicit");
    expect(r.node.id).toBe("anchor_a");
    expect(r.node.anchorId).toBe("anchor_a");
    expect(r.node.startTime).toBe("14:00");
    expect(r.node.endTime).toBe("15:00");
    expect(r.node.durationMin).toBe(60);
    expect(r.node.timeBucket).toBe("afternoon");
    expect(r.node.title).toBe("カフェ");
    expect(r.node.locationText).toBe("渋谷");
    expect(r.node.verb).toBe("eat");
    expect(r.node.rigidity).toBe("soft");
    expect(r.node.latencyTolerance).toBe("flexible");
    expect(r.node.sensitive).toBe(false);
    expect(r.node.displayLabel).toBe("カフェ");
    expect(r.node.overlapsWithNodeIds).toEqual([]);
  });

  it("endTime 欠落 → DEFAULT_EVENT_DURATION_MIN (60 分) で補完", () => {
    const anchor = makeAnchor({ endTime: undefined });
    const r = buildEventNodeFromAnchor({
      anchor,
      allDayAnchors: [anchor],
      overlapsIds: new Set(),
      bounds: DEFAULT_BOUNDS,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.node.startTime).toBe("14:00");
    expect(r.node.endTime).toBe("15:00");
    expect(r.node.durationMin).toBe(60);
  });

  it("endTime > boundary → boundary に clip (= warning なし)", () => {
    const anchor = makeAnchor({ startTime: "22:00", endTime: "23:30" });
    const r = buildEventNodeFromAnchor({
      anchor,
      allDayAnchors: [anchor],
      overlapsIds: new Set(),
      bounds: DEFAULT_BOUNDS,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.node.endTime).toBe("23:00"); // clipped
    expect(r.node.durationMin).toBe(60);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildEventNodeFromAnchor — sensitive redaction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildEventNodeFromAnchor — sensitive redaction", () => {
  it("sensitive medical → title / locationText undefined、 displayLabel safe", () => {
    const anchor = makeAnchor({
      title: "MRI 予約",
      locationText: "○○病院",
      sensitiveCategory: "medical",
    });
    const r = buildEventNodeFromAnchor({
      anchor,
      allDayAnchors: [anchor],
      overlapsIds: new Set(),
      bounds: DEFAULT_BOUNDS,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.node.sensitive).toBe(true);
    expect(r.node.title).toBeUndefined();
    expect(r.node.locationText).toBeUndefined();
    expect(r.node.displayLabel).toBe("予定 (= 医療系)");
    expect(r.node.sensitiveCategory).toBe("medical");
  });

  it("sensitive でも verb / latencyTolerance は計算済 (= 内部 attribute)", () => {
    const anchor = makeAnchor({
      title: "病院 受診",
      sensitiveCategory: "medical",
    });
    const r = buildEventNodeFromAnchor({
      anchor,
      allDayAnchors: [anchor],
      overlapsIds: new Set(),
      bounds: DEFAULT_BOUNDS,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.node.verb).toBe("care"); // 病院 → care
    expect(r.node.latencyTolerance).toBe("strict"); // 病院 → strict
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildEventNodeFromAnchor — warnings
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildEventNodeFromAnchor — warnings", () => {
  it("invalid_time: startTime 不正 (ISO 8601)", () => {
    const anchor = makeAnchor({ startTime: "2026-05-22T14:00:00Z" });
    const r = buildEventNodeFromAnchor({
      anchor,
      allDayAnchors: [anchor],
      overlapsIds: new Set(),
      bounds: DEFAULT_BOUNDS,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.warning.kind).toBe("invalid_time");
    expect(r.warning.anchorId).toBe("anchor_a");
  });

  it("invalid_time: endTime 不正", () => {
    const anchor = makeAnchor({ endTime: "abc" });
    const r = buildEventNodeFromAnchor({
      anchor,
      allDayAnchors: [anchor],
      overlapsIds: new Set(),
      bounds: DEFAULT_BOUNDS,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.warning.kind).toBe("invalid_time");
  });

  it("end_before_start", () => {
    const anchor = makeAnchor({ startTime: "15:00", endTime: "14:00" });
    const r = buildEventNodeFromAnchor({
      anchor,
      allDayAnchors: [anchor],
      overlapsIds: new Set(),
      bounds: DEFAULT_BOUNDS,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.warning.kind).toBe("end_before_start");
  });

  it("anchor_outside_boundary: startTime が boundary 前", () => {
    const anchor = makeAnchor({ startTime: "04:00", endTime: "05:00" });
    const r = buildEventNodeFromAnchor({
      anchor,
      allDayAnchors: [anchor],
      overlapsIds: new Set(),
      bounds: DEFAULT_BOUNDS,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.warning.kind).toBe("anchor_outside_boundary");
  });

  it("anchor_outside_boundary: startTime が boundary 後", () => {
    const anchor = makeAnchor({ startTime: "23:30", endTime: "23:45" });
    const r = buildEventNodeFromAnchor({
      anchor,
      allDayAnchors: [anchor],
      overlapsIds: new Set(),
      bounds: DEFAULT_BOUNDS,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.warning.kind).toBe("anchor_outside_boundary");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildEventNodesFromAnchors — batch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildEventNodesFromAnchors — batch", () => {
  it("複数 anchor → startTime 昇順 sort", () => {
    const anchors: ExternalAnchor[] = [
      makeAnchor({ id: "c", startTime: "16:00", endTime: "17:00" }),
      makeAnchor({ id: "a", startTime: "10:00", endTime: "11:00" }),
      makeAnchor({ id: "b", startTime: "13:00", endTime: "14:00" }),
    ];
    const { events, warnings } = buildEventNodesFromAnchors({
      anchors,
      bounds: DEFAULT_BOUNDS,
    });
    expect(events.length).toBe(3);
    expect(events[0]!.id).toBe("a");
    expect(events[1]!.id).toBe("b");
    expect(events[2]!.id).toBe("c");
    expect(warnings.length).toBe(0);
  });

  it("invalid anchor は warning + skip、 valid は continue", () => {
    const anchors: ExternalAnchor[] = [
      makeAnchor({ id: "good", startTime: "14:00", endTime: "15:00" }),
      makeAnchor({ id: "bad_time", startTime: "abc", endTime: "15:00" }),
      makeAnchor({ id: "outside", startTime: "03:00", endTime: "04:00" }),
    ];
    const { events, warnings } = buildEventNodesFromAnchors({
      anchors,
      bounds: DEFAULT_BOUNDS,
    });
    expect(events.length).toBe(1);
    expect(events[0]!.id).toBe("good");
    expect(warnings.length).toBe(2);
    const kinds = warnings.map((w) => w.kind);
    expect(kinds).toContain("invalid_time");
    expect(kinds).toContain("anchor_outside_boundary");
  });

  it("duplicate anchor id → warning + 1 個のみ採用", () => {
    const anchors: ExternalAnchor[] = [
      makeAnchor({ id: "dup", startTime: "10:00", endTime: "11:00" }),
      makeAnchor({ id: "dup", startTime: "14:00", endTime: "15:00" }),
    ];
    const { events, warnings } = buildEventNodesFromAnchors({
      anchors,
      bounds: DEFAULT_BOUNDS,
    });
    expect(events.length).toBe(1);
    expect(events[0]!.startTime).toBe("10:00");
    expect(warnings.some((w) => w.kind === "duplicate_anchor_id")).toBe(true);
  });

  it("missing_date: one_off だが date undefined", () => {
    // 型 narrow を bypass して欠落 anchor を構築 (= runtime 防御 path の検証)
    const bad = {
      ...makeAnchor(),
      date: undefined,
    } as unknown as ExternalAnchor;
    const { events, warnings } = buildEventNodesFromAnchors({
      anchors: [bad],
      bounds: DEFAULT_BOUNDS,
    });
    expect(events.length).toBe(0);
    expect(warnings.some((w) => w.kind === "missing_date")).toBe(true);
  });

  it("overlap detection: 同時刻 2 anchor → overlapsWithNodeIds に互いを含む", () => {
    const anchors: ExternalAnchor[] = [
      makeAnchor({ id: "a", startTime: "14:00", endTime: "16:00" }),
      makeAnchor({ id: "b", startTime: "15:00", endTime: "17:00" }),
    ];
    const { events } = buildEventNodesFromAnchors({
      anchors,
      bounds: DEFAULT_BOUNDS,
    });
    expect(events.length).toBe(2);
    const a = events.find((e) => e.id === "a")!;
    const b = events.find((e) => e.id === "b")!;
    expect(a.overlapsWithNodeIds).toContain("b");
    expect(b.overlapsWithNodeIds).toContain("a");
  });

  it("non-overlap: 連続 anchor → overlapsWithNodeIds 空", () => {
    const anchors: ExternalAnchor[] = [
      makeAnchor({ id: "a", startTime: "14:00", endTime: "15:00" }),
      makeAnchor({ id: "b", startTime: "15:00", endTime: "16:00" }),
    ];
    const { events } = buildEventNodesFromAnchors({
      anchors,
      bounds: DEFAULT_BOUNDS,
    });
    expect(events.find((e) => e.id === "a")!.overlapsWithNodeIds).toEqual([]);
    expect(events.find((e) => e.id === "b")!.overlapsWithNodeIds).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// anchor mutation 不可 (= Invariant 10)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("anchor mutation 不可 (= Invariant 10)", () => {
  it("入力 anchor を mutate しない", () => {
    const anchor = makeAnchor({
      title: "MRI 予約",
      locationText: "○○病院",
      sensitiveCategory: "medical",
    });
    const frozen = JSON.stringify(anchor);
    buildEventNodeFromAnchor({
      anchor,
      allDayAnchors: [anchor],
      overlapsIds: new Set(),
      bounds: DEFAULT_BOUNDS,
    });
    expect(JSON.stringify(anchor)).toBe(frozen);
  });

  it("入力 anchors 配列を mutate しない", () => {
    const anchors = [
      makeAnchor({ id: "a", startTime: "10:00", endTime: "11:00" }),
      makeAnchor({ id: "b", startTime: "14:00", endTime: "15:00" }),
    ];
    const frozen = JSON.stringify(anchors);
    buildEventNodesFromAnchors({ anchors, bounds: DEFAULT_BOUNDS });
    expect(JSON.stringify(anchors)).toBe(frozen);
  });
});
