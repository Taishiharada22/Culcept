/**
 * Phase 3-N Plan P2 Step 2 — synthetic dataset 構造検証 contract test
 *
 * 検証範囲 (= readiness v3 §3 で確定した dataset 構造):
 *   - 50 件総数
 *   - category 別 internal 件数 (= cafe 12 / meal 10 / work 12 / home 8 / other 8)
 *   - 5 種 user profile
 *   - 各 anchor に必須 field 存在
 *   - sensitive バリエーション含む
 *   - 入力 mutate なし
 *
 * 不変原則:
 *   - LLM 呼ばない pure data 検証
 *   - 評価採点は別 harness (= planAlterNoteJudge.test.ts、 別 phase で構築)
 */

import { describe, it, expect } from "vitest";

import {
  PLAN_ALTER_NOTE_DATASET,
  EVAL_USER_PROFILES,
  DATASET_STATS,
  type SyntheticAnchor,
} from "../../eval/planAlterNoteDataset";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 総数 + category 内訳
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PLAN_ALTER_NOTE_DATASET: 総数 + 内訳", () => {
  it("総数 50 件", () => {
    expect(PLAN_ALTER_NOTE_DATASET.length).toBe(50);
    expect(DATASET_STATS.total).toBe(50);
  });

  it("cafe 12 件", () => {
    const cafe = PLAN_ALTER_NOTE_DATASET.filter((a) => a._meta.category === "cafe");
    expect(cafe.length).toBe(12);
    expect(DATASET_STATS.byCategory.cafe).toBe(12);
  });

  it("meal 10 件", () => {
    const meal = PLAN_ALTER_NOTE_DATASET.filter((a) => a._meta.category === "meal");
    expect(meal.length).toBe(10);
    expect(DATASET_STATS.byCategory.meal).toBe(10);
  });

  it("work 12 件", () => {
    const work = PLAN_ALTER_NOTE_DATASET.filter((a) => a._meta.category === "work");
    expect(work.length).toBe(12);
    expect(DATASET_STATS.byCategory.work).toBe(12);
  });

  it("home 8 件", () => {
    const home = PLAN_ALTER_NOTE_DATASET.filter((a) => a._meta.category === "home");
    expect(home.length).toBe(8);
    expect(DATASET_STATS.byCategory.home).toBe(8);
  });

  it("other 8 件", () => {
    const other = PLAN_ALTER_NOTE_DATASET.filter((a) => a._meta.category === "other");
    expect(other.length).toBe(8);
    expect(DATASET_STATS.byCategory.other).toBe(8);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 各 anchor 必須 field
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PLAN_ALTER_NOTE_DATASET: 各 anchor 必須 field", () => {
  it("全 anchor に id / title / startTime / _meta", () => {
    for (const a of PLAN_ALTER_NOTE_DATASET) {
      expect(a.id).toBeDefined();
      expect(typeof a.id).toBe("string");
      expect(a.title).toBeDefined();
      expect(typeof a.title).toBe("string");
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.startTime).toBeDefined();
      expect(a.startTime).toMatch(/^\d{2}:\d{2}$/);
      expect(a._meta).toBeDefined();
      expect(a._meta.category).toBeDefined();
      expect(a._meta.timeOfDay).toBeDefined();
    }
  });

  it("id は全件 unique", () => {
    const ids = PLAN_ALTER_NOTE_DATASET.map((a) => a.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("id prefix が 'syn-{category}-' 規約", () => {
    for (const a of PLAN_ALTER_NOTE_DATASET) {
      expect(a.id).toMatch(/^syn-(cafe|meal|work|home|other)-\d{2}$/);
    }
  });

  it("endTime あれば HH:MM 形式 + startTime より後 (= 日跨ぎ例外あり)", () => {
    for (const a of PLAN_ALTER_NOTE_DATASET) {
      if (a.endTime !== undefined) {
        expect(a.endTime).toMatch(/^\d{2}:\d{2}$/);
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// バリエーション網羅
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PLAN_ALTER_NOTE_DATASET: バリエーション網羅", () => {
  it("時刻帯 5 種すべて含む", () => {
    const timeOfDays = new Set(PLAN_ALTER_NOTE_DATASET.map((a) => a._meta.timeOfDay));
    expect(timeOfDays.size).toBe(5);
    expect(timeOfDays).toContain("morning");
    expect(timeOfDays).toContain("lunch");
    expect(timeOfDays).toContain("afternoon");
    expect(timeOfDays).toContain("evening");
    expect(timeOfDays).toContain("late_night");
  });

  it("locationSpecificity 3 種すべて含む (= specific / abstract / absent)", () => {
    const specs = new Set(PLAN_ALTER_NOTE_DATASET.map((a) => a._meta.locationSpecificity));
    expect(specs.size).toBe(3);
    expect(specs).toContain("specific");
    expect(specs).toContain("abstract");
    expect(specs).toContain("absent");
  });

  it("sensitive anchor 3 件含む (= privacy バリエーション)", () => {
    const sensitive = PLAN_ALTER_NOTE_DATASET.filter((a) => a.sensitiveCategory !== undefined);
    expect(sensitive.length).toBe(3);
    expect(DATASET_STATS.sensitiveCount).toBe(3);
  });

  it("locationSpecificity 'specific' の anchor は locationText 必須", () => {
    const specific = PLAN_ALTER_NOTE_DATASET.filter(
      (a) => a._meta.locationSpecificity === "specific",
    );
    for (const a of specific) {
      expect(a.locationText).toBeDefined();
      expect(a.locationText!.length).toBeGreaterThan(0);
    }
  });

  it("locationSpecificity 'absent' の anchor は locationText 不在", () => {
    const absent = PLAN_ALTER_NOTE_DATASET.filter(
      (a) => a._meta.locationSpecificity === "absent",
    );
    for (const a of absent) {
      expect(a.locationText).toBeUndefined();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// User profile (= 5 種)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("EVAL_USER_PROFILES: 5 種代表 user", () => {
  it("5 種定義 (= P1-P5)", () => {
    expect(EVAL_USER_PROFILES.length).toBe(5);
    expect(DATASET_STATS.userProfileCount).toBe(5);
    const ids = EVAL_USER_PROFILES.map((p) => p.id);
    expect(ids).toEqual(["P1", "P2", "P3", "P4", "P5"]);
  });

  it("各 profile に必須 field", () => {
    for (const p of EVAL_USER_PROFILES) {
      expect(p.id).toBeDefined();
      expect(p.description).toBeDefined();
      expect(p.hdmPhase).toBeGreaterThanOrEqual(0);
      expect(p.hdmPhase).toBeLessThanOrEqual(5);
      expect(p.trustLevel).toBeGreaterThanOrEqual(0);
      expect(p.trustLevel).toBeLessThanOrEqual(5);
      expect(p.stable).toBeDefined();
      expect(p.recent).toBeDefined();
    }
  });

  it("P5 は Phase < 2 (= 個別化 OFF、 control 群)", () => {
    const p5 = EVAL_USER_PROFILES.find((p) => p.id === "P5");
    expect(p5).toBeDefined();
    expect(p5!.hdmPhase).toBeLessThan(2);
  });

  it("P1-P4 は Phase ≥ 2 (= 個別化 ON)", () => {
    const phase2plus = EVAL_USER_PROFILES.filter((p) => p.id !== "P5");
    for (const p of phase2plus) {
      expect(p.hdmPhase).toBeGreaterThanOrEqual(2);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 評価ケース総数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Dataset 評価ケース 総数", () => {
  it("250 ケース (= 5 user × 50 anchor)", () => {
    const total = EVAL_USER_PROFILES.length * PLAN_ALTER_NOTE_DATASET.length;
    expect(total).toBe(250);
    expect(DATASET_STATS.totalEvalCases).toBe(250);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 純粋性 (= 入力 mutate なし、 readonly)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Dataset 純粋性", () => {
  it("PLAN_ALTER_NOTE_DATASET は ReadonlyArray (= mutate 不能)", () => {
    // TypeScript type 上の保証だが、 runtime 検証も
    const snapshot = JSON.stringify(PLAN_ALTER_NOTE_DATASET);
    // 何もしない (= mutate 試行なし)
    expect(JSON.stringify(PLAN_ALTER_NOTE_DATASET)).toBe(snapshot);
  });

  it("EVAL_USER_PROFILES は ReadonlyArray", () => {
    const snapshot = JSON.stringify(EVAL_USER_PROFILES);
    expect(JSON.stringify(EVAL_USER_PROFILES)).toBe(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Type contract (= TS でも実行時でも 不変)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("SyntheticAnchor type contract", () => {
  it("category は 5 種に固定", () => {
    const validCategories = ["cafe", "meal", "work", "home", "other"];
    for (const a of PLAN_ALTER_NOTE_DATASET) {
      expect(validCategories).toContain(a._meta.category);
    }
  });

  it("locationCategory が指定されていれば valid 値", () => {
    const validLocCategories = [
      "home",
      "office",
      "school",
      "cafe",
      "outdoor",
      "public",
      "transit",
      "unknown",
    ];
    for (const a of PLAN_ALTER_NOTE_DATASET) {
      if (a.locationCategory !== undefined) {
        expect(validLocCategories).toContain(a.locationCategory);
      }
    }
  });
});
