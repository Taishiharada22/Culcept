/**
 * Phase 2-H: intentClassification.ts — pure helper tests
 *
 * 設計書: docs/alter-plan-phase2-h-place-intent-candidate-search-mini-design.md §4
 *
 * 検証範囲 (= 20+ ケース):
 *   - 4 階層 IntentType 判定の境界
 *   - explicit_place 優先 (= locationText に施設キーワード含むなら title あっても優先)
 *   - intent_with_area / intent_only / ambiguous の境界
 *   - title 短すぎ (= MIN_INTENT_TITLE_LENGTH = 2 未満) の扱い
 *   - 既存 Phase 2-D 挙動互換 (= title 空 + locationText non-empty は explicit_place)
 *   - pure / mutation 不変
 */

import { describe, it, expect } from "vitest";
import { classifyPlaceIntent } from "@/lib/plan/intentClassification";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyPlaceIntent", () => {
  // ─── explicit_place ───

  describe("explicit_place (= 施設キーワード含む)", () => {
    it("locationText='スターバックス 新宿南口' → explicit_place", () => {
      expect(
        classifyPlaceIntent({ title: "ショッピング", locationText: "スターバックス 新宿南口" }),
      ).toBe("explicit_place");
    });

    it("locationText='渋谷歯科クリニック' → explicit_place", () => {
      expect(
        classifyPlaceIntent({ title: "通院", locationText: "渋谷歯科クリニック" }),
      ).toBe("explicit_place");
    });

    it("locationText='品川駅' (駅 keyword) → explicit_place", () => {
      expect(
        classifyPlaceIntent({ title: "移動", locationText: "品川駅" }),
      ).toBe("explicit_place");
    });

    it("locationText='美容院' (= サロン系) → explicit_place", () => {
      expect(
        classifyPlaceIntent({ title: "カット", locationText: "美容院 田中サロン" }),
      ).toBe("explicit_place");
    });

    it("locationText='渋谷の銀行' (銀行 keyword 含有) → explicit_place", () => {
      expect(
        classifyPlaceIntent({ title: "振込", locationText: "渋谷の銀行" }),
      ).toBe("explicit_place");
    });
  });

  // ─── intent_with_area ───

  describe("intent_with_area (= title + エリア名)", () => {
    it("title='ショッピング' + locationText='新宿' → intent_with_area", () => {
      expect(
        classifyPlaceIntent({ title: "ショッピング", locationText: "新宿" }),
      ).toBe("intent_with_area");
    });

    it("title='ランチ' + locationText='渋谷' → intent_with_area", () => {
      expect(
        classifyPlaceIntent({ title: "ランチ", locationText: "渋谷" }),
      ).toBe("intent_with_area");
    });

    it("title='カフェ作業' + locationText='成田' → intent_with_area", () => {
      expect(
        classifyPlaceIntent({ title: "カフェ作業", locationText: "成田" }),
      ).toBe("intent_with_area");
    });

    it("英日 mixed: title='Lunch' + locationText='Shinjuku' → intent_with_area", () => {
      expect(
        classifyPlaceIntent({ title: "Lunch", locationText: "Shinjuku" }),
      ).toBe("intent_with_area");
    });
  });

  // ─── intent_only ───

  describe("intent_only (= title のみ、locationText 空)", () => {
    it("title='ショッピング' + locationText='' → intent_only", () => {
      expect(
        classifyPlaceIntent({ title: "ショッピング", locationText: "" }),
      ).toBe("intent_only");
    });

    it("title='ランチ' + locationText='   ' (whitespace-only) → intent_only", () => {
      expect(
        classifyPlaceIntent({ title: "ランチ", locationText: "   " }),
      ).toBe("intent_only");
    });

    it("title='カフェ作業' + locationText='' → intent_only", () => {
      expect(
        classifyPlaceIntent({ title: "カフェ作業", locationText: "" }),
      ).toBe("intent_only");
    });
  });

  // ─── ambiguous ───

  describe("ambiguous (= 両方空 / title 短すぎ)", () => {
    it("title='' + locationText='' → ambiguous", () => {
      expect(classifyPlaceIntent({ title: "", locationText: "" })).toBe("ambiguous");
    });

    it("title='   ' + locationText='   ' (whitespace-only 両方) → ambiguous", () => {
      expect(
        classifyPlaceIntent({ title: "   ", locationText: "   " }),
      ).toBe("ambiguous");
    });

    it("title='あ' (1 文字、短すぎ) + locationText='' → ambiguous", () => {
      expect(classifyPlaceIntent({ title: "あ", locationText: "" })).toBe("ambiguous");
    });
  });

  // ─── 既存 Phase 2-D 挙動 互換性 ───

  describe("Phase 2-D 挙動互換 (= title 空 + locationText non-empty)", () => {
    it("title='' + locationText='新宿' (= explicit でない area name) → explicit_place (= 既存 Phase 2-D で locationText のみ検索)", () => {
      // mini design §4: title 短すぎ かつ locationText non-empty は explicit_place (= 既存挙動完全互換)
      expect(
        classifyPlaceIntent({ title: "", locationText: "新宿" }),
      ).toBe("explicit_place");
    });

    it("title='あ' (短すぎ) + locationText='渋谷' → explicit_place", () => {
      expect(
        classifyPlaceIntent({ title: "あ", locationText: "渋谷" }),
      ).toBe("explicit_place");
    });
  });

  // ─── explicit_place 優先 (= title あっても locationText に keyword あれば優先) ───

  describe("explicit_place 優先順 (= locationText keyword > title intent)", () => {
    it("title='ショッピング' + locationText='スタバ 新宿' → explicit_place (= locationText 優先)", () => {
      expect(
        classifyPlaceIntent({ title: "ショッピング", locationText: "スタバ 新宿" }),
      ).toBe("explicit_place");
    });

    it("title='会議' + locationText='渋谷駅' → explicit_place (= 駅 keyword)", () => {
      expect(
        classifyPlaceIntent({ title: "会議", locationText: "渋谷駅" }),
      ).toBe("explicit_place");
    });
  });

  // ─── pure / immutability ───

  describe("pure / immutability", () => {
    it("deterministic: 同入力で同出力", () => {
      const args = { title: "ショッピング", locationText: "新宿" };
      const r1 = classifyPlaceIntent(args);
      const r2 = classifyPlaceIntent(args);
      expect(r1).toBe(r2);
    });

    it("入力 args オブジェクトを mutate しない", () => {
      const args = { title: "ランチ", locationText: "渋谷" };
      const snapshot = JSON.stringify(args);
      classifyPlaceIntent(args);
      expect(JSON.stringify(args)).toBe(snapshot);
    });
  });
});
