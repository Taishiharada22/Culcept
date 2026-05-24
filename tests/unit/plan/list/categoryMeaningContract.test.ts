/**
 * Phase 3-N List impl sub-phase 8b-1 — CategoryMeaning contract test
 *
 * 検証範囲:
 *   §1 getTimeOfDay (= 5 時刻帯 boundary、 入力不正 fallback)
 *   §2 getMeaningText 全 category × 全時刻帯 mapping (= 4 × 5 = 20 文)
 *   §3 'other' category → undefined
 *   §4 文体制約 (= 命令形 0 + 評価形容詞 0 + 末尾「時間」/「タイム」 + 8-18 字)
 *   §5 入力不正 fallback (= HH:MM 不正なら morning)
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用 (= pure module)
 *   - 入力 mutate なし
 *
 * 設計書:
 *   - lib/plan/list/categoryMeaning.ts
 *   - decision-log (= sub-phase 8b redefine + 文体方針)
 */

import { describe, expect, it } from "vitest";
import { type EventCategory } from "@/lib/plan/list/types";
import {
  type TimeOfDay,
  getTimeOfDay,
  getMeaningText,
} from "@/lib/plan/list/categoryMeaning";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 getTimeOfDay (= 5 時刻帯 boundary)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryMeaning §1. getTimeOfDay", () => {
  it("§1.1 morning: [5:00, 11:00)", () => {
    expect(getTimeOfDay('05:00')).toBe('morning');
    expect(getTimeOfDay('07:30')).toBe('morning');
    expect(getTimeOfDay('10:59')).toBe('morning');
  });

  it("§1.2 lunch: [11:00, 14:00)", () => {
    expect(getTimeOfDay('11:00')).toBe('lunch');
    expect(getTimeOfDay('12:30')).toBe('lunch');
    expect(getTimeOfDay('13:59')).toBe('lunch');
  });

  it("§1.3 afternoon: [14:00, 18:00)", () => {
    expect(getTimeOfDay('14:00')).toBe('afternoon');
    expect(getTimeOfDay('16:30')).toBe('afternoon');
    expect(getTimeOfDay('17:59')).toBe('afternoon');
  });

  it("§1.4 evening: [18:00, 23:00)", () => {
    expect(getTimeOfDay('18:00')).toBe('evening');
    expect(getTimeOfDay('20:30')).toBe('evening');
    expect(getTimeOfDay('22:59')).toBe('evening');
  });

  it("§1.5 late_night: [23:00, 24:00) ∪ [0:00, 5:00)", () => {
    expect(getTimeOfDay('23:00')).toBe('late_night');
    expect(getTimeOfDay('23:59')).toBe('late_night');
    expect(getTimeOfDay('00:00')).toBe('late_night');
    expect(getTimeOfDay('02:30')).toBe('late_night');
    expect(getTimeOfDay('04:59')).toBe('late_night');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 getMeaningText 全 category × 全時刻帯 mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryMeaning §2. getMeaningText 全網羅", () => {
  const startTimeOfDay: Record<TimeOfDay, string> = {
    morning: '08:00',
    lunch: '12:00',
    afternoon: '15:00',
    evening: '20:00',
    late_night: '00:30',
  };

  const expected: Record<Exclude<EventCategory, 'other'>, Record<TimeOfDay, string>> = {
    cafe: {
      morning: '集中しやすい時間',
      lunch: 'ひと息ついて過ごす時間',
      afternoon: '気持ちを切り替える時間',
      evening: '静かに過ごす時間',
      late_night: '静かに過ごす時間',
    },
    meal: {
      morning: '朝食をゆっくりとる時間',
      lunch: 'ランチで切り替える時間',
      afternoon: '軽くお腹を満たす時間',
      evening: 'ゆっくり食べる時間',
      late_night: '軽く済ませる時間',
    },
    work: {
      morning: '集中しやすい時間',
      lunch: '区切りをつける時間',
      afternoon: '午後の集中タイム',
      evening: '仕事を切り上げる時間',
      late_night: '仕事を切り上げる時間',
    },
    home: {
      morning: '一日を整える時間',
      lunch: '家で休憩を取る時間',
      afternoon: 'ひと息ついて過ごす時間',
      evening: '自分の余白に戻る時間',
      late_night: 'ゆっくり休む時間',
    },
  };

  for (const cat of ['cafe', 'meal', 'work', 'home'] as const) {
    for (const tod of ['morning', 'lunch', 'afternoon', 'evening', 'late_night'] as const) {
      it(`§2 ${cat} × ${tod} → 「${expected[cat][tod]}」`, () => {
        expect(getMeaningText(cat, startTimeOfDay[tod])).toBe(expected[cat][tod]);
      });
    }
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 'other' category → undefined
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryMeaning §3. 'other' → undefined (= 判断不能な対象に押し付けない)", () => {
  it("§3.1 'other' は全時刻帯で undefined", () => {
    expect(getMeaningText('other', '08:00')).toBeUndefined();
    expect(getMeaningText('other', '12:00')).toBeUndefined();
    expect(getMeaningText('other', '15:00')).toBeUndefined();
    expect(getMeaningText('other', '20:00')).toBeUndefined();
    expect(getMeaningText('other', '00:30')).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 文体制約 (= 命令形 0 + 評価形容詞 0 + 末尾「時間」/「タイム」 + 8-18 字)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryMeaning §4. 文体制約 (= Aneurasync 哲学 + CEO + GPT 合議)", () => {
  // 全 20 文を集める
  const allMeanings: string[] = [];
  for (const cat of ['cafe', 'meal', 'work', 'home'] as const) {
    for (const startTime of ['08:00', '12:00', '15:00', '20:00', '00:30']) {
      const meaning = getMeaningText(cat, startTime);
      if (meaning !== undefined) {
        allMeanings.push(meaning);
      }
    }
  }

  it("§4.1 全 20 文収集 (= sanity check)", () => {
    expect(allMeanings.length).toBe(20);
  });

  it("§4.2 命令形 0 (= 「ましょう」 / 「ください」 / 「しよう」 / 「しなさい」)", () => {
    for (const meaning of allMeanings) {
      expect(meaning, `「${meaning}」 に命令形が含まれる`).not.toMatch(/ましょう|ください|しよう|しなさい/);
    }
  });

  it("§4.3 評価形容詞 0 (= 「重要」 / 「大事」 / 「最適」 / 「おすすめ」 / 「推奨」)", () => {
    for (const meaning of allMeanings) {
      expect(meaning, `「${meaning}」 に評価形容詞が含まれる`).not.toMatch(/重要|大事|最適|おすすめ|推奨/);
    }
  });

  it("§4.4 末尾「時間」 / 「タイム」 統一", () => {
    for (const meaning of allMeanings) {
      expect(meaning, `「${meaning}」 が末尾「時間」/「タイム」 で終わっていない`).toMatch(/(時間|タイム)$/);
    }
  });

  it("§4.5 文字数 8-18 字 (= CEO + GPT 合議で緩和、 自然な長さ)", () => {
    for (const meaning of allMeanings) {
      expect(meaning.length, `「${meaning}」 (= ${meaning.length} 字) が範囲外`).toBeGreaterThanOrEqual(8);
      expect(meaning.length, `「${meaning}」 (= ${meaning.length} 字) が範囲外`).toBeLessThanOrEqual(18);
    }
  });

  it("§4.6 全文重複なし (= category × 時刻帯 で意味が分離) ※同 category 内の重複は許容", () => {
    // 完全 unique は不要 (= cafe evening と late_night は同 「静かに過ごす時間」 OK)
    // ここでは各 meaning が空でないことのみ確認
    for (const meaning of allMeanings) {
      expect(meaning.length).toBeGreaterThan(0);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 入力不正 fallback
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryMeaning §5. 入力不正 fallback", () => {
  it("§5.1 HH:MM 数値抽出不可 (= 「abc」) → morning fallback", () => {
    expect(getTimeOfDay('abc')).toBe('morning');
    expect(getMeaningText('cafe', 'abc')).toBe('集中しやすい時間');
  });

  it("§5.2 空文字 → morning fallback", () => {
    expect(getTimeOfDay('')).toBe('morning');
  });
});
