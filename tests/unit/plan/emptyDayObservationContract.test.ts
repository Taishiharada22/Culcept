/**
 * Phase 3-N-3a — Empty Day Observation Pure Foundation Contract Tests
 *
 * 検証範囲 (= pure foundation):
 *   §1 isEmptyDay() の判定 (= 0 / 1 / 複数 anchors)
 *   §2 EMPTY_DAY_ENTRY_LABEL の copy contract (= 禁止語不在 + 許可語存在 + 全文一致)
 *   §3 type 整合性 (= EmptyDayEntryViewModel の structural 検証)
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用
 *   - 既存 file 不触
 *   - regression test 永続化 (= 将来の文言変更で禁止語混入を block)
 *
 * 禁止語 source (= CEO + GPT 合議 2026-05-23):
 *   - 「おすすめ」 / 「これをした方がいい」 / 「最適」 / 「推奨」 / 「改善」
 *   - 「警告」 / 「危険」 / 「注意」 / 「リスク」
 *   - 「最適化」 は 「最適」 substring match で同時に block される
 *
 * 設計書:
 *   - docs/alter-plan-phase3-n-3-plan-audit.md (= `04ccca51`)
 *   - docs/alter-plan-phase3-n-3-readiness-audit.md (= `cf869f6d`)
 */

import { describe, expect, it } from "vitest";
import {
  isEmptyDay,
  EMPTY_DAY_ENTRY_LABEL,
  type EmptyDayEntryContextTab,
  type EmptyDayEntryContext,
  type EmptyDayEntryViewModel,
} from "@/lib/plan/emptyDayObservation";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. isEmptyDay() helper — empty day 判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("N-3a §1. isEmptyDay() — empty day 判定", () => {
  it("§1.1 0 件 = true (= 完全 empty)", () => {
    expect(isEmptyDay([])).toBe(true);
  });

  it("§1.2 1 件 = false (= sparse 含めず、 scope 限定)", () => {
    expect(isEmptyDay([{ id: "anchor-1" }])).toBe(false);
  });

  it("§1.3 複数件 = false", () => {
    expect(isEmptyDay([{ id: "a" }, { id: "b" }, { id: "c" }])).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. EMPTY_DAY_ENTRY_LABEL — copy contract (= 禁止語 + 許可語 + 全文)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FORBIDDEN_WORDS: ReadonlyArray<string> = [
  "おすすめ",
  "これをした方がいい",
  "最適", // 「最適化」 もここで substring block
  "推奨",
  "改善",
  "警告",
  "危険",
  "注意",
  "リスク",
] as const;

describe("N-3a §2. EMPTY_DAY_ENTRY_LABEL — copy contract", () => {
  it.each(FORBIDDEN_WORDS)("§2.1 禁止語 「%s」 不在", (word) => {
    expect(EMPTY_DAY_ENTRY_LABEL).not.toContain(word);
  });

  it("§2.2 許可語 「ALTER」 存在 (= entry の identity)", () => {
    expect(EMPTY_DAY_ENTRY_LABEL).toContain("ALTER");
  });

  it("§2.3 許可語 「見る」 存在 (= 観測の入口の表現)", () => {
    expect(EMPTY_DAY_ENTRY_LABEL).toContain("見る");
  });

  it("§2.4 UX 慣習 「›」 存在 (= tap UX)", () => {
    expect(EMPTY_DAY_ENTRY_LABEL).toContain("›");
  });

  it("§2.5 label 全文一致 (= 確定 copy contract)", () => {
    expect(EMPTY_DAY_ENTRY_LABEL).toBe("ALTER で見る ›");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. EmptyDayEntryViewModel — type 整合
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("N-3a §3. EmptyDayEntryViewModel — type 整合", () => {
  it("§3.1 valid view model を構築可能 (= type 整合)", () => {
    const vm: EmptyDayEntryViewModel = {
      label: EMPTY_DAY_ENTRY_LABEL,
      testid: "plan-calendar-empty-day-alter-entry-2026-05-23",
      context: {
        tab: "calendar",
        iso: "2026-05-23",
      },
    };
    expect(vm.label).toBe(EMPTY_DAY_ENTRY_LABEL);
    expect(vm.context.tab).toBe("calendar");
    expect(vm.context.iso).toBe("2026-05-23");
  });

  it("§3.2 3 tab 全てで構築可能 (= EmptyDayEntryContextTab union 完全性)", () => {
    const tabs: ReadonlyArray<EmptyDayEntryContextTab> = ["calendar", "flow", "map"];
    for (const tab of tabs) {
      const ctx: EmptyDayEntryContext = { tab, iso: "2026-05-23" };
      expect(ctx.tab).toBe(tab);
    }
    expect(tabs.length).toBe(3);
  });
});
