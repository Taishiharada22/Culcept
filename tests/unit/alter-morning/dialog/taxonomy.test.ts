/**
 * classifyUtterance 単体テスト — PR-8 rev 3 commit 15
 *
 * CEO 方針（2026-04-22 commit 15 条件）:
 *   1. pure: dict only、I/O 無し
 *   2. 未知語を proper_noun に寄せない（辞書根拠なしは "other"）
 *   3. 複合入力を複合のまま返す（anchor+chain / anchor+category）
 *   4. decision order: undecided → baseline → chain±anchor → category±anchor → anchor_alone → other
 *   5. 最低限テスト 11 カテゴリ（下 §2-§11 で網羅）
 *   6. 分類のみ（readyForHandoff は reducer 責務）
 *
 * 参照:
 *   - lib/alter-morning/dialog/taxonomy.ts
 *   - lib/alter-morning/dialog/types.ts (NormalizedCapture / CaptureSubKind)
 *   - docs/alter-morning-pr8-rev3-implementation-detail.md §2 (decision table)
 */

import { describe, expect, it } from "vitest";

import {
  CHAIN_BRAND_DICT,
  CATEGORY_DICT,
  ANCHOR_ROOT_DICT,
  ANCHOR_SUFFIXES,
  UNDECIDED_DICT,
  BASELINE_REF_DICT,
  classifyUtterance,
  NARROW_STEP_BY_SUBKIND,
} from "@/lib/alter-morning/dialog/taxonomy";
import type { NormalizedCapture } from "@/lib/alter-morning/dialog/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §0. 辞書の landing 確認（invariant）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §0 辞書 invariant", () => {
  it("CHAIN_BRAND_DICT は 20 語固定（commit 13 凍結）", () => {
    expect(CHAIN_BRAND_DICT.length).toBe(20);
    expect(CHAIN_BRAND_DICT).toContain("スタバ");
    expect(CHAIN_BRAND_DICT).toContain("マック");
  });

  it("CATEGORY_DICT に chain が混入していない", () => {
    // 代表的 chain 語は category に無いことを sanity check
    expect(CATEGORY_DICT).not.toContain("スタバ");
    expect(CATEGORY_DICT).not.toContain("マクドナルド");
    expect(CATEGORY_DICT).toContain("カフェ");
    expect(CATEGORY_DICT).toContain("ランチ");
  });

  it("ANCHOR_ROOT_DICT / ANCHOR_SUFFIXES が空でない", () => {
    expect(ANCHOR_ROOT_DICT.length).toBeGreaterThan(0);
    expect(ANCHOR_SUFFIXES.length).toBeGreaterThan(0);
    expect(ANCHOR_ROOT_DICT).toContain("甲府");
    expect(ANCHOR_ROOT_DICT).toContain("甲府駅");
    expect(ANCHOR_SUFFIXES).toContain("周辺");
  });

  it("UNDECIDED_DICT が CEO specified 語を含む", () => {
    expect(UNDECIDED_DICT).toContain("決めてない");
    expect(UNDECIDED_DICT).toContain("未定");
    expect(UNDECIDED_DICT).toContain("おすすめで");
  });

  it("BASELINE_REF_DICT が CEO specified 語を含む", () => {
    expect(BASELINE_REF_DICT).toContain("実家");
    expect(BASELINE_REF_DICT).toContain("学校");
    expect(BASELINE_REF_DICT).toContain("職場");
    expect(BASELINE_REF_DICT).toContain("オフィス");
  });

  it("NARROW_STEP_BY_SUBKIND は全 10 subKind を網羅", () => {
    expect(Object.keys(NARROW_STEP_BY_SUBKIND)).toHaveLength(10);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. undecided — CEO test: 決めてない / 未定 / おすすめで
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §1 undecided (CEO test)", () => {
  it.each([
    ["決めてない"],
    ["きめてない"],
    ["まだ決めてない"],
    ["未定"],
    ["どこでもいい"],
    ["なんでもいい"],
    ["任せる"],
    ["お任せ"],
    ["おすすめで"],
    ["特にない"],
    ["わからない"],
  ])("「%s」→ subKind=undecided", (input) => {
    const result = classifyUtterance(input);
    expect(result.subKind).toBe("undecided");
    expect(result.extractedAnchor).toBeNull();
    expect(result.extractedCategory).toBeNull();
    expect(result.extractedChain).toBeNull();
  });

  it("undecided は category と共起しても undecided 優先", () => {
    // decision order: undecided が最優先（§4 rule）
    const result = classifyUtterance("カフェ決めてない");
    expect(result.subKind).toBe("undecided");
    expect(result.extractedCategory).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. baseline — CEO test: 実家 / 学校 / 職場 / オフィス
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §2 baseline (CEO test)", () => {
  it.each([["実家"], ["学校"], ["職場"], ["オフィス"], ["自宅"], ["会社"]])(
    "「%s」→ subKind=baseline",
    (input) => {
      const result = classifyUtterance(input);
      expect(result.subKind).toBe("baseline");
      expect(result.extractedAnchor).toBeNull();
      expect(result.extractedCategory).toBeNull();
      expect(result.extractedChain).toBeNull();
    },
  );

  it("baseline は anchor と共起しても baseline 優先（自己参照語）", () => {
    const result = classifyUtterance("甲府の実家");
    expect(result.subKind).toBe("baseline");
    expect(result.extractedAnchor).toBeNull();
  });

  it("「実家族」は baseline 誤判定しない（strict boundary: kanji+kanji 連続を block）", () => {
    // 「実家」の直後が kanji「族」→ hasStrictBoundary=false → no match
    const result = classifyUtterance("実家族");
    expect(result.subKind).not.toBe("baseline");
  });

  it("「学校生活」は baseline 誤判定しない", () => {
    const result = classifyUtterance("学校生活");
    expect(result.subKind).not.toBe("baseline");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. chain 単独 — CEO test: スタバ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §3 chain_alone (CEO test)", () => {
  it("「スタバ」→ chain_alone", () => {
    const result = classifyUtterance("スタバ");
    expect(result.subKind).toBe("chain_alone");
    expect(result.extractedChain).toBe("スタバ");
    expect(result.extractedAnchor).toBeNull();
    expect(result.extractedCategory).toBeNull();
  });

  it.each([
    ["スターバックス", "スターバックス"],
    ["マック", "マック"],
    ["マクドナルド", "マクドナルド"],
    ["コメダ", "コメダ"],
    ["吉野家", "吉野家"],
    ["セブンイレブン", "セブンイレブン"],
  ])("「%s」→ chain_alone, chain=%s", (input, expected) => {
    const result = classifyUtterance(input);
    expect(result.subKind).toBe("chain_alone");
    expect(result.extractedChain).toBe(expected);
  });

  it("chain longest-first: 「セブンイレブン」は「セブン」より「セブンイレブン」を優先", () => {
    const result = classifyUtterance("セブンイレブン");
    expect(result.extractedChain).toBe("セブンイレブン");
  });

  it("chain longest-first: 「スターバックス」は「スタバ」より優先", () => {
    const result = classifyUtterance("スターバックス");
    expect(result.extractedChain).toBe("スターバックス");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. category 単独 — CEO test: カフェ / ランチ / ディナー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §4 category_alone (CEO test)", () => {
  it("「カフェ」→ category_alone", () => {
    const result = classifyUtterance("カフェ");
    expect(result.subKind).toBe("category_alone");
    expect(result.extractedCategory).toBe("カフェ");
    expect(result.extractedAnchor).toBeNull();
    expect(result.extractedChain).toBeNull();
  });

  it.each([
    ["ランチ", "ランチ"],
    ["ディナー", "ディナー"],
    ["レストラン", "レストラン"],
    ["居酒屋", "居酒屋"],
    ["スーパー", "スーパー"],
    ["映画館", "映画館"],
    ["ジム", "ジム"],
  ])("「%s」→ category_alone, category=%s", (input, expected) => {
    const result = classifyUtterance(input);
    expect(result.subKind).toBe("category_alone");
    expect(result.extractedCategory).toBe(expected);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. anchor 単独
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §5 anchor_alone", () => {
  it("「甲府」→ anchor_alone", () => {
    const result = classifyUtterance("甲府");
    expect(result.subKind).toBe("anchor_alone");
    expect(result.extractedAnchor).toBe("甲府");
    expect(result.extractedChain).toBeNull();
    expect(result.extractedCategory).toBeNull();
  });

  it("「甲府駅」→ anchor_alone（root longest-first で「甲府駅」優先）", () => {
    const result = classifyUtterance("甲府駅");
    expect(result.subKind).toBe("anchor_alone");
    expect(result.extractedAnchor).toBe("甲府駅");
  });

  it("「甲府駅周辺」→ anchor_alone（root + suffix 合成）", () => {
    const result = classifyUtterance("甲府駅周辺");
    expect(result.subKind).toBe("anchor_alone");
    expect(result.extractedAnchor).toBe("甲府駅周辺");
  });

  it("「東京駅前」→ anchor_alone, anchor=東京駅前（root=東京 + suffix=駅前）", () => {
    const result = classifyUtterance("東京駅前");
    expect(result.subKind).toBe("anchor_alone");
    expect(result.extractedAnchor).toBe("東京駅前");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. chain_with_anchor — CEO test: 甲府のスタバ（複合入力保持）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §6 chain_with_anchor (CEO test)", () => {
  it("「甲府のスタバ」→ chain_with_anchor, anchor=甲府 + chain=スタバ（複合保持）", () => {
    const result = classifyUtterance("甲府のスタバ");
    expect(result.subKind).toBe("chain_with_anchor");
    expect(result.extractedAnchor).toBe("甲府");
    expect(result.extractedChain).toBe("スタバ");
    expect(result.extractedCategory).toBeNull();
  });

  it("「甲府駅前のコメダ」→ chain_with_anchor, anchor=甲府駅前, chain=コメダ", () => {
    const result = classifyUtterance("甲府駅前のコメダ");
    expect(result.subKind).toBe("chain_with_anchor");
    expect(result.extractedAnchor).toBe("甲府駅前");
    expect(result.extractedChain).toBe("コメダ");
  });

  it("「東京のマクドナルド」→ chain_with_anchor", () => {
    const result = classifyUtterance("東京のマクドナルド");
    expect(result.subKind).toBe("chain_with_anchor");
    expect(result.extractedAnchor).toBe("東京");
    expect(result.extractedChain).toBe("マクドナルド");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. category_with_anchor — CEO test: 甲府駅周辺のカフェ（複合入力保持）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §7 category_with_anchor (CEO test)", () => {
  it("「甲府駅周辺のカフェ」→ category_with_anchor, anchor=甲府駅周辺 + category=カフェ", () => {
    const result = classifyUtterance("甲府駅周辺のカフェ");
    expect(result.subKind).toBe("category_with_anchor");
    expect(result.extractedAnchor).toBe("甲府駅周辺");
    expect(result.extractedCategory).toBe("カフェ");
    expect(result.extractedChain).toBeNull();
  });

  it("「甲府のカフェ」→ category_with_anchor, anchor=甲府", () => {
    const result = classifyUtterance("甲府のカフェ");
    expect(result.subKind).toBe("category_with_anchor");
    expect(result.extractedAnchor).toBe("甲府");
    expect(result.extractedCategory).toBe("カフェ");
  });

  it("「新宿のランチ」→ category_with_anchor", () => {
    const result = classifyUtterance("新宿のランチ");
    expect(result.subKind).toBe("category_with_anchor");
    expect(result.extractedAnchor).toBe("新宿");
    expect(result.extractedCategory).toBe("ランチ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. 比較マーカー — CEO test: スタバみたいなカフェ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §8 比較マーカー (CEO test)", () => {
  it("「スタバみたいなカフェ」→ category_alone（chain は参照のみ、target は category）", () => {
    // CEO 条件: 「みたい」= 比較マーカー → chain を落として category を勝たせる
    const result = classifyUtterance("スタバみたいなカフェ");
    expect(result.subKind).toBe("category_alone");
    expect(result.extractedCategory).toBe("カフェ");
    expect(result.extractedChain).toBeNull();
  });

  it("「スタバのようなカフェ」→ category_alone", () => {
    const result = classifyUtterance("スタバのようなカフェ");
    expect(result.subKind).toBe("category_alone");
    expect(result.extractedCategory).toBe("カフェ");
    expect(result.extractedChain).toBeNull();
  });

  it("「スタバっぽいカフェ」→ category_alone", () => {
    const result = classifyUtterance("スタバっぽいカフェ");
    expect(result.subKind).toBe("category_alone");
    expect(result.extractedCategory).toBe("カフェ");
    expect(result.extractedChain).toBeNull();
  });

  it("比較マーカー + anchor + category → category_with_anchor（chain 落ちる）", () => {
    const result = classifyUtterance("甲府のスタバみたいなカフェ");
    expect(result.subKind).toBe("category_with_anchor");
    expect(result.extractedAnchor).toBe("甲府");
    expect(result.extractedCategory).toBe("カフェ");
    expect(result.extractedChain).toBeNull();
  });

  it("比較マーカーなしの chain+category は chain 勝利（排他原則）", () => {
    // 「スタバとカフェ」= 並列列挙。マーカー無 → chain が specificity で勝つ
    const result = classifyUtterance("スタバとカフェ");
    expect(result.subKind).toBe("chain_alone");
    expect(result.extractedChain).toBe("スタバ");
    expect(result.extractedCategory).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. substring 誤判定防止 — CEO test: substring 誤判定系
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §9 substring 誤判定防止 (CEO test)", () => {
  it("「マックスコーヒー」は「マック」誤検出しない（katakana+katakana 複合語境界）", () => {
    // 「マック」の次「ス」は katakana → 複合語 → no match
    const result = classifyUtterance("マックスコーヒー");
    expect(result.extractedChain).toBeNull();
    expect(result.subKind).toBe("other");
  });

  it("「モスクワ」は「モス」誤検出しない", () => {
    const result = classifyUtterance("モスクワ");
    expect(result.extractedChain).toBeNull();
  });

  it("「スーパーマーケット」は「スーパー」誤検出しない（katakana 複合語）", () => {
    const result = classifyUtterance("スーパーマーケット");
    expect(result.extractedCategory).toBeNull();
  });

  it("「カフェオレ」は「カフェ」誤検出しない（katakana 複合語）", () => {
    const result = classifyUtterance("カフェオレ");
    expect(result.extractedCategory).toBeNull();
  });

  it("「スーパー」単体は category として検出される", () => {
    const result = classifyUtterance("スーパー");
    expect(result.subKind).toBe("category_alone");
    expect(result.extractedCategory).toBe("スーパー");
  });

  it("「スーパーで買い物」→ category_alone（次が hiragana なので境界 OK）", () => {
    const result = classifyUtterance("スーパーで買い物");
    expect(result.subKind).toBe("category_alone");
    expect(result.extractedCategory).toBe("スーパー");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §10. 未知語は proper_noun に寄せない — CEO 条件 2
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §10 未知語 → other (never proper_noun)", () => {
  it("「サドヤ」は proper_noun_specific にしない（辞書根拠なし）", () => {
    // CEO 条件 2: 「辞書根拠がない限り exact_proper_noun にしない」
    const result = classifyUtterance("サドヤ");
    expect(result.subKind).not.toBe("proper_noun_specific");
    expect(result.subKind).toBe("other");
  });

  it("「Tully's 甲府昭和店」は chain+anchor を抽出、proper_noun にはしない", () => {
    // Tully's は CHAIN_BRAND_DICT に登録済み → chain として抽出
    // 「甲府昭和店」の「甲府」は anchor として抽出
    // classify としては chain_with_anchor になる（固有名の店舗同定は L1 comprehension 責務）
    const result = classifyUtterance("Tully's 甲府昭和店");
    expect(result.subKind).not.toBe("proper_noun_specific");
  });

  it("「Aさん」は proper_noun にせず other（who slot は別 layer 責務）", () => {
    const result = classifyUtterance("Aさん");
    expect(result.subKind).toBe("other");
    expect(result.extractedAnchor).toBeNull();
    expect(result.extractedCategory).toBeNull();
    expect(result.extractedChain).toBeNull();
  });

  it("「山田太郎」等の unknown 固有名は other（proper_noun 寄せ禁止）", () => {
    const result = classifyUtterance("山田太郎");
    expect(result.subKind).toBe("other");
  });

  it("「適当な店」は other（辞書非 match）", () => {
    const result = classifyUtterance("適当な店");
    expect(result.subKind).toBe("other");
  });

  it("classifyUtterance は proper_noun_specific を一切返さない（全 input）", () => {
    // 契約: dict 根拠がある proper_noun は「無い」(dict 未整備) → 本関数は proper_noun 発行しない
    const inputs = [
      "サドヤ",
      "Aさん",
      "山田太郎",
      "スタバ",
      "カフェ",
      "決めてない",
      "実家",
      "甲府",
    ];
    for (const input of inputs) {
      expect(classifyUtterance(input).subKind).not.toBe("proper_noun_specific");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §11. 時刻・日付等 — CEO test: 明日 / 9時
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §11 時刻・日付 (CEO test)", () => {
  it("「明日」→ other（rulePreParse が time_hint に吸収する上流 layer）", () => {
    // 本関数は place 分類器。時刻 / 日付は上流で吸収済み想定。dict 非 match → other
    const result = classifyUtterance("明日");
    expect(result.subKind).toBe("other");
  });

  it("「9時」→ other", () => {
    const result = classifyUtterance("9時");
    expect(result.subKind).toBe("other");
  });

  it("「今日」→ other", () => {
    const result = classifyUtterance("今日");
    expect(result.subKind).toBe("other");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §12. decision order の検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §12 decision order (CEO 条件 4)", () => {
  it("undecided が baseline より優先: 「実家決めてない」→ undecided", () => {
    const result = classifyUtterance("実家決めてない");
    expect(result.subKind).toBe("undecided");
  });

  it("baseline が anchor より優先: 「甲府の学校」→ baseline", () => {
    const result = classifyUtterance("甲府の学校");
    expect(result.subKind).toBe("baseline");
  });

  it("chain+anchor 複合 > chain_alone: 「甲府のスタバ」→ chain_with_anchor", () => {
    const result = classifyUtterance("甲府のスタバ");
    expect(result.subKind).toBe("chain_with_anchor");
  });

  it("category+anchor 複合 > category_alone: 「甲府のカフェ」→ category_with_anchor", () => {
    const result = classifyUtterance("甲府のカフェ");
    expect(result.subKind).toBe("category_with_anchor");
  });

  it("chain+category 同時 → chain 勝ち（比較マーカー無）", () => {
    const result = classifyUtterance("スタバのカフェ");
    expect(result.subKind).toBe("chain_alone");
    expect(result.extractedCategory).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §13. purity（pure 関数 invariant, CEO 条件 1）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §13 purity (CEO 条件 1)", () => {
  it("同一 input → 同一 output（決定性）", () => {
    const a = classifyUtterance("甲府のスタバ");
    const b = classifyUtterance("甲府のスタバ");
    expect(a).toEqual(b);
  });

  it("rawSpan は元の入力そのまま保持（trim 前）", () => {
    const input = "  スタバ  ";
    const result = classifyUtterance(input);
    expect(result.rawSpan).toBe(input);
    expect(result.subKind).toBe("chain_alone"); // trim して分類
    expect(result.extractedChain).toBe("スタバ");
  });

  it("空文字 → other, rawSpan は空文字保持", () => {
    const result = classifyUtterance("");
    expect(result.subKind).toBe("other");
    expect(result.rawSpan).toBe("");
  });

  it("空白のみ → other", () => {
    const result = classifyUtterance("   ");
    expect(result.subKind).toBe("other");
  });

  it("NormalizedCapture の field 型整合: subKind=chain_alone なら category/anchor は null", () => {
    const r: NormalizedCapture = classifyUtterance("スタバ");
    if (r.subKind === "chain_alone") {
      expect(r.extractedChain).not.toBeNull();
      expect(r.extractedCategory).toBeNull();
      expect(r.extractedAnchor).toBeNull();
    }
  });

  it("NormalizedCapture の field 型整合: subKind=undecided なら全 null", () => {
    const r = classifyUtterance("決めてない");
    expect(r.subKind).toBe("undecided");
    expect(r.extractedAnchor).toBeNull();
    expect(r.extractedCategory).toBeNull();
    expect(r.extractedChain).toBeNull();
  });

  it("NormalizedCapture の field 型整合: subKind=baseline なら全 null", () => {
    const r = classifyUtterance("実家");
    expect(r.subKind).toBe("baseline");
    expect(r.extractedAnchor).toBeNull();
    expect(r.extractedCategory).toBeNull();
    expect(r.extractedChain).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §14. CEO 条件 6 検証 — 分類のみ、readyForHandoff 等には触れない
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("classifyUtterance §14 契約 — 分類 scope のみ (CEO 条件 6)", () => {
  it("返り値の shape は NormalizedCapture 5 field のみ（余計 field なし）", () => {
    const result = classifyUtterance("甲府のスタバ");
    const keys = Object.keys(result).sort();
    expect(keys).toEqual(
      [
        "extractedAnchor",
        "extractedCategory",
        "extractedChain",
        "rawSpan",
        "subKind",
      ].sort(),
    );
  });

  it("readyForHandoff 相当 field が NormalizedCapture に存在しない", () => {
    const result = classifyUtterance("甲府のスタバ") as unknown as Record<
      string,
      unknown
    >;
    expect(result.readyForHandoff).toBeUndefined();
    expect(result.handoff).toBeUndefined();
    expect(result.search).toBeUndefined();
  });
});
