/**
 * Phase 3-K K-1e — Sensitive Redaction end-to-end tests
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §7
 *
 * 検証範囲:
 *   - sensitive anchor 全 4 種 (medical / legal / exam / other) の displayLabel + redaction
 *   - formatDayGraphAsAscii で raw title / locationText が出力されない
 *   - user_self vs shared_view の displayLabel 差分
 *   - DayGraphRedactionContract 全 invariant
 *
 * Wording 規約:
 *   - sensitive anchor の raw 値 "MRI 予約" / "○○病院" 等は出力に **絶対**含まれてはならない
 */

import { describe, expect, it } from "vitest";

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import { formatDayGraphAsAscii } from "@/lib/plan/dayGraph/formatDayGraphAsAscii";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

const DATE = "2026-05-22";

function anchor(overrides: Partial<ExternalAnchor> = {}): ExternalAnchor {
  return {
    id: "a",
    userId: "u",
    title: "test",
    startTime: "14:00",
    endTime: "15:00",
    rigidity: "soft",
    sourceId: "s",
    confirmedAt: "2026-05-22T10:00:00.000Z",
    anchorKind: "one_off",
    date: DATE,
    ...overrides,
  } as ExternalAnchor;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sensitive title / locationText が graph に残らない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Sensitive redaction — graph 内部", () => {
  it("medical: title='MRI 予約' / location='○○病院' → graph に raw 文字列なし", () => {
    const a = anchor({
      id: "med",
      title: "MRI 予約",
      locationText: "○○病院",
      sensitiveCategory: "medical",
    });
    const { graph } = buildDayGraph({ anchors: [a], date: DATE });
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toContain("MRI 予約");
    expect(serialized).not.toContain("○○病院");
    expect(serialized).toContain("予定 (= 医療系)"); // safe displayLabel
  });

  it("legal", () => {
    const a = anchor({
      id: "leg",
      title: "弁護士相談",
      locationText: "××法律事務所",
      sensitiveCategory: "legal",
    });
    const { graph } = buildDayGraph({ anchors: [a], date: DATE });
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toContain("弁護士相談");
    expect(serialized).not.toContain("××法律事務所");
    expect(serialized).toContain("予定 (= 法務系)");
  });

  it("exam", () => {
    const a = anchor({
      id: "exam",
      title: "TOEIC L&R",
      locationText: "△△会場",
      sensitiveCategory: "exam",
    });
    const { graph } = buildDayGraph({ anchors: [a], date: DATE });
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toContain("TOEIC L&R");
    expect(serialized).not.toContain("△△会場");
    expect(serialized).toContain("予定 (= 試験系)");
  });

  it("other", () => {
    const a = anchor({
      id: "other",
      title: "個人事情",
      locationText: "秘密の場所",
      sensitiveCategory: "other",
    });
    const { graph } = buildDayGraph({ anchors: [a], date: DATE });
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toContain("個人事情");
    expect(serialized).not.toContain("秘密の場所");
    expect(serialized).toContain("予定 (= 機密)");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sensitive redaction — formatDayGraphAsAscii
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Sensitive redaction — formatDayGraphAsAscii", () => {
  it("user_self view: sensitive event の raw 文字列が ASCII 出力に **含まれない**", () => {
    const a = anchor({
      id: "med",
      title: "MRI 予約",
      locationText: "○○病院",
      sensitiveCategory: "medical",
    });
    const { graph } = buildDayGraph({ anchors: [a], date: DATE });
    const ascii = formatDayGraphAsAscii(graph, "user_self");
    expect(ascii).not.toContain("MRI 予約");
    expect(ascii).not.toContain("○○病院");
    expect(ascii).toContain("予定 (= 医療系)"); // user_self は category hint OK
  });

  it("shared_view: sensitive event は category hint も消える", () => {
    const a = anchor({
      id: "med",
      title: "MRI 予約",
      locationText: "○○病院",
      sensitiveCategory: "medical",
    });
    const { graph } = buildDayGraph({ anchors: [a], date: DATE });
    const ascii = formatDayGraphAsAscii(graph, "shared_view");
    expect(ascii).not.toContain("MRI 予約");
    expect(ascii).not.toContain("○○病院");
    expect(ascii).not.toContain("医療系"); // shared view では category hint も消える
    expect(ascii).toContain("予定"); // generic 表現のみ
  });

  it("非 sensitive event は ASCII に通常 title が出る (= 漏れではない)", () => {
    const a = anchor({
      id: "normal",
      title: "カフェ",
      locationText: "渋谷",
      locationCategory: "cafe",
    });
    const { graph } = buildDayGraph({ anchors: [a], date: DATE });
    const ascii = formatDayGraphAsAscii(graph);
    expect(ascii).toContain("カフェ");
  });

  it("複数 sensitive 混在でも全て redacted", () => {
    const anchors = [
      anchor({
        id: "med",
        title: "MRI 予約",
        locationText: "○○病院",
        startTime: "10:00",
        endTime: "11:00",
        sensitiveCategory: "medical",
      }),
      anchor({
        id: "leg",
        title: "弁護士相談",
        locationText: "××法律事務所",
        startTime: "14:00",
        endTime: "15:00",
        sensitiveCategory: "legal",
      }),
      anchor({
        id: "normal",
        title: "ランチ",
        locationText: "新宿",
        startTime: "12:00",
        endTime: "13:00",
      }),
    ];
    const { graph } = buildDayGraph({ anchors, date: DATE });
    const ascii = formatDayGraphAsAscii(graph);
    // sensitive raw → 含まれない
    expect(ascii).not.toContain("MRI 予約");
    expect(ascii).not.toContain("○○病院");
    expect(ascii).not.toContain("弁護士相談");
    expect(ascii).not.toContain("××法律事務所");
    // 非 sensitive → 含まれる
    expect(ascii).toContain("ランチ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// transition の sensitive proximity redaction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Sensitive redaction — MovementTransition", () => {
  it("sensitive event 前後の transition は location undefined", () => {
    const anchors = [
      anchor({
        id: "med",
        title: "MRI",
        locationText: "○○病院",
        startTime: "10:00",
        endTime: "11:00",
        sensitiveCategory: "medical",
      }),
      anchor({
        id: "cafe",
        title: "カフェ",
        locationText: "渋谷",
        startTime: "13:00",
        endTime: "14:00",
      }),
    ];
    const { graph } = buildDayGraph({ anchors, date: DATE });
    expect(graph.transitions.length).toBe(1);
    const t = graph.transitions[0]!;
    expect(t.sensitiveProximity).toBe(true);
    expect(t.fromLocationText).toBeUndefined();
    expect(t.toLocationText).toBeUndefined();

    const ascii = formatDayGraphAsAscii(graph);
    expect(ascii).not.toContain("○○病院");
    expect(ascii).not.toContain("渋谷"); // sensitive proximity で redact 適用
  });
});
