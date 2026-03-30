import { describe, it, expect } from "vitest";
import {
  SIXTEEN_SEASON_TARGETS,
  SIXTEEN_SEASON_MAP,
  getSubtypesForSeason,
  getSixteenSeasonStats,
  type ParentSeason,
  type SixteenSeasonTarget,
} from "@/lib/face/sixteenSeasonColorScience";

describe("sixteenSeasonColorScience", () => {
  // ── 16 シーズン定義の完全性 ──

  describe("16シーズン定義", () => {
    it("正確に 16 タイプが定義されている", () => {
      expect(SIXTEEN_SEASON_TARGETS).toHaveLength(16);
    });

    it("全タイプに一意の id がある", () => {
      const ids = SIXTEEN_SEASON_TARGETS.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(16);
    });

    it("各親シーズンに 4 つのサブタイプ", () => {
      const seasons: ParentSeason[] = ["spring", "summer", "autumn", "winter"];
      for (const season of seasons) {
        const subtypes = SIXTEEN_SEASON_TARGETS.filter(
          (t) => t.parentSeason === season
        );
        expect(subtypes).toHaveLength(4);
      }
    });

    it("全タイプに日本語名と英語名がある", () => {
      for (const t of SIXTEEN_SEASON_TARGETS) {
        expect(t.nameJa.length).toBeGreaterThan(0);
        expect(t.nameEn.length).toBeGreaterThan(0);
      }
    });
  });

  // ── Lab 座標の範囲検証 ──

  describe("Lab 座標の妥当性", () => {
    it("L* は 0-100 の範囲（肌色として 30-85 が妥当）", () => {
      for (const t of SIXTEEN_SEASON_TARGETS) {
        expect(t.lab.L).toBeGreaterThanOrEqual(30);
        expect(t.lab.L).toBeLessThanOrEqual(85);
      }
    });

    it("a* は -10 〜 20 の範囲（肌色として妥当）", () => {
      for (const t of SIXTEEN_SEASON_TARGETS) {
        expect(t.lab.a).toBeGreaterThanOrEqual(-10);
        expect(t.lab.a).toBeLessThanOrEqual(20);
      }
    });

    it("b* は -20 〜 35 の範囲（肌色として妥当）", () => {
      for (const t of SIXTEEN_SEASON_TARGETS) {
        expect(t.lab.b).toBeGreaterThanOrEqual(-20);
        expect(t.lab.b).toBeLessThanOrEqual(35);
      }
    });

    it("valueL は lab.L と一致", () => {
      for (const t of SIXTEEN_SEASON_TARGETS) {
        expect(t.valueL).toBe(t.lab.L);
      }
    });

    it("chromaC = sqrt(a^2 + b^2) が正しい（±0.5 の許容誤差）", () => {
      for (const t of SIXTEEN_SEASON_TARGETS) {
        const computed = Math.sqrt(t.lab.a ** 2 + t.lab.b ** 2);
        expect(t.chromaC).toBeCloseTo(computed, 0);
      }
    });

    it("undertoneScore は -1 〜 +1 の範囲", () => {
      for (const t of SIXTEEN_SEASON_TARGETS) {
        expect(t.undertoneScore).toBeGreaterThanOrEqual(-1);
        expect(t.undertoneScore).toBeLessThanOrEqual(1);
      }
    });

    it("contrastScore は 0 〜 1 の範囲", () => {
      for (const t of SIXTEEN_SEASON_TARGETS) {
        expect(t.contrastScore).toBeGreaterThanOrEqual(0);
        expect(t.contrastScore).toBeLessThanOrEqual(1);
      }
    });

    it("Spring 系は暖色 (undertoneScore > 0)", () => {
      const springs = SIXTEEN_SEASON_TARGETS.filter(
        (t) => t.parentSeason === "spring"
      );
      for (const t of springs) {
        expect(t.undertoneScore).toBeGreaterThan(0);
      }
    });

    it("Winter 系は冷色 (undertoneScore < 0)", () => {
      const winters = SIXTEEN_SEASON_TARGETS.filter(
        (t) => t.parentSeason === "winter"
      );
      for (const t of winters) {
        expect(t.undertoneScore).toBeLessThan(0);
      }
    });
  });

  // ── パレット検証 ──

  describe("パレット", () => {
    it("各タイプに 5 色のパレットがある", () => {
      for (const t of SIXTEEN_SEASON_TARGETS) {
        expect(t.palette).toHaveLength(5);
      }
    });

    it("パレット内の Lab 値が妥当な範囲 (L:0-100)", () => {
      for (const t of SIXTEEN_SEASON_TARGETS) {
        for (const color of t.palette) {
          expect(color.L).toBeGreaterThanOrEqual(0);
          expect(color.L).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  // ── getSubtypesForSeason ──

  describe("getSubtypesForSeason", () => {
    it("各シーズンで 4 タイプを返す", () => {
      const seasons: ParentSeason[] = ["spring", "summer", "autumn", "winter"];
      for (const season of seasons) {
        const subtypes = getSubtypesForSeason(season);
        expect(subtypes).toHaveLength(4);
        for (const t of subtypes) {
          expect(t.parentSeason).toBe(season);
        }
      }
    });
  });

  // ── SIXTEEN_SEASON_MAP ──

  describe("SIXTEEN_SEASON_MAP", () => {
    it("全 16 タイプが id で検索可能", () => {
      expect(SIXTEEN_SEASON_MAP.size).toBe(16);
      for (const t of SIXTEEN_SEASON_TARGETS) {
        expect(SIXTEEN_SEASON_MAP.get(t.id)).toBeDefined();
        expect(SIXTEEN_SEASON_MAP.get(t.id)?.nameEn).toBe(t.nameEn);
      }
    });

    it("存在しない id は undefined", () => {
      expect(SIXTEEN_SEASON_MAP.get("nonexistent")).toBeUndefined();
    });
  });

  // ── getSixteenSeasonStats ──

  describe("getSixteenSeasonStats", () => {
    it("L, a, b, C の統計情報を返す", () => {
      const stats = getSixteenSeasonStats();

      expect(stats.L.min).toBeLessThan(stats.L.max);
      expect(stats.L.mean).toBeGreaterThan(0);

      expect(stats.a.min).toBeLessThanOrEqual(stats.a.max);
      expect(stats.b.min).toBeLessThan(stats.b.max);

      expect(stats.C.min).toBeGreaterThan(0);
      expect(stats.C.max).toBeGreaterThan(stats.C.min);
    });

    it("mean は min と max の間", () => {
      const stats = getSixteenSeasonStats();
      for (const key of ["L", "a", "b", "C"] as const) {
        expect(stats[key].mean).toBeGreaterThanOrEqual(stats[key].min);
        expect(stats[key].mean).toBeLessThanOrEqual(stats[key].max);
      }
    });
  });
});
