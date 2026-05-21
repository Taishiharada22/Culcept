/**
 * Phase 2-H: categoryInference.ts — pure helper tests
 *
 * 設計書: docs/alter-plan-phase2-h-place-intent-candidate-search-mini-design.md §5
 *
 * 検証範囲 (= 15+ ケース):
 *   - 8 LocationCategory への mapping (home / office / school / cafe / outdoor / public / transit / unknown)
 *   - priority 順 (= 複数 keyword match で最初の category)
 *   - 推定不能 → null (= 既存 enum 該当なし、 短すぎ title 等)
 *   - pure / mutation 不変
 */

import { describe, it, expect } from "vitest";
import { inferLocationCategory } from "@/lib/plan/categoryInference";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("inferLocationCategory", () => {
  describe("home", () => {
    it("title='自宅で考える' → home", () => {
      expect(inferLocationCategory("自宅で考える")).toBe("home");
    });

    it("title='在宅勤務' → home", () => {
      expect(inferLocationCategory("在宅勤務")).toBe("home");
    });
  });

  describe("office", () => {
    it("title='会議' → office", () => {
      expect(inferLocationCategory("会議")).toBe("office");
    });

    it("title='打ち合わせ' → office", () => {
      expect(inferLocationCategory("打ち合わせ")).toBe("office");
    });

    it("title='1on1 田中さん' → office", () => {
      expect(inferLocationCategory("1on1 田中さん")).toBe("office");
    });
  });

  describe("school", () => {
    it("title='授業' → school", () => {
      expect(inferLocationCategory("授業")).toBe("school");
    });

    it("title='セミナー参加' → school", () => {
      expect(inferLocationCategory("セミナー参加")).toBe("school");
    });
  });

  describe("cafe", () => {
    it("title='カフェ作業' → cafe", () => {
      expect(inferLocationCategory("カフェ作業")).toBe("cafe");
    });

    it("title='ランチ' → cafe (= 飲食店として cafe 近似、mini design §5.2)", () => {
      expect(inferLocationCategory("ランチ")).toBe("cafe");
    });

    it("title='Lunch with team' → cafe", () => {
      expect(inferLocationCategory("Lunch with team")).toBe("cafe");
    });
  });

  describe("outdoor", () => {
    it("title='散歩' → outdoor", () => {
      expect(inferLocationCategory("散歩")).toBe("outdoor");
    });

    it("title='ジョギング' → outdoor", () => {
      expect(inferLocationCategory("ジョギング")).toBe("outdoor");
    });
  });

  describe("public", () => {
    it("title='ショッピング' → public", () => {
      expect(inferLocationCategory("ショッピング")).toBe("public");
    });

    it("title='映画' → public", () => {
      expect(inferLocationCategory("映画")).toBe("public");
    });

    it("title='美術館' → public", () => {
      expect(inferLocationCategory("美術館")).toBe("public");
    });
  });

  describe("transit", () => {
    it("title='出張' → transit", () => {
      expect(inferLocationCategory("出張")).toBe("transit");
    });
  });

  describe("null (= 推定不能)", () => {
    it("title='' → null", () => {
      expect(inferLocationCategory("")).toBeNull();
    });

    it("title='   ' (whitespace-only) → null", () => {
      expect(inferLocationCategory("   ")).toBeNull();
    });

    it("title='歯医者' → null (= 既存 enum に medical なし、推定保留)", () => {
      expect(inferLocationCategory("歯医者")).toBeNull();
    });

    it("title='病院' → null (= 同上)", () => {
      expect(inferLocationCategory("病院")).toBeNull();
    });

    it("title='休み' → null (= 該当 keyword なし)", () => {
      expect(inferLocationCategory("休み")).toBeNull();
    });

    it("title='friends bbq' → null (= 該当 keyword なし)", () => {
      expect(inferLocationCategory("friends bbq")).toBeNull();
    });
  });

  // ─── priority order (= 複数 keyword で最初 match) ───

  describe("priority order (= 複数 keyword 含有時)", () => {
    it("title='家でランチ会議' → home が最優先", () => {
      // 「家で」 (home) / 「ランチ」 (cafe) / 「会議」 (office) すべて含むが home 優先
      expect(inferLocationCategory("家でランチ会議")).toBe("home");
    });

    it("title='ランチ会議' → office (= cafe より上位、 wait: priority is home > office > school > cafe...)", () => {
      // 「ランチ」 (cafe) / 「会議」 (office) → office が priority 上 (= office is priority 2、cafe is priority 4)
      expect(inferLocationCategory("ランチ会議")).toBe("office");
    });
  });

  // ─── pure / immutability ───

  describe("pure / immutability", () => {
    it("deterministic: 同入力で同出力", () => {
      const title = "ショッピング";
      expect(inferLocationCategory(title)).toBe(inferLocationCategory(title));
    });

    it("入力文字列を mutate しない", () => {
      const title = "ランチ";
      const snapshot = title;
      inferLocationCategory(title);
      expect(title).toBe(snapshot);
    });
  });
});
