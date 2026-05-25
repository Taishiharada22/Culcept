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
  buildVisibleDateWindow,
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
// K-3c-0: extraDateStrings 拡張
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("K-3c-0: collectAnchoredDateStrings extraDateStrings", () => {
  it("extraDateStrings を渡すと union に含める", () => {
    const r = collectAnchoredDateStrings({
      anchors: [],
      nowDate: NOW,
      extraDateStrings: ["2026-05-20", "2026-05-25"],
    });
    expect(r).toEqual(["2026-05-20", "2026-05-22", "2026-05-25"]);
  });

  it("extraDateStrings 省略時は backward compat (= K-2 動作)", () => {
    const r = collectAnchoredDateStrings({
      anchors: [anchor({ id: "x", date: "2026-05-23" })],
      nowDate: NOW,
    });
    expect(r).toEqual(["2026-05-22", "2026-05-23"]);
  });

  it("不正 format string は skip (= 防御、 'YYYY-MM-DD' 以外)", () => {
    const r = collectAnchoredDateStrings({
      anchors: [],
      nowDate: NOW,
      extraDateStrings: ["2026-05-20", "BAD", "26-5-25", "2026-13-01", "2026-05-22"],
    });
    // "2026-13-01" は format pass するが意味的に不正 — 但し K-3c-0 では format
    // check のみ (= regex pass 通すと invalid date でも一旦含む)。
    // buildDayGraph 側で各 date を Date 化する際に弾く想定 (= warning 経由)。
    expect(r).toContain("2026-05-20");
    expect(r).toContain("2026-05-22");
    expect(r).not.toContain("BAD");
    expect(r).not.toContain("26-5-25");
  });

  it("重複は集約 (= today と extra が同じ date)", () => {
    const r = collectAnchoredDateStrings({
      anchors: [],
      nowDate: NOW,
      extraDateStrings: ["2026-05-22"], // today と同じ
    });
    expect(r).toEqual(["2026-05-22"]);
  });

  it("one_off date + extra date の union", () => {
    const r = collectAnchoredDateStrings({
      anchors: [
        anchor({ id: "a", date: "2026-05-20" }),
        anchor({ id: "b", date: "2026-05-23" }),
      ],
      nowDate: NOW,
      extraDateStrings: ["2026-05-25", "2026-05-23"], // 23 は重複
    });
    expect(r).toEqual([
      "2026-05-20",
      "2026-05-22",
      "2026-05-23",
      "2026-05-25",
    ]);
  });

  it("recurring-only シナリオ (= one_off date なし、 extra で補完)", () => {
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
      extraDateStrings: ["2026-05-25"], // recurring 該当日 (= visible window)
    });
    expect(r).toEqual(["2026-05-22", "2026-05-25"]);
  });

  it("extraDateStrings は immutable (= 入力配列 mutate しない)", () => {
    const extra = ["2026-05-20"];
    const frozen = JSON.stringify(extra);
    collectAnchoredDateStrings({
      anchors: [],
      nowDate: NOW,
      extraDateStrings: extra,
    });
    expect(JSON.stringify(extra)).toBe(frozen);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// K-3c-0: buildVisibleDateWindow
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("K-3c-0: buildVisibleDateWindow", () => {
  it("default (± 7 days) → 計 15 day", () => {
    const r = buildVisibleDateWindow(NOW);
    expect(r.length).toBe(15);
  });

  it("中心日を含む", () => {
    const r = buildVisibleDateWindow(NOW);
    expect(r).toContain("2026-05-22");
  });

  it("7 day 後の date を含む (= 2026-05-29)", () => {
    const r = buildVisibleDateWindow(NOW);
    expect(r).toContain("2026-05-29");
  });

  it("7 day 前の date を含む (= 2026-05-15)", () => {
    const r = buildVisibleDateWindow(NOW);
    expect(r).toContain("2026-05-15");
  });

  it("custom daysBefore / daysAfter", () => {
    const r = buildVisibleDateWindow(NOW, 2, 3);
    expect(r.length).toBe(6); // 2 + 1 + 3
    expect(r[0]).toBe("2026-05-20"); // -2
    expect(r[r.length - 1]).toBe("2026-05-25"); // +3
  });

  it("daysBefore / daysAfter 負数 → 0 に clamp (= 防御)", () => {
    const r = buildVisibleDateWindow(NOW, -5, -5);
    expect(r.length).toBe(1); // center only
    expect(r[0]).toBe("2026-05-22");
  });

  it("結果は昇順 sort (= deterministic)", () => {
    const r = buildVisibleDateWindow(NOW);
    for (let i = 0; i < r.length - 1; i++) {
      expect(r[i]!.localeCompare(r[i + 1]!)).toBeLessThan(0);
    }
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
