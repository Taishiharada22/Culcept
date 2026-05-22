/**
 * Phase 3-K-2 — planClientDayGraphHelpers tests
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §14 K-2 placeholder
 *
 * 検証範囲:
 *   - collectAnchoredDateStrings: 一意 + 昇順 + 今日含む + recurring 除外
 *   - computeDayGraphMapForAnchors: byDate + allWarnings flatten
 *   - resolver injection (= app/ への依存ゼロ)
 *   - JSON-safe output (= Map ではなく Record)
 *   - input mutation 不可
 */

import { describe, expect, it } from "vitest";

import {
  collectAnchoredDateStrings,
  computeDayGraphMapForAnchors,
  type AnchorsForDateResolver,
} from "@/lib/plan/dayGraph/planClientDayGraphHelpers";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function anchor(partial: Partial<ExternalAnchor> & { id: string }): ExternalAnchor {
  return {
    id: partial.id,
    userId: "user_test",
    title: partial.title ?? "test",
    startTime: partial.startTime ?? "14:00",
    endTime: partial.endTime ?? "15:00",
    locationText: partial.locationText,
    locationCategory: partial.locationCategory,
    rigidity: partial.rigidity ?? "soft",
    sourceId: "src",
    confirmedAt: "2026-05-22T10:00:00.000Z",
    anchorKind: partial.anchorKind ?? "one_off",
    date: partial.date,
    validFrom: partial.validFrom,
    validUntil: partial.validUntil,
    recurrenceRule: partial.recurrenceRule,
    exceptionDates: partial.exceptionDates,
    sensitiveCategory: partial.sensitiveCategory,
  } as ExternalAnchor;
}

const NOW = new Date("2026-05-22T10:00:00.000Z");

/**
 * Test 用 resolver: anchor.date === dateString のものだけ返す簡易版。
 * production の anchorsForDay は recurring 展開も行うが、 K-2 helper test では不要。
 */
const SIMPLE_RESOLVER: AnchorsForDateResolver = (anchors, date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const da = String(date.getUTCDate()).padStart(2, "0");
  const target = `${y}-${m}-${da}`;
  return anchors.filter(
    (a) => a.anchorKind === "one_off" && a.date === target,
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// collectAnchoredDateStrings
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("collectAnchoredDateStrings", () => {
  it("空 anchors → 今日のみ", () => {
    const r = collectAnchoredDateStrings({ anchors: [], nowDate: NOW });
    expect(r).toEqual(["2026-05-22"]);
  });

  it("one_off anchor の date を含める", () => {
    const r = collectAnchoredDateStrings({
      anchors: [
        anchor({ id: "a1", date: "2026-05-20" }),
        anchor({ id: "a2", date: "2026-05-25" }),
      ],
      nowDate: NOW,
    });
    expect(r).toEqual(["2026-05-20", "2026-05-22", "2026-05-25"]);
  });

  it("重複 date は 1 個に集約", () => {
    const r = collectAnchoredDateStrings({
      anchors: [
        anchor({ id: "a1", date: "2026-05-22" }),
        anchor({ id: "a2", date: "2026-05-22" }),
      ],
      nowDate: NOW,
    });
    expect(r).toEqual(["2026-05-22"]);
  });

  it("recurring anchor は date 抽出対象外", () => {
    const r = collectAnchoredDateStrings({
      anchors: [
        anchor({
          id: "rec",
          anchorKind: "recurring",
          validFrom: "2026-01-01",
          recurrenceRule: "FREQ=WEEKLY",
        }),
      ],
      nowDate: NOW,
    });
    expect(r).toEqual(["2026-05-22"]);
  });

  it("date undefined の one_off は skip", () => {
    const r = collectAnchoredDateStrings({
      anchors: [
        anchor({ id: "bad", anchorKind: "one_off", date: undefined }) as ExternalAnchor,
      ],
      nowDate: NOW,
    });
    expect(r).toEqual(["2026-05-22"]);
  });

  it("結果は昇順 sort (= deterministic)", () => {
    const r = collectAnchoredDateStrings({
      anchors: [
        anchor({ id: "a", date: "2026-06-01" }),
        anchor({ id: "b", date: "2026-04-01" }),
        anchor({ id: "c", date: "2026-05-01" }),
      ],
      nowDate: NOW,
    });
    expect(r).toEqual(["2026-04-01", "2026-05-01", "2026-05-22", "2026-06-01"]);
  });

  it("input anchors mutation なし", () => {
    const anchors = [
      anchor({ id: "a", date: "2026-05-20" }),
      anchor({ id: "b", date: "2026-05-25" }),
    ];
    const frozen = JSON.stringify(anchors);
    collectAnchoredDateStrings({ anchors, nowDate: NOW });
    expect(JSON.stringify(anchors)).toBe(frozen);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeDayGraphMapForAnchors
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeDayGraphMapForAnchors — basic", () => {
  it("空 dateStrings → 空 byDate + 空 warnings", () => {
    const r = computeDayGraphMapForAnchors({
      anchors: [],
      dateStrings: [],
      resolveAnchorsForDate: SIMPLE_RESOLVER,
    });
    expect(r.byDate).toEqual({});
    expect(r.allWarnings).toEqual([]);
  });

  it("1 date / 1 anchor → byDate に entry 1 個 + graph 成立", () => {
    const a = anchor({ id: "x", date: "2026-05-22", title: "カフェ" });
    const r = computeDayGraphMapForAnchors({
      anchors: [a],
      dateStrings: ["2026-05-22"],
      resolveAnchorsForDate: SIMPLE_RESOLVER,
    });
    expect(Object.keys(r.byDate).length).toBe(1);
    expect(r.byDate["2026-05-22"]).toBeDefined();
    expect(r.byDate["2026-05-22"]!.graph.attributes.anchorCount).toBe(1);
    expect(r.byDate["2026-05-22"]!.warnings).toEqual([]);
    expect(r.allWarnings).toEqual([]);
  });

  it("複数 date → date 別 byDate + warnings flatten", () => {
    const anchors = [
      anchor({ id: "a", date: "2026-05-22", title: "ランチ" }),
      anchor({ id: "b", date: "2026-05-23", title: "ジム" }),
    ];
    const r = computeDayGraphMapForAnchors({
      anchors,
      dateStrings: ["2026-05-22", "2026-05-23"],
      resolveAnchorsForDate: SIMPLE_RESOLVER,
    });
    expect(Object.keys(r.byDate).length).toBe(2);
    expect(r.byDate["2026-05-22"]!.graph.attributes.anchorCount).toBe(1);
    expect(r.byDate["2026-05-23"]!.graph.attributes.anchorCount).toBe(1);
  });

  it("warnings は flatten される (= invalid anchor on 1 date)", () => {
    const bad = anchor({ id: "bad", date: "2026-05-22", startTime: "abc" });
    const r = computeDayGraphMapForAnchors({
      anchors: [bad],
      dateStrings: ["2026-05-22"],
      resolveAnchorsForDate: SIMPLE_RESOLVER,
    });
    expect(r.allWarnings.length).toBeGreaterThan(0);
    expect(r.allWarnings.some((w) => w.kind === "invalid_time")).toBe(true);
  });

  it("不正 dateString format → missing_date warning + skip", () => {
    const r = computeDayGraphMapForAnchors({
      anchors: [],
      dateStrings: ["NOT-A-DATE", "2026-05-22"],
      resolveAnchorsForDate: SIMPLE_RESOLVER,
    });
    expect(r.byDate["NOT-A-DATE"]).toBeUndefined();
    expect(r.byDate["2026-05-22"]).toBeDefined();
    expect(r.allWarnings.some((w) => w.kind === "missing_date")).toBe(true);
  });
});

describe("computeDayGraphMapForAnchors — resolver injection", () => {
  it("caller 注入 resolver が呼ばれる", () => {
    let callCount = 0;
    const trackingResolver: AnchorsForDateResolver = (anchors, _date) => {
      callCount++;
      return anchors as ExternalAnchor[];
    };
    computeDayGraphMapForAnchors({
      anchors: [],
      dateStrings: ["2026-05-22", "2026-05-23"],
      resolveAnchorsForDate: trackingResolver,
    });
    expect(callCount).toBe(2);
  });

  it("resolver が返した anchors のみ buildDayGraph に渡る (= isolation 検証)", () => {
    const allAnchors = [
      anchor({ id: "may22", date: "2026-05-22" }),
      anchor({ id: "may23", date: "2026-05-23" }),
    ];
    // 「全 anchor を 1 date に押し込む」 evil resolver
    const evilResolver: AnchorsForDateResolver = (anchors) => anchors;
    const r = computeDayGraphMapForAnchors({
      anchors: allAnchors,
      dateStrings: ["2026-05-22"],
      resolveAnchorsForDate: evilResolver,
    });
    // evil resolver で 2 anchor が 1 date に
    expect(r.byDate["2026-05-22"]!.graph.attributes.anchorCount).toBe(2);
  });
});

describe("computeDayGraphMapForAnchors — JSON-safe output", () => {
  it("byDate は Record (= Map ではない、 JSON.stringify 通る)", () => {
    const a = anchor({ id: "x", date: "2026-05-22" });
    const r = computeDayGraphMapForAnchors({
      anchors: [a],
      dateStrings: ["2026-05-22"],
      resolveAnchorsForDate: SIMPLE_RESOLVER,
    });
    const serialized = JSON.stringify(r.byDate);
    expect(serialized).toContain("2026-05-22");
    expect(serialized).toContain("snapshotId");
    expect(r.byDate instanceof Map).toBe(false);
  });

  it("graph の attributes.timeBucketCoverage は Array (= 既存 K-1f-β invariant)", () => {
    const a = anchor({ id: "x", date: "2026-05-22", startTime: "14:00", endTime: "15:00" });
    const r = computeDayGraphMapForAnchors({
      anchors: [a],
      dateStrings: ["2026-05-22"],
      resolveAnchorsForDate: SIMPLE_RESOLVER,
    });
    expect(Array.isArray(r.byDate["2026-05-22"]!.graph.attributes.timeBucketCoverage)).toBe(true);
  });
});

describe("computeDayGraphMapForAnchors — input mutation 不可", () => {
  it("anchors mutation なし", () => {
    const anchors = [anchor({ id: "a", date: "2026-05-22" })];
    const frozen = JSON.stringify(anchors);
    computeDayGraphMapForAnchors({
      anchors,
      dateStrings: ["2026-05-22"],
      resolveAnchorsForDate: SIMPLE_RESOLVER,
    });
    expect(JSON.stringify(anchors)).toBe(frozen);
  });

  it("dateStrings mutation なし", () => {
    const dates = ["2026-05-22", "2026-05-23"];
    const frozen = JSON.stringify(dates);
    computeDayGraphMapForAnchors({
      anchors: [],
      dateStrings: dates,
      resolveAnchorsForDate: SIMPLE_RESOLVER,
    });
    expect(JSON.stringify(dates)).toBe(frozen);
  });
});
