/**
 * Phase 3-N List impl sub-phase 8b-5 corrective — CategoryInference contract test
 *
 * 検証範囲:
 *   §1 各 category keyword hit (= cafe / meal / work / home)
 *   §2 first-match 順序 (= meal > work > cafe > home、 重複 hit 時の挙動)
 *   §3 keyword 不在 → undefined
 *   §4 大文字小文字混在 cafe (= 'CAFE' / 'Cafe' / 'cafe')
 *   §5 pure 検証 (= 入力 mutate なし、 deterministic)
 *
 * 不変原則:
 *   - LLM / API / DB / network 不使用
 *   - 入力 mutate なし
 *   - 'other' は inferCategoryFromText の return には含まれない (= 「判断不能」 = undefined)
 *
 * 設計書:
 *   - lib/plan/list/categoryInference.ts
 *   - decision-log (= 8b-5 corrective patch)
 */

import { describe, expect, it } from "vitest";
import { inferCategoryFromText } from "@/lib/plan/list/categoryInference";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 各 category keyword hit
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryInference §1. 各 category keyword hit", () => {
  it("§1.1 cafe: 「カフェで一息」 → 'cafe' (= 「作業」 不在で cafe 単独 hit)", () => {
    expect(inferCategoryFromText('カフェで一息')).toBe('cafe');
  });

  it("§1.2 cafe: 「スタバで朝の準備」 (= スタバ hit) → 'cafe'", () => {
    // スタバ + 朝/準備 はどちらも meal/work hit しない、 'スタバ' で cafe
    expect(inferCategoryFromText('スタバで朝の準備')).toBe('cafe');
  });

  it("§1.3 meal: 「会食 ふきぬき成田店」 → 'meal' (= CEO dogfood real case)", () => {
    expect(inferCategoryFromText('会食 ふきぬき成田店')).toBe('meal');
  });

  it("§1.4 meal: 「ランチ」 → 'meal'", () => {
    expect(inferCategoryFromText('ランチ')).toBe('meal');
  });

  it("§1.5 work: 「週次ミーティング」 → 'work' (= CEO dogfood real case)", () => {
    expect(inferCategoryFromText('週次ミーティング')).toBe('work');
  });

  it("§1.6 work: 「会議」 → 'work'", () => {
    expect(inferCategoryFromText('会議')).toBe('work');
  });

  it("§1.7 work: 「シフト」 → 'work'", () => {
    expect(inferCategoryFromText('シフト')).toBe('work');
  });

  it("§1.8 home: 「自宅で休む」 → 'home'", () => {
    expect(inferCategoryFromText('自宅で休む')).toBe('home');
  });

  it("§1.9 home: 「帰宅」 → 'home'", () => {
    expect(inferCategoryFromText('帰宅')).toBe('home');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 first-match 順序 (= meal > work > cafe > home)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryInference §2. first-match 順序 (= meal > work > cafe > home)", () => {
  it("§2.1 「ランチミーティング」 → meal (= 行動本体優先、 work より meal)", () => {
    expect(inferCategoryFromText('ランチミーティング')).toBe('meal');
  });

  it("§2.2 「会食打ち合わせ」 → meal (= meal 優先)", () => {
    expect(inferCategoryFromText('会食打ち合わせ')).toBe('meal');
  });

  it("§2.3 「会議 in カフェ」 → work (= work が cafe より先、 meal hit せず)", () => {
    expect(inferCategoryFromText('会議 in カフェ')).toBe('work');
  });

  it("§2.4 「カフェで自宅作業」 → cafe (= cafe が home より先、 work も 「作業」 で hit するが順序で work)", () => {
    // 「作業」 は work keyword、 first-match なので 'work' を期待
    // 期待: meal hit なし、 work hit (作業) なので 'work'
    expect(inferCategoryFromText('カフェで自宅作業')).toBe('work');
  });

  it("§2.5 「カフェで自宅休憩」 → cafe (= meal/work hit せず、 cafe が home より先)", () => {
    expect(inferCategoryFromText('カフェで自宅休憩')).toBe('cafe');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 keyword 不在 → undefined
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryInference §3. keyword 不在 → undefined", () => {
  it("§3.1 「散歩」 → undefined", () => {
    expect(inferCategoryFromText('散歩')).toBeUndefined();
  });

  it("§3.2 「映画鑑賞」 → undefined", () => {
    expect(inferCategoryFromText('映画鑑賞')).toBeUndefined();
  });

  it("§3.3 空文字 → undefined", () => {
    expect(inferCategoryFromText('')).toBeUndefined();
  });

  it("§3.4 短い text 「あ」 → undefined", () => {
    expect(inferCategoryFromText('あ')).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 大文字小文字混在 cafe
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryInference §4. 大文字小文字混在 cafe", () => {
  it("§4.1 「cafe」 (lowercase) → 'cafe'", () => {
    expect(inferCategoryFromText('cafe')).toBe('cafe');
  });

  it("§4.2 「Cafe」 (Pascal) → 'cafe'", () => {
    expect(inferCategoryFromText('Cafe')).toBe('cafe');
  });

  it("§4.3 「CAFE」 (uppercase) → 'cafe'", () => {
    expect(inferCategoryFromText('CAFE')).toBe('cafe');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 pure 検証 (= 入力 mutate なし、 deterministic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryInference §5. pure 検証", () => {
  it("§5.1 同入力 → 同出力 (= deterministic)", () => {
    expect(inferCategoryFromText('週次ミーティング')).toBe(inferCategoryFromText('週次ミーティング'));
    expect(inferCategoryFromText('散歩')).toBe(inferCategoryFromText('散歩'));
  });

  it("§5.2 入力 string そのものを mutate しない (= JS string immutable で自動だが念のため)", () => {
    const input = '週次ミーティング';
    inferCategoryFromText(input);
    expect(input).toBe('週次ミーティング');
  });
});
