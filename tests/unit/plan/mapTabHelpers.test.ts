/**
 * Phase 2-C MapTab helpers — pure logic tests (C2)
 *
 * 設計書: docs/alter-plan-phase2-c-map-tab-mini-design.md §3.3
 *
 * 検証対象:
 *   - categoryFrequencyVoice: count + windowDays → 自然語 voice
 *   - categoryTimeSignature: anchor.startTime 集計 → "朝/日中/夜/深夜/朝晩中心" or null
 *   - normalizeLocationText: dedupe 用 normalize (NFKC + lower + whitespace)
 *   - confidenceAtLeastMedium: cached low-confidence guard 判定
 *   - MAP_CATEGORY_MARKER / MAP_SENSITIVE_MARKER: 完全性
 */

import { describe, it, expect } from "vitest";

import {
  CATEGORY_META,
  LOCATION_GROUP_ORDER,
  MAP_CATEGORY_MARKER,
  MAP_SENSITIVE_MARKER,
  categoryFrequencyVoice,
  categoryTimeSignature,
  confidenceAtLeastMedium,
  normalizeLocationText,
} from "@/app/(culcept)/plan/tabs/_helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// categoryFrequencyVoice
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryFrequencyVoice", () => {
  it("count=0 → '今は静か' (empty as silence 哲学整合)", () => {
    expect(categoryFrequencyVoice(0, 14)).toBe("今は静か");
  });

  it("count=14 / windowDays=14 → '週 7 回' (daily)", () => {
    expect(categoryFrequencyVoice(14, 14)).toBe("週 7 回");
  });

  it("count=7 / windowDays=14 → '週 4 回' (Math.round)", () => {
    // 7 / 2 = 3.5 → Math.round = 4
    expect(categoryFrequencyVoice(7, 14)).toBe("週 4 回");
  });

  it("count=2 / windowDays=14 → '週 1 回'", () => {
    expect(categoryFrequencyVoice(2, 14)).toBe("週 1 回");
  });

  it("count=1 / windowDays=14 → '月 2 回' (perWeek<1 → 30 日換算)", () => {
    // perWeek = 1 / 2 = 0.5 < 1 → perMonth = 1 * (30/14) = 2.14 → Math.round = 2
    expect(categoryFrequencyVoice(1, 14)).toBe("月 2 回");
  });

  it("count=1 / windowDays=30 → '月 1 回'", () => {
    expect(categoryFrequencyVoice(1, 30)).toBe("月 1 回");
  });

  it("count=1 / windowDays=60 → '1 回 (60 日間)' (月 1 回未満)", () => {
    // perMonth = 1 * (30/60) = 0.5 → < 1 → fallback
    expect(categoryFrequencyVoice(1, 60)).toBe("1 回 (60 日間)");
  });

  it("count=負数 → '今は静か' (defensive)", () => {
    expect(categoryFrequencyVoice(-1, 14)).toBe("今は静か");
  });

  it("windowDays=0 → '{count} 回' (defensive、divide-by-zero 回避)", () => {
    expect(categoryFrequencyVoice(5, 0)).toBe("5 回");
  });

  it("pure: 同じ入力で同じ出力", () => {
    const a = categoryFrequencyVoice(7, 14);
    const b = categoryFrequencyVoice(7, 14);
    expect(a).toBe(b);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// categoryTimeSignature
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryTimeSignature", () => {
  it("anchors 空 → null", () => {
    expect(categoryTimeSignature([])).toBeNull();
  });

  it("全 anchor 朝 (5-10 時) → '朝中心'", () => {
    expect(
      categoryTimeSignature([
        { startTime: "07:00" },
        { startTime: "08:30" },
        { startTime: "09:15" },
      ]),
    ).toBe("朝中心");
  });

  it("全 anchor 日中 (11-16 時) → '日中中心'", () => {
    expect(
      categoryTimeSignature([
        { startTime: "11:00" },
        { startTime: "12:30" },
        { startTime: "15:00" },
        { startTime: "16:45" },
      ]),
    ).toBe("日中中心");
  });

  it("全 anchor 夜 (17-21 時) → '夜中心'", () => {
    expect(
      categoryTimeSignature([
        { startTime: "18:00" },
        { startTime: "20:00" },
      ]),
    ).toBe("夜中心");
  });

  it("全 anchor 深夜 (22-4 時) → '深夜中心'", () => {
    expect(
      categoryTimeSignature([
        { startTime: "23:00" },
        { startTime: "02:30" },
      ]),
    ).toBe("深夜中心");
  });

  it("過半数 (50%) で帯確定", () => {
    // 2/4 = 50% 朝 → 朝中心
    expect(
      categoryTimeSignature([
        { startTime: "07:00" },
        { startTime: "08:00" },
        { startTime: "13:00" },
        { startTime: "20:00" },
      ]),
    ).toBe("朝中心");
  });

  it("朝晩混在 (>= 60%) → '朝晩中心'", () => {
    // 2 朝 + 2 夜 = 4/5 = 80% → 朝晩中心
    expect(
      categoryTimeSignature([
        { startTime: "07:00" },
        { startTime: "08:00" },
        { startTime: "18:00" },
        { startTime: "20:00" },
        { startTime: "13:00" }, // 日中 1 件
      ]),
    ).toBe("朝晩中心");
  });

  it("過半数なし & 朝晩 < 60% → null (混在しすぎ)", () => {
    // 1 朝 + 1 日中 + 1 夜 + 1 深夜 = 各 25% → null
    expect(
      categoryTimeSignature([
        { startTime: "07:00" },
        { startTime: "13:00" },
        { startTime: "19:00" },
        { startTime: "02:00" },
      ]),
    ).toBeNull();
  });

  it("単一 anchor → 該当帯 (100% over 50%)", () => {
    expect(categoryTimeSignature([{ startTime: "09:00" }])).toBe("朝中心");
  });

  it("pure: anchors 配列を mutate しない", () => {
    const anchors = [{ startTime: "09:00" }, { startTime: "10:00" }];
    const snapshot = JSON.stringify(anchors);
    categoryTimeSignature(anchors);
    expect(JSON.stringify(anchors)).toBe(snapshot);
  });

  it("startTime parse 不能 (空文字列) は深夜帯扱い (hour=0、defensive)", () => {
    // "".slice(0, 2) = "" → Number("") = NaN → || 0 = 0 → 深夜 (22-4) に該当
    expect(categoryTimeSignature([{ startTime: "" }])).toBe("深夜中心");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// normalizeLocationText
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("normalizeLocationText", () => {
  it("trim + lower", () => {
    expect(normalizeLocationText("  Tokyo Tower  ")).toBe("tokyo tower");
  });

  it("whitespace 連続 → 1 個", () => {
    expect(normalizeLocationText("Tokyo  Tower")).toBe("tokyo tower");
  });

  it("全角空白 → 半角 (NFKC)", () => {
    expect(normalizeLocationText("Tokyo　Tower")).toBe("tokyo tower");
  });

  it("全角英大文字 → 半角小文字 (NFKC + lower)", () => {
    expect(normalizeLocationText("ＴＯＫＹＯ")).toBe("tokyo");
  });

  it("半角カナ → 全角カナ (NFKC、安全寄り)", () => {
    // ｽﾀｰﾊﾞｯｸｽ (半角カナ) → スターバックス (全角カナ)
    expect(normalizeLocationText("ｽﾀｰﾊﾞｯｸｽ")).toBe("スターバックス");
  });

  it("混在: 全角英数 + 全角空白 + 大文字 → 全部 normalize", () => {
    expect(normalizeLocationText("ＳＴＡＲＢＵＣＫＳ　代官山店")).toBe(
      "starbucks 代官山店",
    );
  });

  it("既に normalize 済 → 不変", () => {
    expect(normalizeLocationText("tokyo tower")).toBe("tokyo tower");
  });

  it("空文字列 → 空文字列", () => {
    expect(normalizeLocationText("")).toBe("");
  });

  it("空白のみ → 空文字列 (trim 後 0)", () => {
    expect(normalizeLocationText("   　　   ")).toBe("");
  });

  it("pure: 同じ入力で同じ出力", () => {
    expect(normalizeLocationText("ＴＯＫＹＯ")).toBe(
      normalizeLocationText("ＴＯＫＹＯ"),
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// confidenceAtLeastMedium
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("confidenceAtLeastMedium", () => {
  it("medium → true", () => {
    expect(confidenceAtLeastMedium("medium")).toBe(true);
  });

  it("high → true", () => {
    expect(confidenceAtLeastMedium("high")).toBe(true);
  });

  it("low → false (誤 pin 回避)", () => {
    expect(confidenceAtLeastMedium("low")).toBe(false);
  });

  it("unresolved → false", () => {
    expect(confidenceAtLeastMedium("unresolved")).toBe(false);
  });

  it("不明な値 → false (defensive)", () => {
    expect(confidenceAtLeastMedium("unknown_value")).toBe(false);
    expect(confidenceAtLeastMedium("")).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAP_CATEGORY_MARKER / MAP_SENSITIVE_MARKER (完全性)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("MAP_CATEGORY_MARKER", () => {
  it("全 LOCATION_GROUP_ORDER に対して marker spec が定義されている", () => {
    for (const cat of LOCATION_GROUP_ORDER) {
      expect(MAP_CATEGORY_MARKER[cat]).toBeDefined();
      expect(MAP_CATEGORY_MARKER[cat].color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(MAP_CATEGORY_MARKER[cat].emoji).toBeTruthy();
    }
  });

  it("CATEGORY_META と category key が一致", () => {
    for (const cat of LOCATION_GROUP_ORDER) {
      expect(CATEGORY_META[cat]).toBeDefined();
      expect(MAP_CATEGORY_MARKER[cat]).toBeDefined();
    }
  });
});

describe("MAP_SENSITIVE_MARKER", () => {
  it("color + emoji 定義済", () => {
    expect(MAP_SENSITIVE_MARKER.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(MAP_SENSITIVE_MARKER.emoji).toBe("🔒");
  });
});
