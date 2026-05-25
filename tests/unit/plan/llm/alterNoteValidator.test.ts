/**
 * Phase 3-N Plan P2 Step 1 — alterNote 出力 validator contract test
 *
 * 検証範囲 (= pure module 契約固定):
 *   - 5 段検証 (= empty / length / forbidden_word / forbidden_tone / forbidden_char)
 *   - 規約 24 + 禁止語 10 件 機械保証
 *   - 既存 deterministic 文体 (= List categoryMeaning) は **全て pass** すること
 *
 * 不変原則:
 *   - pure (= LLM 呼び出さない、 入力 mutate なし)
 */

import { describe, it, expect } from "vitest";
import { validateAlterNoteOutput } from "@/lib/plan/llm/alterNoteValidator";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 正常系 (= 既存 deterministic 文体は全 pass)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateAlterNoteOutput: 正常系", () => {
  it("既存 deterministic 文体 'カフェタイムで気分をリセットしましょう' は pass", () => {
    const result = validateAlterNoteOutput("カフェタイムで気分をリセットしましょう");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe("カフェタイムで気分をリセットしましょう");
    }
  });

  it("既存 deterministic 'ゆっくり休んで、明日への活力に' は pass", () => {
    const result = validateAlterNoteOutput("ゆっくり休んで、明日への活力に");
    expect(result.ok).toBe(true);
  });

  it("既存 virtual event '今日を始めるための家を出る時間' は pass", () => {
    const result = validateAlterNoteOutput("今日を始めるための家を出る時間");
    expect(result.ok).toBe(true);
  });

  it("前後 空白は trim される", () => {
    const result = validateAlterNoteOutput("  朝の集中時間  ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe("朝の集中時間");
    }
  });

  it("6 字 (= 最小境界) は pass", () => {
    const result = validateAlterNoteOutput("ひと息つく");  // 5 字 → fail
    expect(result.ok).toBe(false);
    const result6 = validateAlterNoteOutput("ひと息つく時");  // 6 字 → pass
    expect(result6.ok).toBe(true);
  });

  it("30 字 (= 最大境界) は pass", () => {
    const exactly30 = "あ".repeat(30);
    const result = validateAlterNoteOutput(exactly30);
    expect(result.ok).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// empty
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateAlterNoteOutput: empty reject", () => {
  it("空文字 → empty", () => {
    const result = validateAlterNoteOutput("");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("empty");
    }
  });

  it("空白のみ → empty", () => {
    const result = validateAlterNoteOutput("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("empty");
    }
  });

  it("全角空白のみ → empty", () => {
    const result = validateAlterNoteOutput("　　");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("empty");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// length
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateAlterNoteOutput: length reject", () => {
  it("5 字 → length_out_of_range", () => {
    const result = validateAlterNoteOutput("ひと息");  // 3 字
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("length_out_of_range");
    }
  });

  it("31 字 → length_out_of_range", () => {
    const exactly31 = "あ".repeat(31);
    const result = validateAlterNoteOutput(exactly31);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("length_out_of_range");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 禁止語 10 件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateAlterNoteOutput: forbidden_word reject", () => {
  it("「おすすめ」 hit → forbidden_word", () => {
    const result = validateAlterNoteOutput("おすすめのカフェタイム");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_word");
  });

  it("「これをした方がいい」 hit → forbidden_word", () => {
    const result = validateAlterNoteOutput("これをした方がいい時間");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_word");
  });

  it("「推奨」 hit → forbidden_word", () => {
    const result = validateAlterNoteOutput("推奨される午後の集中");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_word");
  });

  it("「最適」 hit → forbidden_word", () => {
    const result = validateAlterNoteOutput("最適な朝の準備時間");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_word");
  });

  it("「最適化」 hit → forbidden_word", () => {
    const result = validateAlterNoteOutput("時間の最適化を進める");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_word");
  });

  it("「改善」 hit → forbidden_word", () => {
    const result = validateAlterNoteOutput("流れを改善できる時間");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_word");
  });

  it("「警告」 hit → forbidden_word", () => {
    const result = validateAlterNoteOutput("予定が詰まりすぎ警告");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_word");
  });

  it("「危険」 hit → forbidden_word", () => {
    const result = validateAlterNoteOutput("無理は危険な状態です");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_word");
  });

  it("「注意」 hit → forbidden_word", () => {
    const result = validateAlterNoteOutput("注意したい移動時間");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_word");
  });

  it("「リスク」 hit → forbidden_word", () => {
    const result = validateAlterNoteOutput("リスクのある夜の予定");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_word");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 強い命令形 / 評価形容詞
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateAlterNoteOutput: forbidden_tone reject", () => {
  it("「しなさい」 → forbidden_tone", () => {
    // 「しなさい」 は強い命令形 (= List 規約 違反)
    const result = validateAlterNoteOutput("もっと集中しなさい朝に");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_tone");
  });

  it("「すべき」 → forbidden_tone", () => {
    const result = validateAlterNoteOutput("ペースを落とすべき時間");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_tone");
  });

  it("「重要」 → forbidden_tone", () => {
    const result = validateAlterNoteOutput("重要な会議の準備時間");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_tone");
  });

  it("「大事な」 → forbidden_tone", () => {
    const result = validateAlterNoteOutput("大事な朝の整え時間");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_tone");
  });

  it("「ベスト」 → forbidden_tone", () => {
    const result = validateAlterNoteOutput("ベストな進め方の朝");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_tone");
  });

  it("「ましょう」 単独は OK (= 緩めの誘い、 List 8b-8 で許可)", () => {
    const result = validateAlterNoteOutput("朝の集中時間を活かしましょう");
    expect(result.ok).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 数値 / 絵文字 / 改行
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateAlterNoteOutput: forbidden_char reject", () => {
  it("「30 分」 数値 → forbidden_char", () => {
    const result = validateAlterNoteOutput("30 分の集中時間が来た");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_char");
  });

  it("「2 時間」 数値 → forbidden_char", () => {
    const result = validateAlterNoteOutput("2 時間集中する午後の");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_char");
  });

  it("「78%」 → forbidden_char", () => {
    const result = validateAlterNoteOutput("78% の集中バランス");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_char");
  });

  it("絵文字 → forbidden_char", () => {
    const result = validateAlterNoteOutput("☕ カフェタイム朝の");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_char");
  });

  it("改行 → forbidden_char", () => {
    const result = validateAlterNoteOutput("カフェタイム\n朝の集中");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("forbidden_char");
  });

  it("「時間」 単独 (= 数字なし) は OK", () => {
    const result = validateAlterNoteOutput("集中時間の朝が来た");
    expect(result.ok).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 純粋性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateAlterNoteOutput: pure", () => {
  it("同入力 → 同結果 (= deterministic)", () => {
    const input = "朝のひと息ついて、ペースを整える";
    expect(validateAlterNoteOutput(input)).toEqual(validateAlterNoteOutput(input));
  });

  it("入力 mutate なし (= 入力文字列は不変)", () => {
    const input = "朝のカフェタイム";
    const original = input;
    validateAlterNoteOutput(input);
    expect(input).toBe(original);
  });
});
