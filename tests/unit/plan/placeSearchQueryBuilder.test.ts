/**
 * Phase 2-H: placeSearchQueryBuilder.ts — pure helper tests
 *
 * 設計書: docs/alter-plan-phase2-h-place-intent-candidate-search-mini-design.md §6
 *
 * 検証範囲 (= 10+ ケース):
 *   - 4 階層 IntentType ごとの textQuery 構築
 *   - query max length (= 300 chars) 超過時の explicit_place fallback
 *   - inferredCategory が title 推定通り
 *   - pure / mutation 不変
 */

import { describe, it, expect } from "vitest";
import {
  buildPlaceSearchQuery,
  MAX_QUERY_LENGTH,
} from "@/lib/plan/placeSearchQueryBuilder";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildPlaceSearchQuery", () => {
  describe("intent_with_area", () => {
    it("title='ショッピング' + locationText='新宿' → textQuery='新宿 ショッピング'", () => {
      const r = buildPlaceSearchQuery({ title: "ショッピング", locationText: "新宿" });
      expect(r.textQuery).toBe("新宿 ショッピング");
      expect(r.intentType).toBe("intent_with_area");
      expect(r.inferredCategory).toBe("public");
    });

    it("title='ランチ' + locationText='渋谷' → textQuery='渋谷 ランチ'、 inferredCategory=cafe", () => {
      const r = buildPlaceSearchQuery({ title: "ランチ", locationText: "渋谷" });
      expect(r.textQuery).toBe("渋谷 ランチ");
      expect(r.intentType).toBe("intent_with_area");
      expect(r.inferredCategory).toBe("cafe");
    });
  });

  describe("intent_only", () => {
    it("title='ショッピング' + locationText='' → textQuery='ショッピング'", () => {
      const r = buildPlaceSearchQuery({ title: "ショッピング", locationText: "" });
      expect(r.textQuery).toBe("ショッピング");
      expect(r.intentType).toBe("intent_only");
      expect(r.inferredCategory).toBe("public");
    });

    it("title='カフェ作業' + locationText='' → textQuery='カフェ作業'、 inferredCategory=cafe", () => {
      const r = buildPlaceSearchQuery({ title: "カフェ作業", locationText: "" });
      expect(r.textQuery).toBe("カフェ作業");
      expect(r.intentType).toBe("intent_only");
      expect(r.inferredCategory).toBe("cafe");
    });
  });

  describe("explicit_place", () => {
    it("title='ショッピング' + locationText='スタバ 渋谷' → textQuery='スタバ 渋谷'", () => {
      const r = buildPlaceSearchQuery({
        title: "ショッピング",
        locationText: "スタバ 渋谷",
      });
      expect(r.textQuery).toBe("スタバ 渋谷");
      expect(r.intentType).toBe("explicit_place");
      // category inference は title から推定なので "public" 返る
      expect(r.inferredCategory).toBe("public");
    });

    it("title='' + locationText='新宿' → textQuery='新宿' (= 既存 Phase 2-D 互換)", () => {
      const r = buildPlaceSearchQuery({ title: "", locationText: "新宿" });
      expect(r.textQuery).toBe("新宿");
      expect(r.intentType).toBe("explicit_place");
      expect(r.inferredCategory).toBeNull();
    });
  });

  describe("ambiguous", () => {
    it("title='' + locationText='' → textQuery=''", () => {
      const r = buildPlaceSearchQuery({ title: "", locationText: "" });
      expect(r.textQuery).toBe("");
      expect(r.intentType).toBe("ambiguous");
      expect(r.inferredCategory).toBeNull();
    });

    it("title='あ' (短すぎ) + locationText='' → textQuery=''", () => {
      const r = buildPlaceSearchQuery({ title: "あ", locationText: "" });
      expect(r.textQuery).toBe("");
      expect(r.intentType).toBe("ambiguous");
      expect(r.inferredCategory).toBeNull();
    });
  });

  describe("query max length fallback (= 300 超で explicit_place fallback)", () => {
    it("combine が 300 chars 超 → textQuery=locationText (= title 捨て)", () => {
      const longTitle = "あ".repeat(200);
      const longLoc = "い".repeat(120);
      const r = buildPlaceSearchQuery({ title: longTitle, locationText: longLoc });
      // combine = `${longLoc} ${longTitle}` = 120 + 1 + 200 = 321 > 300
      // → fallback: textQuery = longLoc
      expect(r.textQuery).toBe(longLoc);
      // intentType は intent_with_area のまま (= classifyPlaceIntent の判定は変えない)
      // ただし fallback で title 捨てる、 textQuery のみ縮める
      expect(r.intentType).toBe("intent_with_area");
    });

    it("combine が exactly 300 chars → そのまま combine 使う", () => {
      // 300 chars exactly の boundary 確認
      const title = "a".repeat(149); // 149
      const loc = "b".repeat(150); // 150
      // combine = "bbb...b aaaa...a" = 150 + 1 + 149 = 300
      const combined = `${loc} ${title}`;
      expect(combined.length).toBe(MAX_QUERY_LENGTH);
      const r = buildPlaceSearchQuery({ title, locationText: loc });
      expect(r.textQuery).toBe(combined);
    });
  });

  describe("trim", () => {
    it("title / locationText 前後 whitespace は trim される", () => {
      const r = buildPlaceSearchQuery({
        title: "  ショッピング  ",
        locationText: "  新宿  ",
      });
      expect(r.textQuery).toBe("新宿 ショッピング");
    });
  });

  // ─── pure / immutability ───

  describe("pure / immutability", () => {
    it("deterministic: 同入力で同出力", () => {
      const args = { title: "ショッピング", locationText: "新宿" };
      const r1 = buildPlaceSearchQuery(args);
      const r2 = buildPlaceSearchQuery(args);
      expect(r1).toEqual(r2);
    });

    it("入力 args オブジェクトを mutate しない", () => {
      const args = { title: "ランチ", locationText: "渋谷" };
      const snapshot = JSON.stringify(args);
      buildPlaceSearchQuery(args);
      expect(JSON.stringify(args)).toBe(snapshot);
    });
  });
});
