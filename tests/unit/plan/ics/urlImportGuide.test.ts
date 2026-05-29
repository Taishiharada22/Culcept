/**
 * URL Import Productization U2 — urlImportGuide contract test
 *
 * 固定対象（CEO 条件 5）: provider key / title / steps / 導線属性（oauthPrimary・urlSupported）。
 * + 条件 1（Google/Outlook=OAuth 主導線明記）/ 条件 2（Apple=公開URL明記）/ 条件 4（短さ）。
 */

import { describe, expect, it } from "vitest";

import {
  CALENDAR_URL_GUIDES,
  getCalendarUrlGuide,
  type CalendarProviderKey,
} from "@/lib/plan/ics/urlImportGuide";

describe("urlImportGuide — 構造の固定", () => {
  it("provider は 4 つ、key と順序を固定（google→outlook→apple→other）", () => {
    expect(CALENDAR_URL_GUIDES.map((g) => g.key)).toEqual([
      "google",
      "outlook",
      "apple",
      "other",
    ]);
  });

  it("各ガイドは title / lead / steps を持ち、step は 2-4 個・非空", () => {
    for (const g of CALENDAR_URL_GUIDES) {
      expect(g.title.length).toBeGreaterThan(0);
      expect(g.lead.length).toBeGreaterThan(0);
      expect(g.steps.length).toBeGreaterThanOrEqual(2);
      expect(g.steps.length).toBeLessThanOrEqual(4);
      for (const s of g.steps) expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it("条件4: modal 内可読の短さ（lead ≤ 60 / 各 step ≤ 40 文字）", () => {
    for (const g of CALENDAR_URL_GUIDES) {
      expect(g.lead.length).toBeLessThanOrEqual(60);
      for (const s of g.steps) expect(s.length).toBeLessThanOrEqual(40);
    }
  });
});

describe("urlImportGuide — 導線属性の固定（CEO 条件 1-3）", () => {
  it("Google / Outlook は oauthPrimary=true（OAuth 主導線）", () => {
    expect(getCalendarUrlGuide("google")?.oauthPrimary).toBe(true);
    expect(getCalendarUrlGuide("outlook")?.oauthPrimary).toBe(true);
  });

  it("Apple / その他 は oauthPrimary=false（OAuth ボタン無し・URL 主体）", () => {
    expect(getCalendarUrlGuide("apple")?.oauthPrimary).toBe(false);
    expect(getCalendarUrlGuide("other")?.oauthPrimary).toBe(false);
  });

  it("全 provider で urlSupported=true（URL 取り込みは補助として全対応）", () => {
    for (const g of CALENDAR_URL_GUIDES) expect(g.urlSupported).toBe(true);
  });
});

describe("urlImportGuide — 文言の要件（条件 1・2）", () => {
  it("条件1: Google / Outlook の lead は OAuth 主導線（「接続」）を明記", () => {
    expect(getCalendarUrlGuide("google")?.lead).toContain("接続");
    expect(getCalendarUrlGuide("outlook")?.lead).toContain("接続");
  });

  it("条件2: Apple の lead は「公開」カレンダー URL で取り込めることを明記", () => {
    const apple = getCalendarUrlGuide("apple");
    expect(apple?.lead).toContain("公開");
    // Apple は OAuth ボタンが無いことを示す（接続ボタンへ誤誘導しない）
    expect(apple?.lead).toContain("接続ボタンはありません");
  });

  it("Apple の手順は webcal リンクのコピーに触れる", () => {
    expect(getCalendarUrlGuide("apple")?.steps.join("")).toContain("webcal");
  });
});

describe("getCalendarUrlGuide", () => {
  it("有効 key で対応ガイドを返す", () => {
    for (const key of ["google", "outlook", "apple", "other"] as const) {
      expect(getCalendarUrlGuide(key)?.key).toBe(key);
    }
  });

  it("無効 key は undefined", () => {
    expect(getCalendarUrlGuide("yahoo" as CalendarProviderKey)).toBeUndefined();
  });
});
