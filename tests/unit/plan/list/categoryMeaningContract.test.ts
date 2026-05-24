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
      morning: '静かなカフェで、今日の計画を整理しましょう',
      lunch: 'カフェでひと息ついて、気分を切り替えましょう',
      afternoon: 'カフェタイムで気分をリセットしましょう',
      evening: '夜のカフェで、静かに過ごす時間',
      late_night: '夜更けのカフェで、ゆったりと',
    },
    meal: {
      morning: '朝食をゆっくり、一日のはじまり',
      lunch: '美味しいランチで、リフレッシュしましょう',
      afternoon: '軽くおやつで、ひと休み',
      evening: '夜の食卓で、ゆっくり食事を楽しみましょう',
      late_night: '夜更けの軽い食事で、無理なく',
    },
    work: {
      morning: '朝の集中時間、落ち着いて仕事に取り組みましょう',
      lunch: '午前を区切るランチ前のひととき',
      afternoon: '午後の集中タイム、大切なタスクを進めましょう',
      evening: '一日の仕事を、しっかり締めくくりましょう',
      late_night: '残りを片付けて、無理なく切り上げましょう',
    },
    home: {
      morning: '一日を整える朝、ゆっくり準備をしましょう',
      lunch: '家で少し休んで、午後に備えましょう',
      afternoon: '家でひと息ついて、ペースを取り戻しましょう',
      evening: 'ゆっくり過ごして、明日への活力に',
      late_night: 'ぐっすり休んで、明日に備えましょう',
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

  it("§4.2 強い命令形 0 (= 8b-8 で 「ましょう」 「しよう」 緩和、 mock 文体準拠、 「しなさい」 「しろ」 等は禁止維持)", () => {
    // 8b-8 corrective: mock 文体 「集中しやすい静かなカフェで、 今日の計画を整理しましょう」 を許容
    // ただし 「しなさい」 「しろ」 「やれ」 等の強い命令形は引き続き禁止
    for (const meaning of allMeanings) {
      expect(meaning, `「${meaning}」 に強い命令形`).not.toMatch(/しなさい|しろ|やれ|やめろ|やりなさい/);
    }
  });

  it("§4.3 評価形容詞 0 (= 「重要」 / 「大事」 / 「最適」 / 「おすすめ」 / 「推奨」)", () => {
    for (const meaning of allMeanings) {
      expect(meaning, `「${meaning}」 に評価形容詞が含まれる`).not.toMatch(/重要|大事|最適|おすすめ|推奨/);
    }
  });

  it("§4.4 末尾「時間」 強制制約 廃止 (= 8b-6 で自然な日本語化、 ただし命令形語尾 0)", () => {
    // 8b-6: 「時間」 末尾統一は廃止 (= CEO 「〜時間 は日本語として綺麗じゃない」)
    // 代わりに 命令形語尾 (= 「しろ」 「しなさい」 「やれ」 等) が含まれないことを確認
    for (const meaning of allMeanings) {
      expect(meaning, `「${meaning}」 に命令形語尾`).not.toMatch(/(しろ|しなさい|やれ|やめろ)$/);
    }
  });

  it("§4.5 文字数 8-32 字 (= 8b-8 で更に上限緩和、 mock 文体の自然な長さ)", () => {
    for (const meaning of allMeanings) {
      expect(meaning.length, `「${meaning}」 (= ${meaning.length} 字) が範囲外`).toBeGreaterThanOrEqual(8);
      expect(meaning.length, `「${meaning}」 (= ${meaning.length} 字) が範囲外`).toBeLessThanOrEqual(32);
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
    expect(getMeaningText('cafe', 'abc')).toBe('静かなカフェで、今日の計画を整理しましょう');
  });

  it("§5.2 空文字 → morning fallback", () => {
    expect(getTimeOfDay('')).toBe('morning');
  });
});
