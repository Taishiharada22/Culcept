/**
 * Phase 3-N List impl sub-phase 3 — List copy contract regression test
 *
 * 検証範囲:
 *   §1 確定 copy 値 (= 主要 14 copy contract 全文一致)
 *   §2 禁止語 regression (= 全 copy に「おすすめ」 等 9 語不在)
 *   §3 brand integration (= 「Alter」 統一)
 *   §4 N-3a 整合 (= emptyDayEntry が `EMPTY_DAY_ENTRY_LABEL` と一致)
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用
 *   - 既存 file 不触
 *   - regression test 永続化
 *
 * 設計書:
 *   - docs/alter-plan-list-map-design-direction-audit.md §11.5
 *   - decision-log `98a7b924`
 */

import { describe, expect, it } from "vitest";
import { LIST_COPY_CONTRACT } from "@/lib/plan/list/copyContract";
import { EMPTY_DAY_ENTRY_LABEL } from "@/lib/plan/emptyDayObservation";

// CEO + GPT 合議で確定 (= direction §11.5、 第 1+2+3 補正反映、 9 語)
const FORBIDDEN_WORDS: ReadonlyArray<string> = [
  "おすすめ",
  "これをした方がいい",
  "最適", // 「最適化」 も substring block
  "推奨",
  "改善",
  "警告",
  "危険",
  "注意",
  "リスク",
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 LIST_COPY_CONTRACT — 主要 copy 確定値
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3 §1. LIST_COPY_CONTRACT — 確定値", () => {
  it("§1.1 sectionLabel = 「Alter Planning」 (= 第 1 補正、 ALTER MORNING → Alter Planning)", () => {
    expect(LIST_COPY_CONTRACT.sectionLabel).toBe('Alter Planning');
  });

  it("§1.2 headerTitle = 「今日のプラン」 (= direction §11.5 維持)", () => {
    expect(LIST_COPY_CONTRACT.headerTitle).toBe('今日のプラン');
  });

  it("§1.3 listSubtitle = 「時間の流れを把握して、 心地よい 1 日に。」 (= 第 2 補正 revert、 自然な日本語維持)", () => {
    expect(LIST_COPY_CONTRACT.listSubtitle).toBe('時間の流れを把握して、 心地よい 1 日に。');
  });

  it("§1.4 toggleMap = 「マップ」 (= 第 3 補正、 地図 → マップ)", () => {
    expect(LIST_COPY_CONTRACT.toggleMap).toBe('マップ');
  });

  it("§1.5 toggleList = 「リスト」", () => {
    expect(LIST_COPY_CONTRACT.toggleList).toBe('リスト');
  });

  it("§1.6 tabAlterMemo = 「Alter メモ」 (= 第 1 補正、 AI メモ → Alter メモ)", () => {
    expect(LIST_COPY_CONTRACT.tabAlterMemo).toBe('Alter メモ');
  });

  it("§1.7 emptyDayEntry = 「ALTER で見る ›」 (= N-3a `EMPTY_DAY_ENTRY_LABEL` 整合)", () => {
    expect(LIST_COPY_CONTRACT.emptyDayEntry).toBe('ALTER で見る ›');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 禁止語 regression — 全 copy に禁止語不在
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3 §2. 禁止語 regression — 全 copy に禁止語不在", () => {
  const allCopyValues = Object.values(LIST_COPY_CONTRACT);

  it.each(FORBIDDEN_WORDS)("§2.1 禁止語 「%s」 が全 copy に不在", (word) => {
    for (const copy of allCopyValues) {
      expect(copy).not.toContain(word);
    }
  });

  it("§2.2 copy contract が空ではない (= regression test の責務存在)", () => {
    expect(allCopyValues.length).toBeGreaterThan(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 brand integration — 「Alter」 統一
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3 §3. brand integration — 「Alter」 統一", () => {
  it("§3.1 sectionLabel 「Alter Planning」 contains 「Alter」 (= Title case)", () => {
    expect(LIST_COPY_CONTRACT.sectionLabel).toContain('Alter');
  });

  it("§3.2 tabAlterMemo 「Alter メモ」 contains 「Alter」 (= Title case)", () => {
    expect(LIST_COPY_CONTRACT.tabAlterMemo).toContain('Alter');
  });

  it("§3.3 emptyDayEntry 「ALTER で見る ›」 contains 「ALTER」 (= 全大文字、 N-3a 整合)", () => {
    expect(LIST_COPY_CONTRACT.emptyDayEntry).toContain('ALTER');
  });

  it("§3.4 acceptedHint 「Alter 提案を受け入れ済」 contains 「Alter」", () => {
    expect(LIST_COPY_CONTRACT.acceptedHint).toContain('Alter');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 N-3a 整合 — emptyDayEntry が N-3a `EMPTY_DAY_ENTRY_LABEL` と一致
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("List sub-phase 3 §4. N-3a 整合 — emptyDayEntry", () => {
  it("§4.1 LIST_COPY_CONTRACT.emptyDayEntry が N-3a EMPTY_DAY_ENTRY_LABEL と一致 (= brand 軸維持)", () => {
    expect(LIST_COPY_CONTRACT.emptyDayEntry).toBe(EMPTY_DAY_ENTRY_LABEL);
  });
});
