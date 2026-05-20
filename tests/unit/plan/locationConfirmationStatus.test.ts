/**
 * Location Confirmation Status helper tests (Phase 2-D C3)
 *
 * 設計書: docs/alter-plan-phase2-d-place-picker-mini-design.md §6 (C3)
 *
 * 検証対象:
 *   - isPlaceUnconfirmed: 「空欄 = false (場所必要性なし)」「非空かつ非canonical = true」
 *     「canonical = false」の三分判定
 *
 * GPT 補正 2026-05-21 (CEO 採択):
 *   - 空欄まで未確定扱いするのは false positive を生む
 *   - 「家で考える」「資料整理」「オンライン作業」など場所が不要な予定で
 *     indicator が出てしまう → 空欄は indicator 不要
 */

import { describe, it, expect } from "vitest";

import {
  formatCanonicalLocationText,
  CANONICAL_SEPARATOR,
} from "@/lib/shared/canonicalLocationText";
import { isPlaceUnconfirmed } from "@/lib/plan/locationConfirmationStatus";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isPlaceUnconfirmed", () => {
  // ─── 「未確定 indicator 不要」(false) を返すべきケース ───

  describe("空 / whitespace-only → false (場所必要性なし、indicator 不要)", () => {
    it("null → false", () => {
      expect(isPlaceUnconfirmed(null)).toBe(false);
    });

    it("undefined → false", () => {
      expect(isPlaceUnconfirmed(undefined)).toBe(false);
    });

    it("空文字列 → false", () => {
      expect(isPlaceUnconfirmed("")).toBe(false);
    });

    it("半角 space のみ → false", () => {
      expect(isPlaceUnconfirmed("   ")).toBe(false);
    });

    it("tab / newline のみ → false", () => {
      expect(isPlaceUnconfirmed("\t\n")).toBe(false);
      expect(isPlaceUnconfirmed("\t  \n")).toBe(false);
    });

    it("全角空白も whitespace 扱い (Unicode 仕様)", () => {
      // 　 は string.trim() で除去される (Unicode whitespace)
      expect(isPlaceUnconfirmed("　")).toBe(false);
    });
  });

  describe("canonical text → false (確定済み、indicator 不要)", () => {
    it("standard canonical → false", () => {
      const text = formatCanonicalLocationText(
        "スターバックス 成田空港店",
        "千葉県成田市古込1番地",
      );
      expect(isPlaceUnconfirmed(text)).toBe(false);
    });

    it("英字 canonical → false", () => {
      const text = "Cafe Veloce · Tokyo, Shibuya-ku";
      expect(isPlaceUnconfirmed(text)).toBe(false);
    });

    it("separator 前後の whitespace tolerant (canonical 判定継承)", () => {
      // canonical regex は \s+·\s+ なので tolerant
      expect(isPlaceUnconfirmed("スタバ   ·   千葉県")).toBe(false);
    });
  });

  // ─── 「未確定 indicator 表示」(true) を返すべきケース ───

  describe("非空かつ非 canonical → true (入力あるが未確定、indicator 表示)", () => {
    it("free text 短い → true", () => {
      expect(isPlaceUnconfirmed("成田のスタバ")).toBe(true);
    });

    it("free text 長い → true", () => {
      expect(isPlaceUnconfirmed("渋谷の歯医者さん、駅から近いやつ")).toBe(true);
    });

    it("英字 free text → true", () => {
      expect(isPlaceUnconfirmed("starbucks near narita airport")).toBe(true);
    });

    it("1 文字でも non-canonical なら true", () => {
      expect(isPlaceUnconfirmed("家")).toBe(true);
    });

    it("数字のみ free text も true (canonical でない)", () => {
      expect(isPlaceUnconfirmed("12345")).toBe(true);
    });
  });

  describe("malformed canonical → true (separator あるが片側が空)", () => {
    it("displayName 空 ( · 千葉県) → true", () => {
      // parse 結果: displayName="" / address="千葉県" → isCanonical=false (displayName 空)
      // 入力は trim 後 non-empty (= "· 千葉県") → indicator 表示
      expect(isPlaceUnconfirmed(" · 千葉県")).toBe(true);
    });

    it("address 空 (スタバ · ) → true", () => {
      // parse 結果: displayName="スタバ" / address=null → isCanonical=false
      // 入力は trim 後 non-empty → indicator 表示
      expect(isPlaceUnconfirmed("スタバ · ")).toBe(true);
    });

    it("separator のみ ( · ) → false (trim 後 '·' は non-empty だが canonical でないので true)", () => {
      // " · ".trim() = "·" (non-empty)
      // parseCanonicalLocationText("·") → { displayName: "·", address: null } → isCanonical=false
      // → indicator 表示 (これは malformed input として indicator は妥当)
      expect(isPlaceUnconfirmed(" · ")).toBe(true);
    });
  });

  // ─── Cross-tab 単一仕様の deterministic 性 ───

  describe("pure / deterministic", () => {
    it("同じ入力で同じ出力 (no side effect)", () => {
      const inputs: Array<string | null | undefined> = [
        null,
        undefined,
        "",
        "成田のスタバ",
        "スターバックス 成田空港店 · 千葉県成田市古込1番地",
      ];
      for (const input of inputs) {
        const r1 = isPlaceUnconfirmed(input);
        const r2 = isPlaceUnconfirmed(input);
        expect(r1).toBe(r2);
      }
    });

    it("入力 string を mutate しない", () => {
      const text = "成田のスタバ";
      const snapshot = text;
      isPlaceUnconfirmed(text);
      expect(text).toBe(snapshot);
    });
  });

  // ─── 仕様の対称性 / round-trip ───

  describe("format → isPlaceUnconfirmed round-trip", () => {
    it("formatCanonicalLocationText で作った text は必ず false (canonical なので)", () => {
      const text = formatCanonicalLocationText(
        "Starbucks Narita Airport",
        "Chiba Prefecture, Narita-shi",
      );
      // canonical を validate
      expect(text).toContain(CANONICAL_SEPARATOR);
      expect(isPlaceUnconfirmed(text)).toBe(false);
    });

    it("displayName のみ (address null) で format した text は true (canonical でない)", () => {
      // formatCanonicalLocationText("自宅", null) → "自宅" (separator なし)
      const text = formatCanonicalLocationText("自宅", null);
      expect(text).toBe("自宅");
      expect(isPlaceUnconfirmed(text)).toBe(true);
    });
  });
});
