/**
 * W1-X5 Anchor Detail Format Helpers — pure tests
 *
 * 詳細表示用フォーマット helper が deterministic に固定されることを検証。
 */

import { describe, it, expect } from "vitest";

import type {
  ExternalAnchor,
  OneOffExternalAnchor,
} from "@/lib/plan/external-anchor";
import {
  buildDeleteImpactSummary,
  formatExceptionDates,
  formatJpDateLong,
  formatLocation,
  formatRRuleJp,
  formatTime,
  formatTimeRange,
  formatValidityRange,
  formatWeekdaysJp,
  LOCATION_CATEGORY_LABEL,
  RIGIDITY_LABEL,
  SENSITIVE_LABEL,
  SOURCE_TYPE_LABEL,
} from "@/lib/plan/anchor-detail-format";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function oneOff(
  overrides: Partial<OneOffExternalAnchor> = {}
): OneOffExternalAnchor {
  return {
    id: "a1",
    userId: "user-a",
    sourceId: "src-1",
    confirmedAt: "2026-05-18T00:00:00.000Z",
    title: "歯科予約",
    startTime: "14:30",
    rigidity: "hard",
    anchorKind: "one_off",
    date: "2026-05-25",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatJpDateLong", () => {
  it.each([
    ["2026-05-25", "5月25日(月)"],
    ["2026-01-01", "1月1日(木)"],
    ["2026-12-31", "12月31日(木)"],
  ])("%s → %s", (input, expected) => {
    expect(formatJpDateLong(input)).toBe(expected);
  });

  it("不正 format → 入力そのまま (fail-safe)", () => {
    expect(formatJpDateLong("bad")).toBe("bad");
    expect(formatJpDateLong("2026-02-30")).toBe("2026-02-30"); // 物理的無効
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatTime / formatTimeRange", () => {
  it("formatTime 秒切捨て", () => {
    expect(formatTime("14:30:45")).toBe("14:30");
    expect(formatTime("14:30")).toBe("14:30");
  });

  it("formatTimeRange end あり", () => {
    expect(formatTimeRange("14:30:00", "15:30:00")).toBe("14:30 – 15:30");
  });

  it("formatTimeRange end なし", () => {
    expect(formatTimeRange("14:30")).toBe("14:30");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatWeekdaysJp / formatRRuleJp", () => {
  it("単日", () => {
    expect(formatWeekdaysJp(["MO"])).toBe("月");
  });

  it("複数 中黒区切り", () => {
    expect(formatWeekdaysJp(["MO", "WE", "FR"])).toBe("月・水・金");
  });

  it("週末", () => {
    expect(formatWeekdaysJp(["SA", "SU"])).toBe("土・日");
  });

  it("空 → 「曜日なし」", () => {
    expect(formatWeekdaysJp([])).toBe("曜日なし");
  });

  it("formatRRuleJp 基本", () => {
    expect(formatRRuleJp("FREQ=WEEKLY;BYDAY=MO,WE,FR")).toBe("毎週 月・水・金");
  });

  it("formatRRuleJp 範囲外 → 入力そのまま", () => {
    expect(formatRRuleJp("FREQ=DAILY")).toBe("FREQ=DAILY");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatValidityRange", () => {
  it("終了日あり", () => {
    expect(formatValidityRange("2026-05-04", "2026-12-31")).toBe(
      "5月4日(月) 〜 12月31日(木)"
    );
  });

  it("終了日なし → 終了未定", () => {
    expect(formatValidityRange("2026-05-04")).toBe("5月4日(月) 〜（終了未定）");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatExceptionDates", () => {
  it("複数日", () => {
    expect(formatExceptionDates(["2026-05-03", "2026-07-17"])).toBe(
      "5月3日(日) / 7月17日(金)"
    );
  });

  it("undefined → 「例外日なし」", () => {
    expect(formatExceptionDates(undefined)).toBe("例外日なし");
  });

  it("空配列 → 「例外日なし」", () => {
    expect(formatExceptionDates([])).toBe("例外日なし");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatLocation", () => {
  it("category + text 両方", () => {
    expect(
      formatLocation(
        oneOff({ locationCategory: "public", locationText: "渋谷駅" })
      )
    ).toBe("公共 / 渋谷駅");
  });

  it("category のみ", () => {
    expect(formatLocation(oneOff({ locationCategory: "home" }))).toBe("家");
  });

  it("text のみ → text", () => {
    expect(formatLocation(oneOff({ locationText: "謎の場所" }))).toBe("謎の場所");
  });

  it("両方なし → 「場所未指定」", () => {
    expect(formatLocation(oneOff())).toBe("場所未指定");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Label maps", () => {
  it("RIGIDITY_LABEL", () => {
    expect(RIGIDITY_LABEL.hard).toBe("動かせない");
    expect(RIGIDITY_LABEL.soft).toBe("動かせる");
  });

  it("LOCATION_CATEGORY_LABEL カバレッジ", () => {
    expect(LOCATION_CATEGORY_LABEL.home).toBe("家");
    expect(LOCATION_CATEGORY_LABEL.office).toBe("職場");
    expect(LOCATION_CATEGORY_LABEL.unknown).toBe("未分類");
  });

  it("SENSITIVE_LABEL", () => {
    expect(SENSITIVE_LABEL.medical).toBe("医療");
  });

  it("SOURCE_TYPE_LABEL", () => {
    expect(SOURCE_TYPE_LABEL.manual).toBe("手動");
    expect(SOURCE_TYPE_LABEL.template).toBe("テンプレ");
    expect(SOURCE_TYPE_LABEL.pdf).toBe("PDF");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildDeleteImpactSummary", () => {
  const anchors: ExternalAnchor[] = [
    oneOff({ id: "a1", sourceId: "src-1", title: "歯科予約", date: "2026-05-25" }),
    oneOff({ id: "a2", sourceId: "src-1", title: "歯科予約", date: "2026-06-10" }),
    oneOff({ id: "a3", sourceId: "src-1", title: "歯科の検診", date: "2026-07-15" }),
    oneOff({ id: "a4", sourceId: "src-1", title: "歯科の追加検査", date: "2026-08-01" }),
    oneOff({ id: "a5", sourceId: "src-2", title: "別の予定", date: "2026-09-01" }),
  ];

  it("source-1 → 4 件、代表 3 件（unique title 上限）", () => {
    const s = buildDeleteImpactSummary(anchors, "src-1");
    expect(s.totalCount).toBe(4);
    // unique titles 上限 3: ['歯科予約', '歯科の検診', '歯科の追加検査']
    expect(s.representativeTitles).toEqual([
      "歯科予約",
      "歯科の検診",
      "歯科の追加検査",
    ]);
    // 4 件のうち 3 件表示、残り 1 件
    expect(s.remaining).toBe(1);
  });

  it("source-2 → 1 件、代表 1 件、残り 0", () => {
    const s = buildDeleteImpactSummary(anchors, "src-2");
    expect(s.totalCount).toBe(1);
    expect(s.representativeTitles).toEqual(["別の予定"]);
    expect(s.remaining).toBe(0);
  });

  it("該当 source なし → 0 件", () => {
    const s = buildDeleteImpactSummary(anchors, "nonexistent");
    expect(s.totalCount).toBe(0);
    expect(s.representativeTitles).toEqual([]);
    expect(s.remaining).toBe(0);
  });
});
